/**
 * PushController — Web Push subscription management endpoints.
 *
 * All routes require authentication (JwtAuthGuard from AuthModule).
 *
 * GET  /push/vapid-public-key  — returns the VAPID public key
 * POST /push/subscribe         — stores or updates the caller's push subscription
 * DELETE /push/unsubscribe     — removes the caller's push subscription
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { PushService } from './push.service';

// ── Request schema ────────────────────────────────────────────────────────────

const SubscribeBodySchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

type SubscribeBody = z.infer<typeof SubscribeBodySchema>;

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('push')
@UseGuards(JwtGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  /** Return the VAPID public key so the FE can call pushManager.subscribe(). */
  @Get('vapid-public-key')
  getVapidPublicKey(): { publicKey: string } {
    return { publicKey: this.push.getPublicKey() };
  }

  /**
   * Store or replace the caller's Web Push subscription.
   * Rate-limited to 10 calls per minute to prevent abuse.
   */
  @Post('subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SubscribeBody,
  ): Promise<void> {
    const parsed = SubscribeBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException(parsed.error.flatten());
    }
    await this.push.subscribe(user.sub, {
      endpoint: parsed.data.endpoint,
      keys: parsed.data.keys,
    });
  }

  /** Remove the caller's push subscription. */
  @Delete('unsubscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.push.unsubscribe(user.sub);
  }
}
