import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface GeminiRelayStackProps extends cdk.StackProps {
  /**
   * ARN of the ECS task role created by NanchangStack (ap-east-1).
   * When provided, a resource policy grants that role the right to call the
   * relay's Function URL. If omitted the policy is skipped and an output
   * reminds the deployer to redeploy once the ARN is known.
   *
   * Pass via CDK context: --context hkTaskRoleArn=arn:aws:iam::ACCT:role/nanchang-ecs-task
   */
  hkTaskRoleArn?: string;
}

/**
 * GeminiRelayStack — standalone us-east-1 stack.
 *
 * REQUIREMENT: this stack MUST stay in us-east-1.
 * Google Gemini rejects requests from ap-east-1 (Hong Kong). This Lambda
 * acts as a regional forward relay so the HK ECS Fargate service can reach
 * Gemini without being geo-blocked.
 *
 * Authentication: Lambda Function URL with authType = AWS_IAM.
 * Only the HK ECS task role (explicitly named in the resource policy) can
 * invoke this URL. No shared API key.
 *
 * Resources:
 *   - Secrets Manager secret for the Gemini API key (update manually before use)
 *   - Lambda function (arm64, Node.js 22, 120s timeout)
 *   - Lambda Function URL (AWS_IAM auth)
 *   - CloudWatch Log Group (1-week retention)
 *   - Resource policy granting the HK task role lambda:InvokeFunctionUrl (when ARN known)
 *
 * Deploy guide: docs/RELAY-DEPLOYMENT.md
 */
export class GeminiRelayStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: GeminiRelayStackProps) {
    super(scope, id, props);

    // ── Secrets Manager: Gemini API key ────────────────────────────────────────
    // Update this secret with the real key before the relay is called.
    // See RELAY-DEPLOYMENT.md §2.
    const geminiSecret = new secretsmanager.Secret(this, 'GeminiApiKey', {
      secretName: 'nanchang/gemini-api-key',
      description:
        'Google Gemini API key for the Nanchang AI replay commentary relay. ' +
        'Update with the actual key (plain string) before use — see RELAY-DEPLOYMENT.md §2.',
      secretStringValue: cdk.SecretValue.unsafePlainText('REPLACE_ME'),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── CloudWatch Log Group ────────────────────────────────────────────────────
    const logGroup = new logs.LogGroup(this, 'RelayLogGroup', {
      logGroupName: '/lambda/nanchang-gemini-relay',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── Lambda Function ─────────────────────────────────────────────────────────
    // NodejsFunction uses esbuild to bundle the TypeScript handler and its deps.
    // @google/generative-ai is bundled in; @aws-sdk/* is available in the runtime.
    const relayFn = new lambdaNodejs.NodejsFunction(this, 'RelayFunction', {
      functionName: 'nanchang-gemini-relay',
      description:
        'Gemini relay — accepts signed requests from the ap-east-1 HK API and proxies them to Gemini.',
      // Path relative to this file: infra/relay/lib/ → services/gemini-relay/src/handler.ts
      entry: path.resolve(__dirname, '../../../services/gemini-relay/src/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      // Gemini can take 30–90 s for longer generations; 120 s gives headroom.
      timeout: cdk.Duration.seconds(120),
      memorySize: 256,
      logGroup,
      environment: {
        NODE_ENV: 'production',
        GEMINI_SECRET_NAME: geminiSecret.secretName,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      },
      bundling: {
        // @aws-sdk/* is provided by the Lambda Node.js 22 runtime — exclude to keep bundle small.
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: true,
      },
    });

    // Allow the Lambda execution role to read the Gemini key secret.
    geminiSecret.grantRead(relayFn);

    // ── Lambda Function URL (AWS_IAM auth) ─────────────────────────────────────
    // IAM is the sole gate — no shared-secret header needed.
    // Only callers whose IAM identity is explicitly allowed can invoke this URL.
    const fnUrl = relayFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
    });

    // ── Resource policy: allow the HK ECS task role to invoke ──────────────────
    const { hkTaskRoleArn } = props ?? {};
    if (hkTaskRoleArn) {
      relayFn.addPermission('AllowHkTaskRole', {
        principal: new iam.ArnPrincipal(hkTaskRoleArn),
        action: 'lambda:InvokeFunctionUrl',
        functionUrlAuthType: lambda.FunctionUrlAuthType.AWS_IAM,
      });
    }

    // ── CloudFormation Outputs ─────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'RelayFunctionUrl', {
      value: fnUrl.url,
      description:
        'GEMINI_RELAY_URL — set this env var in the NanchangProd ECS task definition (Phase 3). ' +
        'Also add the ECS task role ARN to the resource policy: ' +
        'pnpm --filter @nanchang/infra-relay run cdk deploy --context hkTaskRoleArn=<ARN>',
    });

    new cdk.CfnOutput(this, 'RelayFunctionArn', {
      value: relayFn.functionArn,
      description:
        'Lambda ARN — referenced when granting InvokeFunctionUrl in the HK stack (Phase 3)',
    });

    new cdk.CfnOutput(this, 'GeminiSecretArn', {
      value: geminiSecret.secretArn,
      description: 'Update this secret with the real Gemini API key (see RELAY-DEPLOYMENT.md §2)',
    });

    if (!hkTaskRoleArn) {
      new cdk.CfnOutput(this, 'ResourcePolicyPending', {
        value: 'NOT_SET — redeploy after NanchangProd to wire up the resource policy',
        description:
          'Run: pnpm --filter @nanchang/infra-relay run cdk deploy --context hkTaskRoleArn=<ECS task role ARN>',
      });
    }
  }
}
