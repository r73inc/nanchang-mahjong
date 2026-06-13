# Production Deployment Guide

Target: AWS `ap-east-1` (Hong Kong). Infrastructure managed by AWS CDK.

---

## Prerequisites

- AWS CLI configured with an account that has `AdministratorAccess` (for CDK bootstrap)
- Docker Desktop running
- pnpm ≥ 10, Node.js ≥ 22
- `aws-cdk` CLI: `npm install -g aws-cdk`

---

## §1 — CDK Bootstrap (one-time, per account/region)

CDK bootstrap provisions the S3 bucket and IAM roles CloudFormation needs to deploy stacks.

```bash
# Replace 123456789012 with your AWS account ID
cdk bootstrap aws://123456789012/ap-east-1
```

---

## §2 — Phase 1 CDK Deploy (infrastructure, no App Runner yet)

This creates all infrastructure **except** the App Runner service, which requires a Docker image in ECR first.

```bash
cd infra/aws
npx cdk deploy NanchangProd
```

Note the CloudFormation **Outputs** — you'll need them in §4 and §6:

| Output key                 | Used for                                   |
| -------------------------- | ------------------------------------------ |
| `EcrRepositoryUri`         | Push Docker images here                    |
| `WebBucketName`            | GitHub secret `WEB_BUCKET_NAME`            |
| `CloudFrontDistributionId` | GitHub secret `CLOUDFRONT_DISTRIBUTION_ID` |
| `CloudFrontUrl`            | Your app's public URL                      |
| `VapidKeysSecretArn`       | Update with real VAPID keys in §3          |

---

## §3 — Generate and store VAPID keys

VAPID keys enable web push notifications. Generate them and store in Secrets Manager.

```bash
# Generate keys
npx web-push generate-vapid-keys
# Output looks like:
#   Public Key:  BExxx...
#   Private Key: abc123...

# Update the secret (replace ARN from CDK output above)
aws secretsmanager put-secret-value \
  --secret-id "nanchang/vapid-keys" \
  --region ap-east-1 \
  --secret-string '{"publicKey":"<PASTE_PUBLIC_KEY>","privateKey":"<PASTE_PRIVATE_KEY>"}'
```

---

## §4 — Push the first Docker image to ECR

```bash
# Get ECR URI from CDK output, e.g.: 123456789012.dkr.ecr.ap-east-1.amazonaws.com/nanchang-api
ECR_URI="<EcrRepositoryUri from CDK output>"

# Authenticate Docker with ECR
aws ecr get-login-password --region ap-east-1 \
  | docker login --username AWS --password-stdin "$ECR_URI"

# Build the image (run from repo root)
docker build -f apps/api/Dockerfile -t "${ECR_URI}:latest" .

# Push
docker push "${ECR_URI}:latest"
```

---

## §5 — Phase 2 CDK Deploy (add App Runner + CloudFront API behaviors)

Now that ECR has an image, deploy the App Runner service:

```bash
cd infra/aws
npx cdk deploy NanchangProd --context deployApi=true
```

Additional outputs appear:

| Output key            | Used for                                                   |
| --------------------- | ---------------------------------------------------------- |
| `AppRunnerServiceArn` | GitHub secret `APP_RUNNER_SERVICE_ARN`                     |
| `AppRunnerServiceUrl` | Direct API URL (debug only — use CloudFront URL for users) |

Wait ~3 minutes for App Runner to start and pass its health check at `/health`.

---

## §6 — Create IAM deploy user for GitHub Actions

```bash
# Create the user
aws iam create-user --user-name nanchang-github-deploy

# Attach a policy (inline — adjust as needed)
aws iam put-user-policy \
  --user-name nanchang-github-deploy \
  --policy-name NanchangDeploy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage"
        ],
        "Resource": "*"
      },
      {
        "Effect": "Allow",
        "Action": ["apprunner:StartDeployment"],
        "Resource": "<AppRunnerServiceArn from CDK output>"
      },
      {
        "Effect": "Allow",
        "Action": ["s3:PutObject", "s3:DeleteObject", "s3:ListBucket", "s3:GetObject"],
        "Resource": [
          "arn:aws:s3:::<WebBucketName>",
          "arn:aws:s3:::<WebBucketName>/*"
        ]
      },
      {
        "Effect": "Allow",
        "Action": ["cloudfront:CreateInvalidation"],
        "Resource": "*"
      }
    ]
  }'

# Create access keys
aws iam create-access-key --user-name nanchang-github-deploy
# Save the AccessKeyId and SecretAccessKey
```

---

## §7 — Set GitHub Actions secrets

In GitHub → repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret name                  | Value                              |
| ---------------------------- | ---------------------------------- |
| `AWS_ACCESS_KEY_ID`          | From §6 `create-access-key` output |
| `AWS_SECRET_ACCESS_KEY`      | From §6 `create-access-key` output |
| `WEB_BUCKET_NAME`            | From CDK output                    |
| `CLOUDFRONT_DISTRIBUTION_ID` | From CDK output                    |
| `APP_RUNNER_SERVICE_ARN`     | From CDK output (Phase 2)          |

---

## §8 — Seed the database (first admin user)

```bash
# SSH is not available on App Runner directly.
# Run the seed script locally against production DynamoDB.
# Ensure your local AWS credentials have DynamoDB write access to the prod table.

AWS_REGION=ap-east-1 \
DYNAMODB_TABLE_NAME=nanchang_main \
NODE_ENV=development \
  pnpm --filter @nanchang/api run seed
```

The seed script creates:

- One admin invite code (printed to stdout — save it!)
- (Optional) Initial admin user

---

## §9 — Verify the deployment

1. Open `CloudFrontUrl` in a browser — should show the login page
2. Sign up with the invite code from §8
3. Open the admin panel and generate invite codes for family members
4. Test a full game with 4 players

---

## Ongoing Deployments

Every push to `main` triggers the GitHub Actions `deploy.yml` workflow automatically:

1. Builds and pushes the Docker image to ECR
2. Triggers App Runner to redeploy with the new image
3. Builds the React SPA with Vite
4. Syncs to S3 and invalidates CloudFront

Infrastructure changes (DynamoDB schema, new S3 buckets, etc.) still require a manual `cdk deploy`.

---

## Cost estimate (ap-east-1, <50 users)

| Service                                      | Estimated monthly cost           |
| -------------------------------------------- | -------------------------------- |
| App Runner (0.5 vCPU / 1 GB, min 1 instance) | ~$12–18                          |
| DynamoDB on-demand                           | ~$0 (free tier covers <50 users) |
| S3 + CloudFront                              | ~$1–3                            |
| Secrets Manager                              | ~$0.40 (4 secrets)               |
| ECR                                          | ~$0.10                           |
| **Total**                                    | **~$15–25 / month**              |
