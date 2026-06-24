/**
 * Typed error classes for the Gemini relay.
 * Kept in their own module so tests can import them without mocking
 * the modules that throw them (gemini-client, validate).
 */

export class ValidationError extends Error {
  override readonly name = 'ValidationError';
}

/** Thrown when the request body exceeds the pre-flight size ceiling. */
export class SizeError extends Error {
  override readonly name = 'SizeError';
}

/**
 * Thrown when Gemini returns a response that is not valid JSON or is missing
 * the required 'en'/'zh' string fields — a single-pass bilingual contract
 * violation.
 */
export class ParseError extends Error {
  override readonly name = 'ParseError';
}
