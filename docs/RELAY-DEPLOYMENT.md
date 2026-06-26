# Gemini Relay — Deployment Guide

Target: AWS `us-east-1` (N. Virginia). This relay is a **separate, independently-deployed service** — it has its own CDK stack and its own manual deploy pipeline. It is NOT wired into the `main` → ap-east-1 auto-deploy.

**Why a separate region?** Google Gemini rejects requests originating from `ap-east-1` (Hong Kong). The relay sits in `us-east-1`, accepts SigV4-signed requests from the HK ECS Fargate service, calls Gemini, and returns the result.

**Authentication:** Lambda Function URL with `authType = AWS_IAM`. The only allowed caller is the HK ECS task role (`nanchang-ecs-task`). No shared API key.

---

## Prerequisites

- AWS CLI configured with `AdministratorAccess` for the same account as the main stack
- pnpm ≥ 10, Node.js ≥ 22
- `aws-cdk` CLI: `npm install -g aws-cdk` (or use `npx cdk`)
- A Google Gemini API key (obtain from [Google AI Studio](https://aistudio.google.com/))
- NanchangProd (ap-east-1) should already be deployed so the ECS task role ARN is known

---

## §1 — CDK Bootstrap for us-east-1 (one-time, per account)

If you have already bootstrapped the account for ap-east-1, you still need to bootstrap for us-east-1 separately.

```bash
# Replace 123456789012 with your AWS account ID
cdk bootstrap aws://123456789012/us-east-1
```

---

## §2 — Store the Gemini API key in Secrets Manager

The CDK stack creates a placeholder secret. Update it with the real key **before** invoking the relay.

```bash
# Obtain your Gemini API key from https://aistudio.google.com/
# Then store it (plain string, not JSON):
aws secretsmanager put-secret-value \
  --secret-id "nanchang/gemini-api-key" \
  --region us-east-1 \
  --secret-string "<YOUR_GEMINI_API_KEY>"
```

---

## §3 — Deploy the relay stack

```bash
pnpm --filter @nanchang/infra-relay run cdk deploy NanchangGeminiRelay --region us-east-1
```

Note the CloudFormation **Outputs** — you will need them in §4 and in Phase 3 (HK API wiring):

| Output key              | Used for                                                  |
| ----------------------- | --------------------------------------------------------- |
| `RelayFunctionUrl`      | `GEMINI_RELAY_URL` env var in the HK ECS task (Phase 3)   |
| `RelayFunctionArn`      | Referenced when adding `InvokeFunctionUrl` grant (§4)     |
| `GeminiSecretArn`       | Confirm the secret ARN matches what you updated in §2     |
| `ResourcePolicyPending` | Appears when `hkTaskRoleArn` context was not set (see §4) |

---

## §4 — Wire up the resource policy (HK task role → relay)

The relay's Function URL resource policy restricts invocation to the HK ECS task role. This requires the task role ARN from the NanchangProd stack.

**Get the HK task role ARN:**

```bash
aws iam get-role --role-name nanchang-ecs-task --query 'Role.Arn' --output text
# Output: arn:aws:iam::123456789012:role/nanchang-ecs-task
```

**Redeploy the relay stack with the ARN:**

```bash
pnpm --filter @nanchang/infra-relay run cdk deploy NanchangGeminiRelay \
  --region us-east-1 \
  --context hkTaskRoleArn=arn:aws:iam::123456789012:role/nanchang-ecs-task
```

This adds a resource-based policy entry that allows only `lambda:InvokeFunctionUrl` from that specific IAM principal. No other principal can call the relay.

---

## §5 — Smoke test (from a non-HK location)

Before wiring the HK API (Phase 3), verify the relay works end-to-end from a machine that can reach Gemini (any non-HK location — your dev machine is fine).

You need AWS credentials with `lambda:InvokeFunctionUrl` on the relay function. Use the same account credentials or temporarily grant yourself the permission.

```bash
# Get the Function URL from CDK output or:
RELAY_URL=$(aws lambda get-function-url-config \
  --function-name nanchang-gemini-relay \
  --region us-east-1 \
  --query FunctionUrl --output text)

# Install the AWS SigV4 signing tool (or use a signed AWS SDK call)
# Example using curl with aws-sigv4 (requires curl ≥ 7.75):
curl --aws-sigv4 "aws:amz:us-east-1:lambda" \
  --user "$(aws configure get aws_access_key_id):$(aws configure get aws_secret_access_key)" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "promptVersion": "v1",
    "systemInstruction": "You are a Nanchang Mahjong commentator. Reply only in the JSON format specified.",
    "userPrompt": "Summarise a short test game in 1 sentence.",
    "responseSchema": {
      "type": "object",
      "properties": { "en": { "type": "string" }, "zh": { "type": "string" } },
      "required": ["en", "zh"]
    }
  }' \
  "$RELAY_URL"

# Expected: {"text":{"en":"...","zh":"..."},"model":"gemini-2.5-flash","promptVersion":"v1"}
```

---

## §6 — Phase 3 wiring (HK API → relay)

Once the smoke test passes, proceed to Phase 3 (`feat/ai-commentary-phase-3`):

1. Add `GEMINI_RELAY_URL` and `GEMINI_RELAY_REGION` env vars to the NanchangProd ECS task definition (CDK update in `infra/aws/lib/nanchang-stack.ts`).
2. Grant the HK ECS task role `lambda:InvokeFunctionUrl` on the relay function (CDK update in `infra/aws`).
3. Implement `GeminiRelayClient` in `apps/api` (SigV4-signed HTTP call to the Function URL).

---

## Ongoing: updating the relay Lambda

Code changes to `services/gemini-relay/` require redeploying this stack:

```bash
pnpm --filter @nanchang/infra-relay run cdk deploy NanchangGeminiRelay \
  --region us-east-1 \
  --context hkTaskRoleArn=<ARN>   # keep the resource policy intact
```

The `main` auto-deploy to ap-east-1 does **not** touch this stack. Relay deploys are always manual.

---

## Cost estimate (us-east-1, family-scale usage)

| Resource                             | Estimated monthly cost   |
| ------------------------------------ | ------------------------ |
| Lambda invocations (< 1 M/month)     | ~$0 (free tier)          |
| Lambda compute (256 MB, < 120 s avg) | ~$0 (free tier)          |
| Secrets Manager (1 secret)           | ~$0.40                   |
| CloudWatch Logs (1-week retention)   | ~$0.10                   |
| Gemini API (Flash, family volume)    | ~$1–5 (depends on usage) |
| **Total AWS**                        | **< $1 / month**         |

Gemini API cost is billed separately to your Google Cloud project.
