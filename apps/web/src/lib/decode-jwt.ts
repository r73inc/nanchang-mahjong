/**
 * Minimal Base64url JWT decoder — extracts the payload claims without verifying.
 * Safe on the client: the server already validated the signature.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2) throw new Error('Malformed JWT');
  // Replace Base64url chars, pad to multiple of 4
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return JSON.parse(atob(padded)) as Record<string, unknown>;
}
