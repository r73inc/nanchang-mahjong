#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { GeminiRelayStack } from '../lib/gemini-relay-stack';

const app = new cdk.App();

// Read optional HK task-role ARN from CDK context (--context hkTaskRoleArn=<ARN>).
// Must be set after NanchangProd (ap-east-1) has been deployed and the ECS task
// role ARN is known. See docs/RELAY-DEPLOYMENT.md §4.
const hkTaskRoleArn = app.node.tryGetContext('hkTaskRoleArn') as string | undefined;

new GeminiRelayStack(app, 'NanchangGeminiRelay', {
  // MUST stay in us-east-1 — Gemini rejects requests from ap-east-1 (Hong Kong).
  // This is the sole reason the relay exists as a separate regional service.
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
  hkTaskRoleArn,
  description:
    'Nanchang Mahjong — Gemini relay (us-east-1). ' +
    'Proxies AI commentary generation requests from the ap-east-1 HK API to Google Gemini. ' +
    'See docs/RELAY-DEPLOYMENT.md for the step-by-step deploy guide.',
});
