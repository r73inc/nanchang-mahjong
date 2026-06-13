import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

/**
 * NanchangStack — full production infrastructure for ap-east-1 (Hong Kong).
 *
 * Deploy in two phases to avoid the ECR chicken-and-egg problem:
 *
 *   Phase 1 — infrastructure only (no App Runner, ECR repo created):
 *     cdk deploy
 *
 *   Phase 2 — after pushing the first Docker image to ECR:
 *     cdk deploy --context deployApi=true
 *
 * See docs/DEPLOYMENT.md for the full step-by-step guide.
 *
 * Resources:
 *   - DynamoDB single-table (nanchang_main) with GSI1 + TTL
 *   - S3 replay bucket (lifecycle → Glacier after 1 yr)
 *   - S3 avatar bucket (private, presigned-URL access)
 *   - S3 web bucket (private, served via CloudFront OAC)
 *   - ECR repository for the NestJS API Docker image
 *   - Secrets Manager (JWT secrets auto-generated; VAPID keys require manual update)
 *   - App Runner service (only when deployApi=true context is set)
 *   - CloudFront distribution:
 *       /* → S3 web bucket (SPA, serves index.html on 403/404)
 *       /api/* → App Runner (CloudFront Function strips /api prefix)
 *       /socket.io* → App Runner (WebSocket capable)
 *   - IAM roles: ECR access role + App Runner instance role
 */
