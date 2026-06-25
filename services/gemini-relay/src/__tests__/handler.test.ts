import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type {
  RelayGenerateRequest,
  RelayGenerateResponse,
  RelayErrorResponse,
} from '@nanchang/shared';
import { ParseError } from '../errors';
import { MAX_BODY_BYTES } from '../validate';

// ── Module mocks (hoisted automatically by Vitest) ────────────────────────────

vi.mock('../secrets', () => ({
  getGeminiKey: vi.fn(),
  _resetCache: vi.fn(),
}));

vi.mock('../gemini-client', () => ({
  callGemini: vi.fn(),
}));

import { handler } from '../handler';
import { getGeminiKey } from '../secrets';
import { callGemini } from '../gemini-client';

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_REQUEST: RelayGenerateRequest = {
  model: 'gemini-1.5-flash',
  promptVersion: 'v1',
  systemInstruction: 'You are a Nanchang Mahjong commentator.',
  userPrompt: 'Summarise this game.',
  responseSchema: {
    type: 'object',
    properties: { en: { type: 'string' }, zh: { type: 'string' } },
    required: ['en', 'zh'],
  },
};

function makeEvent(body: unknown, extra?: Partial<APIGatewayProxyEventV2>): APIGatewayProxyEventV2 {
  const rawBody =
    body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  return {
    body: rawBody,
    isBase64Encoded: false,
    ...extra,
  } as APIGatewayProxyEventV2;
}

function parseBody<T>(result: Awaited<ReturnType<typeof handler>>): T {
  if (typeof result === 'object' && result !== null && 'body' in result) {
    return JSON.parse((result as { body: string }).body) as T;
  }
  throw new Error('Unexpected handler result shape');
}

function statusOf(result: Awaited<ReturnType<typeof handler>>): number {
  if (typeof result === 'object' && result !== null && 'statusCode' in result) {
    return (result as { statusCode: number }).statusCode;
  }
  throw new Error('Unexpected handler result shape');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Relay·handler', () => {
  beforeEach(() => {
    vi.mocked(getGeminiKey).mockResolvedValue('test-gemini-key');
    vi.mocked(callGemini).mockResolvedValue({ en: 'Great game!', zh: '好游戏！' });
  });

  // ── Contract: success path ─────────────────────────────────────────────────

  it('returns 200 with bilingual RelayGenerateResponse on success', async () => {
    const result = await handler(makeEvent(VALID_REQUEST));

    expect(statusOf(result)).toBe(200);
    const body = parseBody<RelayGenerateResponse>(result);
    expect(body.text).toEqual({ en: 'Great game!', zh: '好游戏！' });
    expect(body.model).toBe('gemini-1.5-flash');
    expect(body.promptVersion).toBe('v1');
  });

  it('passes the API key and full request through to callGemini', async () => {
    await handler(makeEvent(VALID_REQUEST));

    expect(vi.mocked(callGemini)).toHaveBeenCalledWith(
      'test-gemini-key',
      expect.objectContaining({
        model: VALID_REQUEST.model,
        systemInstruction: VALID_REQUEST.systemInstruction,
        userPrompt: VALID_REQUEST.userPrompt,
      }),
    );
  });

  // ── Validation: missing / malformed body ──────────────────────────────────

  it('returns 400 validation when body is absent', async () => {
    const result = await handler(makeEvent(undefined));

    expect(statusOf(result)).toBe(400);
    const body = parseBody<RelayErrorResponse>(result);
    expect(body.errorCode).toBe('validation');
  });

  it('returns 400 validation when body is not valid JSON', async () => {
    const result = await handler(makeEvent('not-json', { body: 'not-json' }));

    expect(statusOf(result)).toBe(400);
    const body = parseBody<RelayErrorResponse>(result);
    expect(body.errorCode).toBe('validation');
  });

  it('returns 400 validation when a required field is missing', async () => {
    const { model: _model, ...withoutModel } = VALID_REQUEST;
    const result = await handler(makeEvent(withoutModel));

    expect(statusOf(result)).toBe(400);
    const body = parseBody<RelayErrorResponse>(result);
    expect(body.errorCode).toBe('validation');
    expect(body.message).toMatch(/model/i);
  });

  // ── Payload size safeguard ────────────────────────────────────────────────

  it('returns 413 payload_too_large when body exceeds 4 MB', async () => {
    // Build a body slightly over the ceiling by padding the prompt.
    const padding = 'x'.repeat(MAX_BODY_BYTES + 1);
    const oversized = { ...VALID_REQUEST, userPrompt: padding };
    const result = await handler(makeEvent(oversized));

    expect(statusOf(result)).toBe(413);
    const body = parseBody<RelayErrorResponse>(result);
    expect(body.errorCode).toBe('payload_too_large');
  });

  // ── Gemini error mapping ──────────────────────────────────────────────────

  it('returns 500 parse when Gemini returns a non-JSON response', async () => {
    vi.mocked(callGemini).mockRejectedValueOnce(
      new ParseError('Gemini returned non-JSON response: <html>error</html>'),
    );

    const result = await handler(makeEvent(VALID_REQUEST));

    expect(statusOf(result)).toBe(500);
    const body = parseBody<RelayErrorResponse>(result);
    expect(body.errorCode).toBe('parse');
  });

  it('returns 403 when Gemini rejects with HTTP 403', async () => {
    const err = Object.assign(new Error('Forbidden'), { status: 403 });
    vi.mocked(callGemini).mockRejectedValueOnce(err);

    const result = await handler(makeEvent(VALID_REQUEST));

    expect(statusOf(result)).toBe(403);
    const body = parseBody<RelayErrorResponse>(result);
    expect(body.errorCode).toBe('403');
  });

  it('returns 429 5xx when Gemini returns HTTP 429 rate limit', async () => {
    const err = Object.assign(new Error('Too Many Requests'), { status: 429 });
    vi.mocked(callGemini).mockRejectedValueOnce(err);

    const result = await handler(makeEvent(VALID_REQUEST));

    expect(statusOf(result)).toBe(429);
    const body = parseBody<RelayErrorResponse>(result);
    expect(body.errorCode).toBe('5xx');
  });

  it('returns 502 5xx when Gemini returns an HTTP 500 error', async () => {
    const err = Object.assign(new Error('Internal Server Error'), { status: 500 });
    vi.mocked(callGemini).mockRejectedValueOnce(err);

    const result = await handler(makeEvent(VALID_REQUEST));

    expect(statusOf(result)).toBe(502);
    const body = parseBody<RelayErrorResponse>(result);
    expect(body.errorCode).toBe('5xx');
  });

  it('returns 504 timeout when Gemini call times out', async () => {
    vi.mocked(callGemini).mockRejectedValueOnce(new Error('Request timed out after 90000ms'));

    const result = await handler(makeEvent(VALID_REQUEST));

    expect(statusOf(result)).toBe(504);
    const body = parseBody<RelayErrorResponse>(result);
    expect(body.errorCode).toBe('timeout');
  });

  // ── Secrets Manager failure ───────────────────────────────────────────────

  it('returns 500 5xx when Secrets Manager lookup fails', async () => {
    vi.mocked(getGeminiKey).mockRejectedValueOnce(new Error('AccessDeniedException'));

    const result = await handler(makeEvent(VALID_REQUEST));

    expect(statusOf(result)).toBe(500);
    const body = parseBody<RelayErrorResponse>(result);
    expect(body.errorCode).toBe('5xx');
  });
});
