/**
 * Psychic bot cheat context — controlled foresight injection.
 *
 * The CheatContext carries two pieces of privileged information:
 *   1. A shallow lookahead window into the upcoming draw pile.
 *   2. Each opponent's exact distance to Ting (tenpai).
 *
 * This context is ONLY constructed for 'psychic' difficulty. Every other
 * difficulty path receives null, keeping the base math functions completely
 * clean of cheat logic. See the "Quarantine Rule" in CLAUDE.md.
 *
 * All functions are pure — no I/O, no mutation.
 */

import { typeOf } from '../tiles';
import { overallDist } from './ting-distance';
import type { TileType, GameState } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * How many tiles deep the Psychic bot can see into the upcoming wall.
 * Tune this to adjust the bot's foresight advantage.
 */
export const PSYCHIC_LOOKAHEAD_DEPTH = 5;

/**
 * Per-lookahead-tile bonus added to effectiveDraws when a wall tile is
 * confirmed to reduce the bot's distance to Ting. Large enough to dominate
 * the normal effective-draws score when the lookahead tile is a guaranteed hit.
 */
export const PSYCHIC_LOOKAHEAD_BOOST = 20;

// ── Cheat context ─────────────────────────────────────────────────────────────

/**
 * Privileged information injected exclusively into the Psychic bot's
 * decision functions. Non-psychic bots never see this payload.
 *
 * Seat indices are used as keys for `opponentTingDistances` (0–3).
 */
export interface CheatContext {
  /** The next PSYCHIC_LOOKAHEAD_DEPTH tiles that will be drawn from the wall, in order. */
  wallLookahead: TileType[];
  /** Map of opponent seat index → their current Distance to Ting. */
  opponentTingDistances: Record<number, number>;
}

// ── Context builder ───────────────────────────────────────────────────────────

/**
 * Build a CheatContext from the authoritative server-side GameState.
 *
 * Returns null for every difficulty except 'psychic', and also null if
 * the wall has not yet been built (jing_reveal or dealing phase).
 *
 * The caller passes `difficulty` as a plain string so this module has no
 * circular import dependency on bot-engine.ts.
 *
 * @param state      Full authoritative game state (server only — never the
 *                   redacted client snapshot).
 * @param botSeat    The psychic bot's own seat index (excluded from opponent map).
 * @param difficulty Bot difficulty string. Only 'psychic' returns a payload.
 */
export function buildCheatContext(
  state: GameState,
  botSeat: 0 | 1 | 2 | 3,
  difficulty: string,
): CheatContext | null {
  if (difficulty !== 'psychic') return null;
  const { wall } = state;
  if (!wall) return null;

  // Collect active jing types for accurate Ting distance calculations
  const jingTypes: TileType[] = [];
  if (state.jingPrimary) jingTypes.push(state.jingPrimary);
  if (state.jingSecondary) jingTypes.push(state.jingSecondary);

  // Lookahead window: slice the next N tile IDs from draw position, convert to types
  const wallLookahead: TileType[] = wall.drawOrder
    .slice(wall.drawPtr, wall.drawPtr + PSYCHIC_LOOKAHEAD_DEPTH)
    .map(typeOf);

  // Opponent Ting distances: computed from their full concealed hands
  // (only accessible server-side; never available in the client snapshot)
  const opponentTingDistances: Record<number, number> = {};
  for (let i = 0; i < 4; i++) {
    if (i === botSeat) continue;
    opponentTingDistances[i] = overallDist(state.seats[i as 0 | 1 | 2 | 3].hand, jingTypes);
  }

  return { wallLookahead, opponentTingDistances };
}
