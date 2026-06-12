import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3';
import type { AppConfig } from '../config/configuration';
import type { ReplayGamePayload } from '@nanchang/shared';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: S3Client;
  /** Replay bucket — private, accessed server-side only. */
  readonly bucket: string;
  /** Avatar bucket — publicly readable; browser loads images directly. */
  readonly avatarBucket: string;
  /** Set when running against local MinIO (AWS_ENDPOINT_URL_S3 is configured). */
  private localEndpoint: string | undefined;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    this.bucket = this.config.get('s3.replayBucket', { infer: true });
    this.avatarBucket = this.config.get('s3.avatarBucket', { infer: true });
  }

  async onModuleInit(): Promise<void> {
    const awsCfg = this.config.get('aws', { infer: true });
    this.localEndpoint = awsCfg.endpoints.s3 || undefined;
    this.client = new S3Client({
      region: awsCfg.region,
      ...(awsCfg.endpoints.s3 && { endpoint: awsCfg.endpoints.s3 }),
      ...(awsCfg.accessKeyId && {
        credentials: {
          accessKeyId: awsCfg.accessKeyId,
          secretAccessKey: awsCfg.secretAccessKey ?? 'local',
        },
      }),
      // MinIO requires path-style addressing; AWS S3 prefers virtual-hosted.
      forcePathStyle: !!awsCfg.endpoints.s3,
    });
    await this.ensureReplayBucket();
    await this.ensureAvatarBucket();
  }

  /** Create the replay bucket if it does not yet exist. */
  private async ensureReplayBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`S3 bucket created: ${this.bucket}`);
      } catch (err) {
        this.logger.warn(`Could not create S3 bucket ${this.bucket}: ${String(err)}`);
      }
    }
  }

  /**
   * Create the avatar bucket if it does not exist, then — in local dev only —
   * apply a public-read policy so browsers can load avatars via a direct URL
   * without needing pre-signed authentication.
   */
  private async ensureAvatarBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.avatarBucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.avatarBucket }));
        this.logger.log(`S3 bucket created: ${this.avatarBucket}`);
      } catch (err) {
        this.logger.warn(`Could not create S3 bucket ${this.avatarBucket}: ${String(err)}`);
      }
    }

    if (this.localEndpoint) {
      try {
        await this.client.send(
          new PutBucketPolicyCommand({
            Bucket: this.avatarBucket,
            Policy: JSON.stringify({
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Principal: '*',
                  Action: ['s3:GetObject'],
                  Resource: `arn:aws:s3:::${this.avatarBucket}/*`,
                },
              ],
            }),
          }),
        );
        this.logger.log(`Public-read policy applied to ${this.avatarBucket}`);
      } catch (err) {
        this.logger.warn(`Could not set public policy on ${this.avatarBucket}: ${String(err)}`);
      }
    }
  }

  /** Write a replay payload to S3 as a JSON object. */
  async putReplay(gameId: string, payload: ReplayGamePayload): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: `replays/${gameId}.json`,
        Body: JSON.stringify(payload),
        ContentType: 'application/json',
      }),
    );
  }

  /** Read and parse a replay payload from S3. */
  async getReplay(gameId: string): Promise<ReplayGamePayload> {
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: `replays/${gameId}.json`,
      }),
    );
    const body = await res.Body?.transformToString('utf-8');
    if (!body) throw new Error(`Empty replay body for game ${gameId}`);
    return JSON.parse(body) as ReplayGamePayload;
  }

  /**
   * Upload a user avatar image to the avatar bucket. Returns the object key.
   * Extension-less key so re-uploads overwrite the same object (no orphans).
   */
  async putAvatar(userId: string, buffer: Buffer, contentType: string): Promise<string> {
    const key = userId;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.avatarBucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    return key;
  }

  /**
   * Fetch an avatar from S3 and return its raw bytes + content-type.
   * Used by the avatar proxy endpoint — the API streams the bytes back to the browser
   * so the browser never needs a direct connection to MinIO.
   */
  async getAvatarBuffer(key: string): Promise<{ buffer: Buffer; contentType: string }> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.avatarBucket, Key: key }),
    );
    const bytes = await res.Body!.transformToByteArray();
    return { buffer: Buffer.from(bytes), contentType: res.ContentType ?? 'image/jpeg' };
  }
}
