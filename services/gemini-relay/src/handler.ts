import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type {
  RelayGenerateResponse,
  RelayErrorResponse,
  AiSummaryErrorCode,
} from '@nanchang/shared';
import { SizeError, ParseError } from './errors';
import { getRawBody, parseAndValidate } from './validate';
import { getGeminiKey } from './secrets';
import { callGemini } from './gemini-client';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  // ── 1. Parse + validate request ────────────────────────────────────────────
  let request;
  try {
    request = parseAndValidate(getRawBody(event));
  } catch (err) {
    if (err instanceof SizeError) {
      return errorJson(413, 'payload_too_large', err.message);
    }
    return errorJson(400, 'validation', err instanceof Error ? err.message : 'Invalid request');
  }

  // ── 2. Retrieve Gemini API key from Secrets Manager ────────────────────────
  let apiKey: string;
  try {
    apiKey = await getGeminiKey();
  } catch {
    return errorJson(500, '5xx', 'Failed to retrieve Gemini API key from Secrets Manager');
  }

  // ── 3. Call Gemini and map response / errors ───────────────────────────────
  try {
    const text = await callGemini(apiKey, request);
    const response: RelayGenerateResponse = {
      text,
      model: request.model,
      promptVersion: request.promptVersion,
    };
    return json(200, response);
  } catch (err) {
    return mapGeminiError(err);
  }
};

// ── Error mapping ─────────────────────────────────────────────────────────────

function mapGeminiError(err: unknown): APIGatewayProxyResultV2 {
  if (err instanceof ParseError) {
    return errorJson(500, 'parse', err.message);
  }

  const status = extractHttpStatus(err);
  if (status === 403) return errorJson(403, '403', 'Gemini API key is invalid or access denied');
  if (status === 404) return errorJson(404, '404', 'Gemini model not found');
  if (status === 429)
    return errorJson(429, '5xx', 'Gemini rate limit or quota exceeded — retryable');
  if (status >= 400 && status < 500) {
    return errorJson(400, 'validation', `Gemini rejected the request (HTTP ${status})`);
  }
  if (status >= 500) {
    return errorJson(502, '5xx', `Gemini returned HTTP ${status}`);
  }

  const msg = err instanceof Error ? err.message : String(err);
  if (msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('timed out')) {
    return errorJson(504, 'timeout', 'Gemini request timed out');
  }

  return errorJson(502, '5xx', msg || 'Unexpected error calling Gemini');
}

/**
 * Extracts an HTTP status code from a Gemini SDK error.
 * The SDK wraps HTTP errors in GoogleGenerativeAIFetchError which exposes
 * a .status property; we also check common .statusCode shapes defensively.
 */
function extractHttpStatus(err: unknown): number {
  if (!err || typeof err !== 'object') return 0;
  const e = err as Record<string, unknown>;
  if (typeof e.status === 'number') return e.status;
  if (typeof e.statusCode === 'number') return e.statusCode;
  if (e.response && typeof e.response === 'object') {
    const r = e.response as Record<string, unknown>;
    if (typeof r.status === 'number') return r.status;
  }
  return 0;
}

// ── Response helpers ──────────────────────────────────────────────────────────

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function errorJson(
  statusCode: number,
  errorCode: AiSummaryErrorCode,
  message: string,
): APIGatewayProxyResultV2 {
  const body: RelayErrorResponse = { errorCode, message };
  return json(statusCode, body);
}
