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

## §2 — Phase 1 CDK Deploy (infrastructure, no ECS Fargate yet)

This creates all infrastructure **except** the ECS Fargate service, which requires a Docker image in ECR first.

```bash
pnpm --filter @nanchang/infra run cdk deploy NanchangProd
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

## §5 — Phase 2 CDK Deploy (add ECS Fargate + CloudFront API behaviors)

Now that ECR has an image, deploy the ECS Fargate service:

```bash
pnpm --filter @nanchang/infra run cdk deploy NanchangProd --context deployApi=true
```

This creates:

- ECS cluster `nanchang` in the default VPC
- Fargate task definition (0.5 vCPU / 1 GB) with secrets injected from Secrets Manager
- Application Load Balancer with HTTP listener on port 80
- CloudFront behaviors for `/api/*` and `/socket.io*` pointing at the ALB

Additional outputs appear:

| Output key             | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `EcsFargateServiceArn` | ECS service ARN (for reference)                                    |
| `AlbEndpoint`          | ALB DNS name — debug only, use CloudFront URL for all user traffic |

Wait ~3 minutes for the Fargate task to start and pass its health check at `/health`.

---

## §6 — Create IAM deploy user for GitHub Actions

```bash
# Create the user
aws iam create-user --user-name nanchang-github-deploy

# Attach a policy
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
        "Action": ["ecs:UpdateService", "ecs:DescribeServices"],
        "Resource": "arn:aws:ecs:ap-east-1:*:service/nanchang/nanchang-api"
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

The ECS cluster (`nanchang`) and service (`nanchang-api`) names are hardcoded in the workflow — no ARN secret needed.

---

## §8 — Seed the database (first admin user)

Run the seed script locally against production DynamoDB. Your local AWS credentials need DynamoDB write access to the prod table.

```bash
AWS_REGION=ap-east-1 \
DYNAMODB_TABLE_NAME=nanchang_main \
NODE_ENV=development \
  pnpm --filter @nanchang/api run seed
```

The seed script creates:

- One admin invite code (printed to stdout — save it!)

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
2. Calls `aws ecs update-service --force-new-deployment` — ECS stops the running task and starts a new one using the fresh `:latest` image
3. Builds the React SPA with Vite
4. Syncs to S3 and invalidates CloudFront

Infrastructure changes (DynamoDB schema, new S3 buckets, CDK stack updates) still require a manual `cdk deploy`.

---

## Cost estimate (ap-east-1, <50 users)

| Service                                    | Estimated monthly cost           |
| ------------------------------------------ | -------------------------------- |
| ECS Fargate (0.5 vCPU / 1 GB, 1 task 24/7) | ~$14–18                          |
| Application Load Balancer                  | ~$18 (LCU + hourly)              |
| DynamoDB on-demand                         | ~$0 (free tier covers <50 users) |
| S3 + CloudFront                            | ~$1–3                            |
| Secrets Manager                            | ~$0.40 (4 secrets)               |
| ECR                                        | ~$0.10                           |
| CloudWatch Logs (30-day retention)         | ~$0.50                           |
| **Total**                                  | **~$35–42 / month**              |

Note: The ALB has a ~$18/month base cost. For a private family app with infrequent access, this is the dominant cost. The Fargate task itself is approximately $14/month at 0.5 vCPU / 1 GB.