export class NanchangStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Whether to create the App Runner service + API CloudFront behaviors.
    // Set to false on first deploy (ECR image doesn't exist yet).
    // Set to true after pushing the first Docker image: cdk deploy --context deployApi=true
    const deployApi = this.node.tryGetContext('deployApi') === 'true';

    // ── DynamoDB (single-table design) ────────────────────────────────────────
    // PK / SK primary key. GSI1 covers:
    //   - invitesByStatus: gsi1pk = INVITE_STATUS#<status>
    //   - roomByCode:      gsi1pk = ROOM_CODE#<code>, gsi1sk = META
    const table = new dynamodb.Table(this, 'MainTable', {
      tableName: 'nanchang_main',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    table.addGlobalSecondaryIndex({
      indexName: 'gsi1',
      partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── S3 Buckets ─────────────────────────────────────────────────────────────

    // Replay bucket — stores per-game JSON blobs; archived to Glacier after 1yr
    const replayBucket = new s3.Bucket(this, 'ReplayBucket', {
      bucketName: `nanchang-replays-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(365),
            },
          ],
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Avatar bucket — stores user profile images; accessed via presigned URLs
    const avatarBucket = new s3.Bucket(this, 'AvatarBucket', {
      bucketName: `nanchang-avatars-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Web hosting bucket — private; served exclusively through CloudFront
    const webBucket = new s3.Bucket(this, 'WebBucket', {
      bucketName: `nanchang-web-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      // Destroy + autoDeleteObjects so CI/CD can do a clean sync on each deploy
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ── ECR Repository ─────────────────────────────────────────────────────────
    const ecrRepo = new ecr.Repository(this, 'ApiRepo', {
      repositoryName: 'nanchang-api',
      lifecycleRules: [
        {
          maxImageCount: 10,
          description: 'Keep only the 10 most recent images',
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── Secrets Manager ────────────────────────────────────────────────────────
    // JWT secrets are auto-generated by CDK; VAPID keys require manual update
    // after initial deploy (see DEPLOYMENT.md §3).

    const jwtSecret = new secretsmanager.Secret(this, 'JwtSecret', {
      secretName: 'nanchang/jwt-secret',
      description: 'JWT access token signing secret for Nanchang API',
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 64,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const jwtRefreshSecret = new secretsmanager.Secret(this, 'JwtRefreshSecret', {
      secretName: 'nanchang/jwt-refresh-secret',
      description: 'JWT refresh token signing secret for Nanchang API',
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 64,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // VAPID keys must be generated externally and stored here before App Runner starts.
    // Generate with: npx web-push generate-vapid-keys
    // Then update this secret in the AWS console with a JSON object:
    //   { "publicKey": "...", "privateKey": "..." }
    const vapidKeys = new secretsmanager.Secret(this, 'VapidKeys', {
      secretName: 'nanchang/vapid-keys',
      description:
        'VAPID key pair for web push notifications. ' +
        'Replace placeholder with output of: npx web-push generate-vapid-keys',
      secretStringValue: cdk.SecretValue.unsafePlainText(
        JSON.stringify({
          publicKey: 'REPLACE_ME_with_npx_web-push_generate-vapid-keys_output',
          privateKey: 'REPLACE_ME_with_npx_web-push_generate-vapid-keys_output',
        }),
      ),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── IAM Roles ─────────────────────────────────────────────────────────────

    // ECR access role — used by the App Runner control plane to pull images
    // and to inject Secrets Manager values at container startup.
    const ecrAccessRole = new iam.Role(this, 'AppRunnerEcrRole', {
      roleName: 'nanchang-apprunner-ecr-access',
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSAppRunnerServicePolicyForECRAccess',
        ),
      ],
    });
    // Secrets Manager reads are done by the App Runner service on startup,
    // using the ECR access role (not the instance role).
    jwtSecret.grantRead(ecrAccessRole);
    jwtRefreshSecret.grantRead(ecrAccessRole);
    vapidKeys.grantRead(ecrAccessRole);

    // Instance role — assumed by the running Node.js process inside App Runner
    const instanceRole = new iam.Role(this, 'AppRunnerInstanceRole', {
      roleName: 'nanchang-apprunner-instance',
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
    });
    table.grantReadWriteData(instanceRole);
    replayBucket.grantReadWrite(instanceRole);
    avatarBucket.grantReadWrite(instanceRole);

    // ── CloudFront Function: strip /api prefix ─────────────────────────────────
    // The NestJS API routes live at /auth/..., /users/..., etc. — no /api prefix.
    // The React app calls /api/... which CloudFront routes to App Runner.
    // This function rewrites /api/foo → /foo before the request reaches the origin.
    const stripApiPrefixFn = new cloudfront.Function(this, 'StripApiPrefix', {
      functionName: 'nanchang-strip-api-prefix',
      comment: 'Strips the /api prefix from requests destined for App Runner',
      code: cloudfront.FunctionCode.fromInline(
        [
          'function handler(event) {',
          '  var req = event.request;',
          "  if (req.uri.startsWith('/api/')) {",
          '    req.uri = req.uri.slice(4);',
          "  } else if (req.uri === '/api') {",
          "    req.uri = '/';",
          '  }',
          '  return req;',
          '}',
        ].join('\n'),
      ),
    });

    // ── CloudFront Distribution ────────────────────────────────────────────────
    // Default behavior: S3 (static SPA). Additional behaviors for API traffic
    // are added only when deployApi=true (App Runner URL becomes available).

    const additionalBehaviors: Record<string, cloudfront.BehaviorOptions> = {};

    let appRunnerServiceUrl: string | undefined;
    let apiService: apprunner.CfnService | undefined;

    if (deployApi) {
      apiService = new apprunner.CfnService(this, 'ApiService', {
        serviceName: 'nanchang-api',
        sourceConfiguration: {
          authenticationConfiguration: {
            accessRoleArn: ecrAccessRole.roleArn,
          },
          // GitHub Actions triggers explicit deployments; we don't want ECR push
          // events to auto-deploy (it would race with the frontend S3 sync).
          autoDeploymentsEnabled: false,
          imageRepository: {
            imageIdentifier: `${ecrRepo.repositoryUri}:latest`,
            imageRepositoryType: 'ECR',
            imageConfiguration: {
              port: '3001',
              runtimeEnvironmentVariables: [
                { name: 'NODE_ENV', value: 'production' },
                { name: 'PORT', value: '3001' },
                { name: 'AWS_REGION', value: this.region },
                { name: 'DYNAMODB_TABLE_NAME', value: table.tableName },
                { name: 'S3_REPLAY_BUCKET', value: replayBucket.bucketName },
                { name: 'S3_AVATAR_BUCKET', value: avatarBucket.bucketName },
                { name: 'JWT_EXPIRES_IN', value: '1h' },
                { name: 'JWT_REFRESH_EXPIRES_IN', value: '30d' },
                // Update to your real contact email post-deploy
                { name: 'VAPID_SUBJECT', value: 'mailto:admin@example.com' },
              ],
              runtimeEnvironmentSecrets: [
                { name: 'JWT_SECRET', value: jwtSecret.secretArn },
                { name: 'JWT_REFRESH_SECRET', value: jwtRefreshSecret.secretArn },
                // JSON key syntax: <secret-arn>:<json-key>::
                { name: 'VAPID_PUBLIC_KEY', value: `${vapidKeys.secretArn}:publicKey::` },
                { name: 'VAPID_PRIVATE_KEY', value: `${vapidKeys.secretArn}:privateKey::` },
              ],
            },
          },
        },
        instanceConfiguration: {
          // 0.5 vCPU / 1 GB — comfortable headroom for NestJS + Socket.IO under low load
          cpu: '0.5 vCPU',
          memory: '1 GB',
          instanceRoleArn: instanceRole.roleArn,
        },
        autoScalingConfigurationArn: undefined, // uses App Runner default (max 25)
        healthCheckConfiguration: {
          path: '/health',
          protocol: 'HTTP',
          interval: 10,
          timeout: 5,
          healthyThreshold: 1,
          unhealthyThreshold: 5,
        },
        networkConfiguration: {
          // 1 = always keep at least one instance warm (avoids cold starts for WS)
          ingressConfiguration: { isPubliclyAccessible: true },
        },
      });

      // App Runner returns the URL as "https://xyz.ap-east-1.awsapprunner.com"
      // CloudFront HttpOrigin needs just the hostname (no protocol).
      appRunnerServiceUrl = cdk.Fn.select(1, cdk.Fn.split('://', apiService.attrServiceUrl));

      const apiOrigin = new origins.HttpOrigin(appRunnerServiceUrl, {
        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      });

      const apiCachePolicy = cloudfront.CachePolicy.CACHING_DISABLED;
      // ALL_VIEWER_EXCEPT_HOST_HEADER forwards all viewer headers (including the
      // Upgrade/Connection headers needed for WebSocket handshakes) while replacing
      // Host with the origin hostname so App Runner doesn't reject the request.
      const apiRequestPolicy = cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER;

      additionalBehaviors['/api/*'] = {
        origin: apiOrigin,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: apiCachePolicy,
        originRequestPolicy: apiRequestPolicy,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [
          {
            function: stripApiPrefixFn,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      };

      additionalBehaviors['/socket.io*'] = {
        origin: apiOrigin,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: apiCachePolicy,
        originRequestPolicy: apiRequestPolicy,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      };
    }

    // Use OAC (preferred over legacy OAI) for S3 origin.
    // CDK automatically creates the OAC and grants the bucket policy.
    const webOrigin = origins.S3BucketOrigin.withOriginAccessControl(webBucket);

    const distribution = new cloudfront.Distribution(this, 'WebDistribution', {
      comment: 'Nanchang Mahjong — SPA + API proxy',
      defaultBehavior: {
        origin: webOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      additionalBehaviors,
      defaultRootObject: 'index.html',
      // React Router SPA: serve index.html for S3 403/404 responses
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
      // Use all edge locations for lowest latency in Hong Kong / Asia
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
    });

    // ── CloudFormation Outputs ─────────────────────────────────────────────────
    // These are referenced in the deployment guide and set as GitHub Actions secrets.

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'Primary app URL (set as VITE_API_BASE_URL if needed)',
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: distribution.distributionId,
      description: 'GitHub secret: CLOUDFRONT_DISTRIBUTION_ID',
    });

    new cdk.CfnOutput(this, 'WebBucketName', {
      value: webBucket.bucketName,
      description: 'GitHub secret: WEB_BUCKET_NAME',
    });

    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: ecrRepo.repositoryUri,
      description: 'ECR URI — tag and push your Docker image here',
    });

    new cdk.CfnOutput(this, 'DynamoTableName', {
      value: table.tableName,
      description: 'DynamoDB table (already set in App Runner env vars)',
    });

    new cdk.CfnOutput(this, 'VapidKeysSecretArn', {
      value: vapidKeys.secretArn,
      description: 'Update this secret with real VAPID keys before enabling push',
    });

    if (apiService) {
      new cdk.CfnOutput(this, 'AppRunnerServiceArn', {
        value: apiService.attrServiceArn,
        description: 'GitHub secret: APP_RUNNER_SERVICE_ARN',
      });

      new cdk.CfnOutput(this, 'AppRunnerServiceUrl', {
        value: apiService.attrServiceUrl,
        description: 'Direct API URL (not needed — traffic goes through CloudFront)',
      });
    }
  }
}
