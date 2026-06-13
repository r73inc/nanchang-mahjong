/**
 * Domain exceptions for the Nanchang Mahjong engine.
 *
 * These are distinct from generic JavaScript Errors so that the API layer can
 * catch them by type, emit a structured error back to the client, and avoid
 * treating rule violations as unexpected server crashes.
 */

/** Thrown when a move violates an explicit Nanchang Mahjong rule. */
export class GameRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameRuleError';
  }
}
