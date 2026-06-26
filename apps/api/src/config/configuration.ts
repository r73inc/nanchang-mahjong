export const configuration = () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-prod',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-in-prod',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  },

  aws: {
    region: process.env.AWS_REGION ?? 'ap-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoints: {
      dynamodb: process.env.AWS_ENDPOINT_URL_DYNAMODB,
      s3: process.env.AWS_ENDPOINT_URL_S3,
    },
  },

  dynamodb: {
    tableName: process.env.DYNAMODB_TABLE_NAME ?? 'nanchang_main',
  },

  s3: {
    replayBucket: process.env.S3_REPLAY_BUCKET ?? 'nanchang-replays',
    avatarBucket: process.env.S3_AVATAR_BUCKET ?? 'nanchang-avatars',
  },

  rateLimit: {
    ttlMs: parseInt(process.env.RATE_LIMIT_TTL_MS ?? '60000', 10),
    maxPublic: parseInt(process.env.RATE_LIMIT_MAX_PUBLIC ?? '5', 10),
    maxAuth: parseInt(process.env.RATE_LIMIT_MAX_AUTHED ?? '60', 10),
  },

  /**
   * Gemini Relay — us-east-1 Lambda Function URL.
   * Leave url empty to disable AI summary generation (graceful no-op, mirrors VAPID pattern).
   */
  geminiRelay: {
    url: process.env.GEMINI_RELAY_URL ?? '',
    region: process.env.GEMINI_RELAY_REGION ?? 'us-east-1',
    model: process.env.GEMINI_RELAY_MODEL ?? 'gemini-2.5-flash',
    challengeWordCap: parseInt(process.env.GEMINI_CHALLENGE_WORD_CAP ?? '400', 10),
  },

  /**
   * Web Push (VAPID) configuration.
   * Generate a key pair with: npx web-push generate-vapid-keys
   * Leave publicKey/privateKey empty to disable push in dev (graceful no-op).
   */
  vapid: {
    subject: process.env.VAPID_SUBJECT ?? 'mailto:admin@nanchang.example.com',
    publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    privateKey: process.env.VAPID_PRIVATE_KEY ?? '',
  },
});

export type AppConfig = ReturnType<typeof configuration>;
