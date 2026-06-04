/**
 * NanchangGlobalStack — resources that MUST live in us-east-1.
 *
 * CloudFront WAF WebACLs and AWS Billing alarms are only available
 * in the us-east-1 region.  These are deployed as a separate CDK
 * stack with `crossRegionReferences: true` so the WAF ARN can be
 * consumed by the CloudFront distribution in ap-east-1.
 */

import * as cdk from 'aws-cdk-lib';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

export class NanchangGlobalStack extends cdk.Stack {
  /** WAF WebACL ARN — consumed by CloudFront in the main ap-east-1 stack. */
  readonly wafAclArn: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── WAF WebACL (CloudFront scope) ─────────────────────────────────────────
    // Protects the CloudFront distribution with:
    //  • AWS Common Rule Set (SQLi, XSS, bad bots)
    //  • IP-level rate limit: 2000 req/5min per IP
    const wafAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: 'nanchang-cloudfront-acl',
      scope: 'CLOUDFRONT', // must be CLOUDFRONT for CloudFront associations
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'NanchangWafCloudFront',
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 1,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
              // Exclude rules that would break Socket.IO
              excludedRules: [{ name: 'SizeRestrictions_BODY' }],
            },
          },
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSManagedRulesBotControlRuleSet',
          priority: 2,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesBotControlRuleSet',
              managedRuleGroupConfigs: [
                { awsManagedRulesBotControlRuleSet: { inspectionLevel: 'COMMON' } },
              ],
            },
          },
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'BotControlRuleSet',
            sampledRequestsEnabled: false,
          },
        },
        {
          name: 'IPRateLimit',
          priority: 3,
          statement: {
            rateBasedStatement: {
              limit: 2000, // per 5-minute window per IP
              aggregateKeyType: 'IP',
            },
          },
          action: { block: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'IPRateLimit',
            sampledRequestsEnabled: false,
          },
        },
      ],
    });

    this.wafAclArn = wafAcl.attrArn;

    // ── Cost alarm ($50 threshold) ────────────────────────────────────────────
    // Billing metrics are only in us-east-1. Alert topic posts to SNS (admins
    // add email subscriptions manually after first deploy).
    const billingTopic = new sns.Topic(this, 'BillingAlertTopic', {
      topicName: 'nanchang-billing-alerts',
      displayName: 'Nanchang Mahjong Billing Alerts',
    });

    const billingAlarm = new cloudwatch.Alarm(this, 'CostAlarm', {
      alarmName: 'nanchang-monthly-cost-over-50usd',
      alarmDescription:
        'Estimated AWS charges for Nanchang Mahjong exceeded $50 in the current month.',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Billing',
        metricName: 'EstimatedCharges',
        dimensionsMap: { Currency: 'USD' },
        period: cdk.Duration.hours(6),
        statistic: 'Maximum',
      }),
      threshold: 50,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    billingAlarm.addAlarmAction(new snsActions.SnsAction(billingTopic));

    // ── Outputs ───────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'WafAclArn', {
      value: wafAcl.attrArn,
      description: 'WAF WebACL ARN for CloudFront',
      exportName: `${id}-WafAclArn`,
    });

    new cdk.CfnOutput(this, 'BillingAlertTopicArn', {
      value: billingTopic.topicArn,
      description: 'SNS topic for billing alerts — subscribe your email after deploy',
      exportName: `${id}-BillingAlertTopicArn`,
    });
  }
}
