import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
const SECRET_NAME = process.env.GEMINI_SECRET_NAME ?? 'nanchang/gemini-api-key';

// Cache the key across warm Lambda invocations to avoid a Secrets Manager
// round-trip on every request.
let cached: string | undefined;

export async function getGeminiKey(): Promise<string> {
  if (cached) return cached;

  const response = await client.send(new GetSecretValueCommand({ SecretId: SECRET_NAME }));
  if (!response.SecretString) {
    throw new Error(`Secret '${SECRET_NAME}' exists but has no string value`);
  }

  cached = response.SecretString.trim();
  return cached;
}

/** Exposed for tests that need to reset the module-level cache between cases. */
export function _resetCache(): void {
  cached = undefined;
}
