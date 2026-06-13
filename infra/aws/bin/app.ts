#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NanchangStack } from '../lib/nanchang-stack';

const app = new cdk.App();

new NanchangStack(app, 'NanchangProd', {
  // ap-east-1 = AWS Hong Kong region
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ap-east-1',
  },
  description:
    'Nanchang Mahjong — production stack (ap-east-1 / Hong Kong). ' +
    'See docs/DEPLOYMENT.md for the step-by-step deploy guide.',
});
