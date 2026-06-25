/**
 * GeminiRelayClient — SigV4-signed HTTPS client for the us-east-1 Gemini relay Lambda.
 *
 * Disabled gracefully when GEMINI_RELAY_URL is not configured (mirrors PushService pattern).
 * In production the ECS task role must have lambda:InvokeFunctionUrl on the relay ARN.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignatureV4 } from '@smithy/signature-v4';
import { Hash } from '@smithy/hash-node';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import type {
  RelayGenerateRequest,
  RelayGenerateResponse,
  RelayErrorResponse,
  AiSummaryErrorCode,
} from '@nanchang/shared';
import type { AppConfig } from '../config/configuration';

/** Conservative client-side ceiling matching the relay's own limit. */
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024; // 4 MB

/** Relay call timeout — relay allows up to 120 s; we leave a 25 s buffer. */
const RELAY_TIMEOUT_MS = 95_000;

export type RelayResult =
  | { ok: true; data: RelayGenerateResponse }
  | { ok: false; errorCode: AiSummaryErrorCode; message: string };

@Injectable()
export class GeminiRelayClient implements OnModuleInit {
  private readonly logger = new Logger(GeminiRelayClient.name);
  private enabled = false;
  private relayUrl = '';
  private signer: SignatureV4 | null = null;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  onModuleInit(): void {
    const cfg = this.config.get('geminiRelay', { infer: true });
    if (!cfg.url) {
      this.logger.warn('GEMINI_RELAY_URL not configured — AI summary generation disabled.');
      return;
    }
    this.relayUrl = cfg.url;
    this.signer = new SignatureV4({
      credentials: fromNodeProviderChain(),
      region: cfg.region,
      service: 'lambda',
      sha256: Hash.bind(null, 'sha256'),
    });
    this.enabled = true;
    this.logger.log(`Gemini relay ready → ${cfg.url}`);
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  async generate(request: RelayGenerateRequest): Promise<RelayResult> {
    if (!this.enabled || !this.signer) {
      return { ok: false, errorCode: '5xx', message: 'Gemini relay not configured' };
    }

    const body = JSON.stringify(request);
    if (Buffer.byteLength(body, 'utf8') > MAX_PAYLOAD_BYTES) {
      return {
        ok: false,
        errorCode: 'payload_too_large',
        message: `Serialized request exceeds ${MAX_PAYLOAD_BYTES}-byte ceiling before dispatch`,
      };
    }

    const url = new URL(this.relayUrl);
    const signedReq = await this.signer.sign({
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname || '/',
      headers: {
        host: url.hostname,
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(body, 'utf8')),
      },
      body,
      protocol: url.protocol,
    });

    let response: Response;
    try {
      response = await fetch(this.relayUrl, {
        method: 'POST',
        headers: signedReq.headers as Record<string, string>,
        body,
        signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'AbortError' || msg.includes('timed out'))
      ) {
        return { ok: false, errorCode: 'timeout', message: 'Gemini relay request timed out' };
      }
      return { ok: false, errorCode: '5xx', message: `Relay network error: ${msg}` };
    }

    const text = await response.text();

    if (response.ok) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return {
          ok: false,
          errorCode: 'parse',
          message: `Relay returned non-JSON: ${text.slice(0, 200)}`,
        };
      }
      return { ok: true, data: parsed as RelayGenerateResponse };
    }

    // Error path — try to parse a RelayErrorResponse body
    let errBody: RelayErrorResponse | null = null;
    try {
      errBody = JSON.parse(text) as RelayErrorResponse;
    } catch {
      // fall through
    }
    if (errBody?.errorCode) {
      return { ok: false, errorCode: errBody.errorCode, message: errBody.message };
    }
    return {
      ok: false,
      errorCode: '5xx',
      message: `Relay HTTP ${response.status}: ${text.slice(0, 200)}`,
    };
  }
}
