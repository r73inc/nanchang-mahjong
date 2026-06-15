/**
 * PushService — Web Push (VAPID) subscription management and notification delivery.
 *
 * Subscriptions are stored in DynamoDB at USER#<sub>/PUSH_SUB.
 * If VAPID keys are not configured (dev default), all sends are silent no-ops.
 *
 * Turn notifications are fired by GameService when a player's socket is offline.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { DynamoDBService, DK } from '../database/dynamodb.service';
import type { AppConfig } from '../config/configuration';

export interface StoredPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface PushPayload {
  title: string;
  body: string;
  [key: string]: unknown;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly db: DynamoDBService,
  ) {}

  onModuleInit(): void {
    const { publicKey, privateKey, subject } = this.config.get('vapid', { infer: true });
    if (!publicKey || !privateKey) {
      this.logger.warn(
        'VAPID keys not configured — push notifications disabled. ' +
          'Run `npx web-push generate-vapid-keys` to generate keys.',
      );
      return;
    }
    webPush.setVapidDetails(subject, publicKey, privateKey);
    this.enabled = true;
    this.logger.log('Web Push ready');
  }

  /** Returns the VAPID public key for the frontend to pass to pushManager.subscribe(). */
  getPublicKey(): string {
    return this.config.get('vapid.publicKey', { infer: true });
  }

  // ── Subscription lifecycle ───────────────────────────────────────────────────

  /**
   * Persist a push subscription for the given user.
   * Overwrites any existing subscription (only latest device is kept).
   */
  async subscribe(userId: string, subscription: StoredPushSubscription): Promise<void> {
    await this.db.put({
      Item: {
        ...DK.userPushSub(userId),
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        createdAt: new Date().toISOString(),
      },
    });
  }

  /** Remove the user's push subscription. */
  async unsubscribe(userId: string): Promise<void> {
    await this.db.delete({ Key: DK.userPushSub(userId) });
  }

  /** Retrieve the stored subscription for a user, or null if none. */
  async getSubscription(userId: string): Promise<StoredPushSubscription | null> {
    const result = await this.db.get({ Key: DK.userPushSub(userId) });
    if (!result.Item) return null;
    const item = result.Item as Record<string, string>;
    return {
      endpoint: item.endpoint,
      keys: { p256dh: item.p256dh, auth: item.auth },
    };
  }

  // ── Delivery ─────────────────────────────────────────────────────────────────

  /** Send a push notification to a user. Silent no-op if not enabled or no subscription. */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.enabled) return;
    const sub = await this.getSubscription(userId);
    if (!sub) return;

    try {
      await webPush.sendNotification(sub, JSON.stringify(payload));
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 410 || status === 404) {
        // Subscription expired or invalid — clean it up
        this.logger.warn(`Removing expired push subscription for user ${userId}`);
        await this.unsubscribe(userId);
      } else {
        this.logger.error(`Push delivery failed for ${userId}:`, err);
      }
    }
  }

  /** Convenience: fire "your turn" notification for a user in a game. */
  async sendTurnNotification(userId: string, gameId: string): Promise<void> {
    await this.sendToUser(userId, {
      title: 'Your Turn',
      body: "It's your turn in Nanchang Mahjong!",
      gameId,
    });
  }

  /** Notify a user that they have been challenged by another player. */
  async sendChallengeInviteNotification(
    userId: string,
    challengeId: string,
    creatorHandle: string,
  ): Promise<void> {
    await this.sendToUser(userId, {
      title: 'Point Challenge',
      body: `${creatorHandle} has challenged you to a Point Challenge!`,
      challengeId,
      url: `/challenges/${challengeId}`,
    });
  }
}
