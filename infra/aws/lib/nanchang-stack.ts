import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

/**
 * NanchangStack — grows phase by phase.
 *
 * Phase 1:  Cognito User Pool + App Client          ← this file
 * Phase 6+: DynamoDB table, App Runner service, S3 bucket,
 *           CloudFront distribution, SES config, WAF ACL
 *
 * See PLAN.md §13 for the full infra roadmap.
 */
export class NanchangStack extends cdk.Stack {
  /** Exported so other stacks / CDK outputs can reference it. */
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── Cognito User Pool ──────────────────────────────────────────────────
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'nanchang-users',

      // Users sign in with email; Cognito enforces uniqueness at pool level.
      signInAliases: { email: true },
      autoVerify: { email: true },
      selfSignUpEnabled: false, // invite-only — the API handles sign-up via AdminCreateUser

      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
        tempPasswordValidity: cdk.Duration.days(1),
      },

      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,

      // Standard attributes — email is verified server-side by the API.
      standardAttributes: {
        email: { required: true, mutable: true },
      },

      // Retain on destroy so users aren't accidentally deleted on cdk destroy.
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── App Client ─────────────────────────────────────────────────────────
    // USER_PASSWORD_AUTH is needed for InitiateAuth (server-side credential check).
    // No client secret — the API talks to Cognito server-to-server.
    this.userPoolClient = this.userPool.addClient('ApiClient', {
      userPoolClientName: 'nanchang-api',
      generateSecret: false,
      authFlows: {
        userPassword: true, // USER_PASSWORD_AUTH
        adminUserPassword: true, // ALLOW_ADMIN_USER_PASSWORD_AUTH (AdminInitiateAuth)
      },
      // Short token validity — we issue our own JWTs anyway; Cognito tokens are
      // only used transiently during the auth flow.
      accessTokenValidity: cdk.Duration.minutes(5),
      idTokenValidity: cdk.Duration.minutes(5),
      refreshTokenValidity: cdk.Duration.days(1),
      preventUserExistenceErrors: true, // mask UsernameExistsException to callers
    });

    // ── CloudFormation Outputs ─────────────────────────────────────────────
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID → COGNITO_USER_POOL_ID env var',
      exportName: `${id}-UserPoolId`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito App Client ID → COGNITO_CLIENT_ID env var',
      exportName: `${id}-UserPoolClientId`,
    });
  }
}
