import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as elb2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

/**
 * NanchangStack — full production infrastructure for ap-east-1 (Hong Kong).
 *
 * REQUIREMENT: This app MUST be deployed in ap-east-1 (Hong Kong). No other region.
 *
 * Deploy in two phases to avoid the ECR chicken-and-egg problem:
 *
 *   Phase 1 — infrastructure only (ECS Fargate service not yet created):
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
 *   - ECS Fargate service behind an HTTP ALB (only when deployApi=true)
 *   - CloudFront distribution:
 *       /* → S3 web bucket (SPA, serves index.html on 403/404)
 *       /api/* → ECS Fargate ALB (CloudFront Function strips /api prefix)
 *       /socket.io* → ECS Fargate ALB (WebSocket capable)
 *   - IAM roles: ECS execution role + task role
 */
export class NanchangStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Whether to create the ECS Fargate service + API CloudFront behaviors.
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
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
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

    // VAPID keys must be generated externally and stored here before ECS Fargate starts.
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

    // ECS Task Execution Role — used by ECS to pull images from ECR and inject
    // Secrets Manager values at container startup.
    const executionRole = new iam.Role(this, 'EcsExecutionRole', {
      roleName: 'nanchang-ecs-execution',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });
    ecrRepo.grantPull(executionRole);
    jwtSecret.grantRead(executionRole);
    jwtRefreshSecret.grantRead(executionRole);
    vapidKeys.grantRead(executionRole);

    // ECS Task Role — assumed by the running Node.js process inside the container.
    const taskRole = new iam.Role(this, 'EcsTaskRole', {
      roleName: 'nanchang-ecs-task',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    table.grantReadWriteData(taskRole);
    replayBucket.grantReadWrite(taskRole);
    avatarBucket.grantReadWrite(taskRole);

    // Grant the ECS task role permission to invoke the Gemini relay Function URL (us-east-1).
    // Supply the relay Lambda ARN after Phase 2 deployment:
    //   cdk deploy --context geminiRelayArn=arn:aws:lambda:us-east-1:<acct>:function:gemini-relay
    const geminiRelayArn = this.node.tryGetContext('geminiRelayArn') as string | undefined;
    if (geminiRelayArn) {
      taskRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ['lambda:InvokeFunctionUrl'],
          resources: [geminiRelayArn],
        }),
      );
    }

    // ── CloudFront Function: strip /api prefix ─────────────────────────────────
    // The NestJS API routes live at /auth/..., /users/..., etc. — no /api prefix.
    // The React app calls /api/... which CloudFront routes to the Fargate ALB.
    // This function rewrites /api/foo → /foo before the request reaches the origin.
    const stripApiPrefixFn = new cloudfront.Function(this, 'StripApiPrefix', {
      functionName: 'nanchang-strip-api-prefix',
      comment: 'Strips the /api prefix from requests destined for ECS Fargate',
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
    // are added only when deployApi=true (ALB endpoint becomes available).

    const additionalBehaviors: Record<string, cloudfront.BehaviorOptions> = {};

    let fargateService: ecsPatterns.ApplicationLoadBalancedFargateService | undefined;

    if (deployApi) {
      // Look up the default VPC — all subnets are public (routes to IGW).
      // CDK caches the lookup result in cdk.context.json; commit that file.
      const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

      const cluster = new ecs.Cluster(this, 'NanchangCluster', {
        vpc,
        clusterName: 'nanchang',
      });

      const logGroup = new logs.LogGroup(this, 'ApiLogGroup', {
        logGroupName: '/ecs/nanchang-api',
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      const taskDefinition = new ecs.FargateTaskDefinition(this, 'ApiTaskDef', {
        cpu: 512,
        memoryLimitMiB: 1024,
        executionRole,
        taskRole,
      });

      taskDefinition.addContainer('api', {
        image: ecs.ContainerImage.fromEcrRepository(ecrRepo, 'latest'),
        portMappings: [{ containerPort: 3001 }],
        environment: {
          NODE_ENV: 'production',
          PORT: '3001',
          AWS_REGION: this.region,
          DYNAMODB_TABLE_NAME: table.tableName,
          S3_REPLAY_BUCKET: replayBucket.bucketName,
          S3_AVATAR_BUCKET: avatarBucket.bucketName,
          JWT_EXPIRES_IN: '1h',
          JWT_REFRESH_EXPIRES_IN: '30d',
          VAPID_SUBJECT: 'mailto:r73inc@gmail.com',
          // Gemini relay — set GEMINI_RELAY_URL after the us-east-1 relay is deployed
          GEMINI_RELAY_URL: (this.node.tryGetContext('geminiRelayUrl') as string | undefined) ?? '',
          GEMINI_RELAY_REGION: 'us-east-1',
          GEMINI_RELAY_MODEL: 'gemini-1.5-flash',
        },
        secrets: {
          JWT_SECRET: ecs.Secret.fromSecretsManager(jwtSecret),
          JWT_REFRESH_SECRET: ecs.Secret.fromSecretsManager(jwtRefreshSecret),
          VAPID_PUBLIC_KEY: ecs.Secret.fromSecretsManager(vapidKeys, 'publicKey'),
          VAPID_PRIVATE_KEY: ecs.Secret.fromSecretsManager(vapidKeys, 'privateKey'),
        },
        logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'api', logGroup }),
        healthCheck: {
          command: ['CMD-SHELL', 'wget -qO- http://localhost:3001/health || exit 1'],
          interval: cdk.Duration.seconds(10),
          timeout: cdk.Duration.seconds(5),
          retries: 3,
          startPeriod: cdk.Duration.seconds(30),
        },
      });

      // HTTP ALB + Fargate in public subnets with public IPs (no NAT gateway cost).
      // CloudFront sits in front and handles HTTPS termination.
      fargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'ApiService', {
        cluster,
        taskDefinition,
        serviceName: 'nanchang-api',
        desiredCount: 1,
        publicLoadBalancer: true,
        assignPublicIp: true,
        taskSubnets: { subnetType: ec2.SubnetType.PUBLIC },
        listenerPort: 80,
        protocol: elb2.ApplicationProtocol.HTTP,
        circuitBreaker: { rollback: true },
        healthCheckGracePeriod: cdk.Duration.seconds(60),
        minHealthyPercent: 100,
        maxHealthyPercent: 200,
      });

      fargateService.targetGroup.configureHealthCheck({
        path: '/health',
        protocol: elb2.Protocol.HTTP,
        port: '3001',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
      });

      // CloudFront → ALB via HTTP (CloudFront handles the HTTPS leg to clients).
      const apiOrigin = new origins.HttpOrigin(fargateService.loadBalancer.loadBalancerDnsName, {
        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
        httpPort: 80,
      });

      const apiCachePolicy = cloudfront.CachePolicy.CACHING_DISABLED;
      // ALL_VIEWER_EXCEPT_HOST_HEADER forwards all viewer headers (including the
      // Upgrade/Connection headers needed for WebSocket handshakes) while replacing
      // Host with the origin hostname so the ALB doesn't reject the request.
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

    // ACM certificate for the custom domain (must be in us-east-1 for CloudFront).
    // Certificate covers wuchatea.com + www.wuchatea.com and is already ISSUED.
    const siteCert = acm.Certificate.fromCertificateArn(
      this,
      'SiteCert',
      'arn:aws:acm:us-east-1:948211576126:certificate/c7c72c10-9ea9-4bfc-b701-f6fbff12777b',
    );

    const distribution = new cloudfront.Distribution(this, 'WebDistribution', {
      comment: 'Nanchang Mahjong — SPA + API proxy',
      domainNames: ['wuchatea.com', 'www.wuchatea.com'],
      certificate: siteCert,
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
      description: 'Primary app URL',
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
      description: 'DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'VapidKeysSecretArn', {
      value: vapidKeys.secretArn,
      description: 'Update this secret with real VAPID keys before enabling push',
    });

    if (fargateService) {
      new cdk.CfnOutput(this, 'EcsFargateServiceArn', {
        value: fargateService.service.serviceArn,
        description:
          'ECS Fargate service ARN — use cluster=nanchang service=nanchang-api for updates',
      });

      new cdk.CfnOutput(this, 'AlbEndpoint', {
        value: fargateService.loadBalancer.loadBalancerDnsName,
        description: 'ALB DNS name — traffic goes through CloudFront, not here directly',
      });
    }
  }
}
