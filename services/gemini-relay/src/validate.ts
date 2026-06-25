import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { RelayGenerateRequest } from '@nanchang/shared';
import { ValidationError, SizeError } from './errors';

/**
 * Conservative ceiling well under the 6 MB synchronous Lambda payload limit.
 * Requests exceeding this are rejected before calling the relay.
 */
export const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4 MB

/** Extracts the raw body string, decoding base64 if the Function URL marked it so. */
export function getRawBody(event: APIGatewayProxyEventV2): string | undefined {
  if (!event.body) return undefined;
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, 'base64').toString('utf8');
  }
  return event.body;
}

/**
 * Parses the raw request body and validates the RelayGenerateRequest contract.
 * Throws ValidationError or SizeError on failure — callers map these to HTTP 400/413.
 */
export function parseAndValidate(raw: string | undefined): RelayGenerateRequest {
  if (!raw) throw new ValidationError('Missing request body');

  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    throw new SizeError(
      `Request body exceeds the ${MAX_BODY_BYTES}-byte ceiling (Lambda 6 MB hard limit safeguard)`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError('Request body is not valid JSON');
  }

  const req = parsed as Record<string, unknown>;

  if (typeof req.model !== 'string' || !req.model)
    throw new ValidationError('model is required and must be a non-empty string');
  if (typeof req.promptVersion !== 'string' || !req.promptVersion)
    throw new ValidationError('promptVersion is required and must be a non-empty string');
  if (typeof req.systemInstruction !== 'string' || !req.systemInstruction)
    throw new ValidationError('systemInstruction is required and must be a non-empty string');
  if (typeof req.userPrompt !== 'string' || !req.userPrompt)
    throw new ValidationError('userPrompt is required and must be a non-empty string');
  if (
    !req.responseSchema ||
    typeof req.responseSchema !== 'object' ||
    Array.isArray(req.responseSchema)
  )
    throw new ValidationError('responseSchema is required and must be a plain object');

  const schema = req.responseSchema as Record<string, unknown>;
  const hasType = typeof schema.type === 'string' && schema.type.length > 0;
  const hasProperties =
    schema.properties !== undefined &&
    typeof schema.properties === 'object' &&
    !Array.isArray(schema.properties);
  if (!hasType && !hasProperties) {
    throw new ValidationError(
      'responseSchema must contain at least a "type" string or a "properties" object — bare empty objects are not valid Gemini schemas',
    );
  }

  return req as unknown as RelayGenerateRequest;
}
