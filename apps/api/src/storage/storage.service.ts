import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AppConfig } from '../config/configuration';
import type { ReplayGamePayload } from '@nanchang/shared';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: S3Client;
  readonly bucket: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    this.bucket = this.config.get('s3.replayBucket', { infer: true });
  }

  async onModuleInit(): Promise<void> {
    const awsCfg = this.config.get('aws', { infer: true });
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
    await this.ensureBucket();
  }

  /** Create the replay bucket if it does not yet exist. */
  private async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`S3 bucket created: ${this.bucket}`);
      } catch (err) {
        // Non-fatal: bucket may already exist or endpoint is unavailable in test env
        this.logger.warn(`Could not create S3 bucket ${this.bucket}: ${String(err)}`);
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

  /** Upload a user avatar image to S3. Returns the object key. */
  async putAvatar(userId: string, buffer: Buffer, contentType: string): Promise<string> {
    const ext = contentType === 'image/png' ? 'png' : 'jpg';
    const key = `avatars/${userId}.${ext}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    return key;
  }

  /** Generate a pre-signed GET URL for an avatar (1 hour expiry). */
  async getAvatarUrl(key: string): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: 3600,
    });
  }
}
