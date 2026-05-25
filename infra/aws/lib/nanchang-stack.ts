import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

// Resources are added phase by phase — see PLAN.md §13 for the full list.
// Phase 1:  Cognito User Pool
// Phase 6+: DynamoDB, App Runner, S3, SES, WAF, CloudFront
export class NanchangStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
  }
}
