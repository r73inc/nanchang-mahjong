/**
 * claim-resolver — pure simultaneous-claim resolution.
 *
 * Priority (rules §4.2): Win > Kong/Pung > Chow.
 * Multi-ron (decision D3): all valid win claims score simultaneously.
 *
 * This module is intentionally side-effect-free so it can be unit-tested
 * independently of the gateway and engine state machine.
 */

import { canWin, chowOptions, separateJing } from '@nanchang/engine';
import type { GameState, TileType } from '@nanchang/engine';
import type { ClaimAction } from '@nanchang/shared';

/** Build the jingTypes array from GameState (empty before reveal). */
function getJingTypes(state: GameState): TileType[] {
  const types: TileType[] = [];
  if (state.jingPrimary) types.push(state.jingPrimary);
  if (state.jingSecondary) types.push(state.jingSecondary);
  return types;
}

export type Seat4 = 0 | 1 | 2 | 3;
export type ClaimKind = 'win' | 'pung' | 'kong' | 'chow';

export interface IncomingClaim {
  seat: Seat4;
  kind: ClaimKind;
  sequence?: [TileType, TileType, TileType];
}

export interface ClaimResolution {
  /** All win claims (multi-ron: all apply simultaneously). */
  winners: IncomingClaim[];
  /** The single non-win claim that was applied (null if no action taken). */
  applied: IncomingClaim | null;
  /** Claims that were submitted but lost to a higher-priority claim. */
  contested: IncomingClaim[];
}

/**
 * Compute which claims each seat is eligible for given the current awaiting_claims state.
 * Used to populate the claim window sent to each seat.
 *
 * Returns a map of seat → available ClaimActions (only for seats that have ≥1 option).
 */
export function computeEligibleClaims(state: GameState): Map<Seat4, ClaimAction[]> {
  const result = new Map<Seat4, ClaimAction[]>();

  const { pendingDiscard, discardedBySeat } = state;
  if (state.phase !== 'awaiting_claims' || pendingDiscard === null || discardedBySeat === null) {
    return result;
  }

  const jingTypes = getJingTypes(state);
  // Rules §4.2: chow is only allowed by the player immediately after the discarder (CCW).
  const nextSeat = ((discardedBySeat + 1) % 4) as Seat4;

  for (let i = 0; i < 4; i++) {
    const seat = i as Seat4;
    if (seat === discardedBySeat) continue; // cannot claim own discard

    const seatState = state.seats[seat];
    const hand = seatState.hand; // concealed tiles (fewer than 13 if the player has open melds)
    // Flat tile list of all already-played open meld tiles for this seat.
    // Needed so canWin can verify the claimed tile completes a full 14-tile hand.
    const openMeldTiles = seatState.openMelds.flatMap((m) => [...m.tiles]);
    const actions: ClaimAction[] = [];

    if (canWin(hand, pendingDiscard, jingTypes, openMeldTiles)) actions.push({ kind: 'win' });

    // Family rule: wildcards (jing tiles) may NOT be used to form open melds (pung/chow).
    // Only offer pung/chow when the player has enough NATURAL copies (no jing substitution).
    const { naturals } = separateJing(hand, jingTypes);
    const naturalCount = naturals.filter((t) => t === pendingDiscard).length;

    if (naturalCount >= 2) actions.push({ kind: 'pung' });

    // Family rule: wildcards may NOT substitute in open kongs.
    // Only offer kong when the player holds 3 exact copies of the discarded tile.
    // This also handles the edge case where the discarded tile IS a wildcard:
    // if a player holds 3 of the same wildcard naturally, kongCount = 3 → allowed.
    const kongCount = hand.filter((t) => t === pendingDiscard).length;
    if (kongCount >= 3) actions.push({ kind: 'kong' });

    // Chow is restricted to the single seat immediately after the discarder.
    // Only offer sequences achievable without any jing substitution.
    if (seat === nextSeat) {
      const allSeqs = chowOptions(hand, pendingDiscard, jingTypes);
      const naturalSeqs = allSeqs.filter((seq) => {
        let tempNaturals = [...naturals];
        for (const t of seq) {
          if (t === pendingDiscard) continue; // discard fills this position
          const idx = tempNaturals.indexOf(t);
          if (idx !== -1) {
            tempNaturals = [...tempNaturals.slice(0, idx), ...tempNaturals.slice(idx + 1)];
          } else {
            return false; // would need a jing — exclude
          }
        }
        return true;
      });
      if (naturalSeqs.length > 0) {
        actions.push({ kind: 'chow', sequences: naturalSeqs });
      }
    }

    if (actions.length > 0) result.set(seat, actions);
  }

  return result;
}

/**
 * Compute which seats can rob an add-to-kong (win only).
 * Called after a successful addToKong — opens a short rob-kong claim window.
 */
export function computeRobKongEligible(state: GameState, kongTile: TileType): Set<Seat4> {
  const eligible = new Set<Seat4>();
  const kongSeat = state.currentSeat; // the seat that just added to kong
  const jingTypes = getJingTypes(state);

  for (let i = 0; i < 4; i++) {
    const seat = i as Seat4;
    if (seat === kongSeat) continue;

    // A rob-kong win is treated like a ron win on the kong tile.
    const seatState = state.seats[seat];
    const openMeldTiles = seatState.openMelds.flatMap((m) => [...m.tiles]);
    if (canWin(seatState.hand, kongTile, jingTypes, openMeldTiles)) {
      eligible.add(seat);
    }
  }

  return eligible;
}

/**
 * Resolve a set of simultaneous claims by priority.
 *
 * Priority: Win > Kong/Pung > Chow
 * Multi-ron (D3): all win claims are applied together (not head-bump).
 * Contested losers receive a game:contested notification so the FE can show the toast.
 */
export function resolveClaims(claims: IncomingClaim[]): ClaimResolution {
  if (claims.length === 0) {
    return { winners: [], applied: null, contested: [] };
  }

  const wins = claims.filter((c) => c.kind === 'win');
  const kongPungs = claims.filter((c) => c.kind === 'pung' || c.kind === 'kong');
  const chows = claims.filter((c) => c.kind === 'chow');

  if (wins.length > 0) {
    // Multi-ron: all win claims apply; lower-priority claims are contested
    return {
      winners: wins,
      applied: null,
      contested: [...kongPungs, ...chows],
    };
  }

  if (kongPungs.length > 0) {
    // Only one pung/kong can apply — take the lowest seat index (closest to discarder
    // is more correct, but the gateway passes claims in seat order so sort is safe).
    const sorted = [...kongPungs].sort((a, b) => a.seat - b.seat);
    return {
      winners: [],
      applied: sorted[0],
      contested: [...sorted.slice(1), ...chows],
    };
  }

  if (chows.length > 0) {
    // Only one seat is ever offered a chow (computeEligibleClaims gates it to nextSeat).
    // If somehow multiple arrive, take the lowest seat index as a safe fallback.
    const sorted = [...chows].sort((a, b) => a.seat - b.seat);
    return {
      winners: [],
      applied: sorted[0],
      contested: sorted.slice(1),
    };
  }

  return { winners: [], applied: null, contested: [] };
}
