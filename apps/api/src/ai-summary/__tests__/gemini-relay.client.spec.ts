import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GeminiRelayClient } from '../gemini-relay.client';
import type { RelayGenerateRequest } from '@nanchang/shared';

// ── Module-level mocks ────────────────────────────────────────────────────────

jest.mock('@smithy/signature-v4', () => ({
  SignatureV4: jest.fn().mockImplementation(() => ({
    sign: jest.fn().mockResolvedValue({ headers: { authorization: 'AWS4-HMAC-SHA256 ...' } }),
  })),
}));

jest.mock('@smithy/hash-node', () => ({ Hash: jest.fn() }));

jest.mock('@aws-sdk/credential-providers', () => ({
  fromNodeProviderChain: jest.fn().mockReturnValue({}),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_REQUEST: RelayGenerateRequest = {
  model: 'gemini-2.5-flash',
  promptVersion: 'v1-game',
  systemInstruction: 'You are a commentator.',
  userPrompt: 'Summarize this game.',
  responseSchema: {
    type: 'object',
    properties: { en: { type: 'string' }, zh: { type: 'string' } },
    required: ['en', 'zh'],
  },
};

function buildClient(relayUrl: string): Promise<GeminiRelayClient> {
  return Test.createTestingModule({
    providers: [
      GeminiRelayClient,
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) => {
            if (key === 'geminiRelay') {
              return {
                url: relayUrl,
                region: 'us-east-1',
                model: 'gemini-2.5-flash',
                challengeWordCap: 400,
              };
            }
            return undefined;
          },
        },
      },
    ],
  })
    .compile()
    .then((m) => {
      const client = m.get(GeminiRelayClient);
      client.onModuleInit();
      return client;
    });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GeminiRelayClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('isEnabled is false when GEMINI_RELAY_URL is not set', async () => {
    const client = await buildClient('');
    expect(client.isEnabled).toBe(false);
  });

  it('isEnabled is true when GEMINI_RELAY_URL is set', async () => {
    const client = await buildClient('https://abc.lambda-url.us-east-1.on.aws/');
    expect(client.isEnabled).toBe(true);
  });

  it('returns 5xx error when relay is disabled', async () => {
    const client = await buildClient('');
    const result = await client.generate(VALID_REQUEST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('5xx');
  });

  it('returns payload_too_large when body exceeds 4 MB', async () => {
    const client = await buildClient('https://abc.lambda-url.us-east-1.on.aws/');
    const bigRequest = { ...VALID_REQUEST, userPrompt: 'x'.repeat(5 * 1024 * 1024) };
    const result = await client.generate(bigRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('payload_too_large');
  });

  it('returns ok:true with parsed RelayGenerateResponse on HTTP 200', async () => {
    const client = await buildClient('https://abc.lambda-url.us-east-1.on.aws/');
    const responseBody = {
      text: { en: 'Great game!', zh: '好游戏！' },
      model: 'gemini-2.5-flash',
      promptVersion: 'v1-game',
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(responseBody)),
    }) as unknown as typeof fetch;

    const result = await client.generate(VALID_REQUEST);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.text).toEqual({ en: 'Great game!', zh: '好游戏！' });
    }
  });

  it('returns errorCode from relay error body on HTTP 4xx', async () => {
    const client = await buildClient('https://abc.lambda-url.us-east-1.on.aws/');
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve(JSON.stringify({ errorCode: '403', message: 'Access denied' })),
    }) as unknown as typeof fetch;

    const result = await client.generate(VALID_REQUEST);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('403');
      expect(result.message).toBe('Access denied');
    }
  });

  it('returns timeout errorCode when fetch throws AbortError', async () => {
    const client = await buildClient('https://abc.lambda-url.us-east-1.on.aws/');
    const abortErr = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    global.fetch = jest.fn().mockRejectedValue(abortErr) as unknown as typeof fetch;

    const result = await client.generate(VALID_REQUEST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('timeout');
  });

  it('returns 5xx on generic network failure', async () => {
    const client = await buildClient('https://abc.lambda-url.us-east-1.on.aws/');
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    const result = await client.generate(VALID_REQUEST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('5xx');
  });
});
