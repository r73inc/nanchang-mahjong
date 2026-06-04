/**
 * NanchangStack — all ap-east-1 production resources.
 *
 * Phase 1:  Cognito User Pool + App Client              ← shipped
 * Phase 13: DynamoDB, S3, ECR, App Runner, CloudFront  ← this file
 *
 * Depends on NanchangGlobalStack (us-east-1) for the WAF WebACL ARN.
 * Pass wafAclArn via props (crossRegionReferences: true in both stacks).
 */

import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

export interface NanchangStackProps extends cdk.StackProps {
  /**
   * WAF WebACL ARN from NanchangGlobalStack (us-east-1).
   * Attached to the CloudFront distribution.
   * If undefined, WAF is skipped (e.g. for non-prod stacks).
   */
  wafAclArn?: string;
}

export class NanchangStack extends cdk.Stack {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly table: dynamodb.Table;
  readonly replayBucket: s3.Bucket;
  readonly webBucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;
  readonly ecrRepo: ecr.Repository;

  constructor(scope: Construct, id: string, props?: NanchangStackProps) {
    super(scope, id, props);

    // ──────────────────────────────────────────────────────────────────────────
    // Cognito (Phase 1, unchanged)
    // ──────────────────────────────────────────────────────────────────────────

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'nanchang-users',
      signInAliases: { email: true },
      autoVerify: { email: true },
      selfSignUpEnabled: false,
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
        tempPasswordValidity: cdk.Duration.days(1),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      standardAttributes: { email: { required: true, mutable: true } },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.userPoolClient = this.userPool.addClient('ApiClient', {
      userPoolClientName: 'nanchang-api',
      generateSecret: false,
      authFlows: { userPassword: true, adminUserPassword: true },
      accessTokenValidity: cdk.Duration.minutes(5),
      idTokenValidity: cdk.Duration.minutes(5),
      refreshTokenValidity: cdk.Duration.days(1),
      preventUserExistenceErrors: true,
    });

    // ──────────────────────────────────────────────────────────────────────────
    // DynamoDB — single-table design (Phase 13)
    // ──────────────────────────────────────────────────────────────────────────

    this.table = new dynamodb.Table(this, 'MainTable', {
      tableName: 'nanchang_main',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // near-zero cost at ≤50 users
      pointInTimeRecovery: true, // 13.4 — 35-day PITR window
      timeToLiveAttribute: 'ttl', // used by invite codes + rate-limit counters
      removalPolicy: cdk.RemovalPolicy.RETAIN, // never destroy user data with cdk destroy
    });

    // GSI-1: email→user, room-code→room, invite-status→invites
    this.table.addGlobalSecondaryIndex({
      indexName: 'gsi1',
      partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ──────────────────────────────────────────────────────────────────────────
    // S3 — replay storage (Phase 13)
    // ──────────────────────────────────────────────────────────────────────────

    this.replayBucket = new s3.Bucket(this, 'ReplayBucket', {
      bucketName: `nanchang-replays-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      lifecycleRules: [
        {
          // Transition replays older than 1 year to Glacier (13.4 data lifecycle)
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

    // ──────────────────────────────────────────────────────────────────────────
    // ECR — API container registry (Phase 13)
    // ──────────────────────────────────────────────────────────────────────────

    this.ecrRepo = new ecr.Repository(this, 'ApiRepo', {
      repositoryName: 'nanchang-api',
      imageTagMutability: ecr.TagMutability.MUTABLE,
      imageScanOnPush: true,
      lifecycleRules: [{ maxImageCount: 5, description: 'Keep only the last 5 images' }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ──────────────────────────────────────────────────────────────────────────
    // IAM — App Runner roles (Phase 13)
    // ──────────────────────────────────────────────────────────────────────────

    // Access role: used by App Runner to pull the container image from ECR.
    const accessRole = new iam.Role(this, 'AppRunnerAccessRole', {
      roleName: 'nanchang-apprunner-access',
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSAppRunnerServicePolicyForECRAccess',
        ),
      ],
    });

    // Instance role: assumed by the running container; needs DynamoDB + S3.
    const instanceRole = new iam.Role(this, 'AppRunnerInstanceRole', {
      roleName: 'nanchang-apprunner-instance',
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
    });
    this.table.grantReadWriteData(instanceRole);
    this.replayBucket.grantReadWrite(instanceRole);

    // ──────────────────────────────────────────────────────────────────────────
    // App Runner — API service (Phase 13)
    // ──────────────────────────────────────────────────────────────────────────

    const apiService = new apprunner.CfnService(this, 'ApiService', {
      serviceName: 'nanchang-api',

      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: accessRole.roleArn,
        },
        imageRepository: {
          imageRepositoryType: 'ECR',
          imageIdentifier: `${this.ecrRepo.repositoryUri}:latest`,
          imageConfiguration: {
            port: '3001',
            runtimeEnvironmentVariables: [
              { name: 'NODE_ENV', value: 'production' },
              { name: 'DYNAMODB_TABLE_NAME', value: this.table.tableName },
              { name: 'S3_REPLAY_BUCKET', value: this.replayBucket.bucketName },
              { name: 'AWS_REGION', value: this.region },
              // Secrets injected via AWS Secrets Manager or Parameter Store after deploy:
              // COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, JWT_SECRET, JWT_REFRESH_SECRET,
              // VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
            ],
          },
        },
        autoDeploymentsEnabled: false, // deploy triggered via CI (not ECR push)
      },

      instanceConfiguration: {
        cpu: '1 vCPU',
        memory: '2 GB',
        instanceRoleArn: instanceRole.roleArn,
      },

      healthCheckConfiguration: {
        protocol: 'HTTP',
        path: '/health',
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 3,
      },
    });

    // ──────────────────────────────────────────────────────────────────────────
    // S3 — static web hosting (Phase 13)
    // ──────────────────────────────────────────────────────────────────────────

    this.webBucket = new s3.Bucket(this, 'WebBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CloudFront — CDN for the web SPA + API proxy (Phase 13)
    // ──────────────────────────────────────────────────────────────────────────

    const apiDomain = cdk.Fn.select(
      2, // https://<domain>/
      cdk.Fn.split('/', apiService.attrServiceUrl),
    );

    this.distribution = new cloudfront.Distribution(this, 'WebDistribution', {
      comment: 'Nanchang Mahjong — SPA + API proxy',
      defaultRootObject: 'index.html',

      // WAF WebACL from the global (us-east-1) stack
      webAclId: props?.wafAclArn,

      // ── Default behavior: serve SPA assets from S3 ──
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        compress: true,
      },

      // ── Additional behaviors ─────────────────────────────────────────────
      additionalBehaviors: {
        // Forward API calls to App Runner
        '/api/*': {
          origin: new origins.HttpOrigin(apiDomain, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            originPath: '',
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
        // Forward Socket.IO to App Runner (no CloudFront caching)
        '/socket.io/*': {
          origin: new origins.HttpOrigin(apiDomain, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },

      // SPA routing — 403/404 from S3 returns index.html
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

      // Minimum TLS 1.2
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SES — transactional email configuration (Phase 13)
    // ──────────────────────────────────────────────────────────────────────────
    // Domain verification + DKIM setup done out-of-band after first deploy.
    // CloudFormation only registers the config set here.

    new ses.CfnConfigurationSet(this, 'SesConfigSet', {
      name: 'nanchang-transactional',
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CloudWatch — application-level alarms (Phase 13)
    // ──────────────────────────────────────────────────────────────────────────

    new cloudwatch.Alarm(this, 'ApiErrorAlarm', {
      alarmName: 'nanchang-api-5xx-rate',
      alarmDescription: 'App Runner is returning >1% 5xx responses',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/AppRunner',
        metricName: 'Http5xxRequests',
        dimensionsMap: { ServiceName: apiService.attrServiceId },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 10,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CloudFormation Outputs
    // ──────────────────────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: '→ COGNITO_USER_POOL_ID',
      exportName: `${id}-UserPoolId`,
    });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: '→ COGNITO_CLIENT_ID',
      exportName: `${id}-UserPoolClientId`,
    });
    new cdk.CfnOutput(this, 'DynamoTableName', {
      value: this.table.tableName,
      exportName: `${id}-DynamoTableName`,
    });
    new cdk.CfnOutput(this, 'ReplayBucketName', {
      value: this.replayBucket.bucketName,
      exportName: `${id}-ReplayBucketName`,
    });
    new cdk.CfnOutput(this, 'WebBucketName', {
      value: this.webBucket.bucketName,
      description: '→ WEB_BUCKET (deploy target for Vite build)',
      exportName: `${id}-WebBucketName`,
    });
    new cdk.CfnOutput(this, 'EcrRepoUri', {
      value: this.ecrRepo.repositoryUri,
      description: '→ ECR_REPO (Docker push target)',
      exportName: `${id}-EcrRepoUri`,
    });
    new cdk.CfnOutput(this, 'AppRunnerServiceArn', {
      value: apiService.attrServiceArn,
      description: '→ APP_RUNNER_ARN (trigger redeployment)',
      exportName: `${id}-AppRunnerServiceArn`,
    });
    new cdk.CfnOutput(this, 'CloudFrontDomain', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront distribution domain (point your DNS CNAME here)',
      exportName: `${id}-CloudFrontDomain`,
    });
    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      description: '→ CLOUDFRONT_DISTRIBUTION_ID (cache invalidation)',
      exportName: `${id}-CloudFrontDistributionId`,
    });
  }
}
