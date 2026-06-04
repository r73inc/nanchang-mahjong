#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NanchangGlobalStack } from '../lib/nanchang-global-stack';
import { NanchangStack } from '../lib/nanchang-stack';

const app = new cdk.App();

// ── Global resources (us-east-1) — WAF + billing alarm ───────────────────────
// CloudFront WAF WebACLs and AWS Billing metrics must be in us-east-1.
// crossRegionReferences lets the main stack consume the WAF ARN output.
const globalStack = new NanchangGlobalStack(app, 'NanchangGlobal', {
  env: { region: 'us-east-1' },
  crossRegionReferences: true,
  description: 'Nanchang Mahjong — global resources (WAF, billing alarm)',
});

// ── Main production stack (ap-east-1 / Hong Kong) ────────────────────────────
new NanchangStack(app, 'NanchangProd', {
  env: { region: 'ap-east-1' },
  crossRegionReferences: true,
  wafAclArn: globalStack.wafAclArn,
  description: 'Nanchang Mahjong — production stack (ap-east-1 / Hong Kong)',
});
