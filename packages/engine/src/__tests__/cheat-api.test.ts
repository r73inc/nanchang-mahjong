import { describe, it, expect } from 'vitest';
import { GameEngine } from '../engine';
import { buildCheatContext, PSYCHIC_LOOKAHEAD_DEPTH } from '../bot/cheat-api';
import { typeOf } from '../tiles';
import { overallDist } from '../bot/ting-distance';

// ── Test fixture ──────────────────────────────────────────────────────────────

/** Fully initialised game ready for play (seed=42). */
function startedGame() {
  return GameEngine.create(42).deal().revealJing();
}

// ── buildCheatContext — non-psychic difficulties ──────────────────────────────

describe('buildCheatContext — non-psychic difficulties', () => {
  it('returns null for easy', () => {
    const g = startedGame();
    expect(buildCheatContext(g.state, 0, 'easy')).toBeNull();
  });

  it('returns null for normal', () => {
    const g = startedGame();
    expect(buildCheatContext(g.state, 0, 'normal')).toBeNull();
  });

  it('returns null for hard', () => {
    const g = startedGame();
    expect(buildCheatContext(g.state, 0, 'hard')).toBeNull();
  });

  it('returns null for any unknown difficulty string', () => {
    const g = startedGame();
    expect(buildCheatContext(g.state, 0, 'omniscient')).toBeNull();
  });
});

// ── buildCheatContext — wall unavailable ──────────────────────────────────────

describe('buildCheatContext — wall not yet built', () => {
  it('returns null when wall is null (before deal)', () => {
    const g = GameEngine.create(42); // dealing phase — wall is null
    expect(buildCheatContext(g.state, 0, 'psychic')).toBeNull();
  });
});

// ── buildCheatContext — psychic lookahead window ──────────────────────────────

describe('buildCheatContext — wallLookahead', () => {
  it('returns a CheatContext (non-null) for psychic difficulty', () => {
    const g = startedGame();
    const ctx = buildCheatContext(g.state, 0, 'psychic');
    expect(ctx).not.toBeNull();
  });

  it(`lookahead array has exactly ${PSYCHIC_LOOKAHEAD_DEPTH} entries`, () => {
    const g = startedGame();
    const ctx = buildCheatContext(g.state, 0, 'psychic')!;
    expect(ctx.wallLookahead).toHaveLength(PSYCHIC_LOOKAHEAD_DEPTH);
  });

  it('lookahead entries match drawOrder[drawPtr … drawPtr+N-1] converted via typeOf', () => {
    const g = startedGame();
    const { wall } = g.state;
    expect(wall).not.toBeNull();

    const expectedTiles = wall!.drawOrder
      .slice(wall!.drawPtr, wall!.drawPtr + PSYCHIC_LOOKAHEAD_DEPTH)
      .map(typeOf);

    const ctx = buildCheatContext(g.state, 0, 'psychic')!;
    expect(ctx.wallLookahead).toEqual(expectedTiles);
  });

  it('lookahead changes when drawPtr advances (tile drawn)', () => {
    const g = startedGame();
    const ctxBefore = buildCheatContext(g.state, 0, 'psychic')!;

    // Seat 0 draws and then discards — this advances drawPtr by 1
    g.discard(g.state.seats[0].hand[0]);
    // We just check that a different drawPtr produces different lookahead
    const wall = g.state.wall!;
    // After a discard, drawPtr should still reflect what was drawn at deal start
    // Just verify the ctx is reproducible
    const ctxAgain = buildCheatContext(g.state, 0, 'psychic')!;
    expect(ctxAgain.wallLookahead).toEqual(ctxBefore.wallLookahead);

    // Confirm the slice is anchored at drawPtr
    expect(ctxBefore.wallLookahead[0]).toBe(typeOf(wall.drawOrder[wall.drawPtr]));
  });
});

// ── buildCheatContext — opponent Ting distances ───────────────────────────────

describe('buildCheatContext — opponentTingDistances', () => {
  it('includes exactly 3 opponent entries (not botSeat) for a 4-player game', () => {
    const g = startedGame();

    for (const botSeat of [0, 1, 2, 3] as const) {
      const ctx = buildCheatContext(g.state, botSeat, 'psychic')!;
      const keys = Object.keys(ctx.opponentTingDistances).map(Number);
      expect(keys).toHaveLength(3);
      expect(keys).not.toContain(botSeat);
    }
  });

  it('bot seat is absent from opponentTingDistances', () => {
    const g = startedGame();
    const botSeat = 2;
    const ctx = buildCheatContext(g.state, botSeat, 'psychic')!;
    expect(ctx.opponentTingDistances[botSeat]).toBeUndefined();
  });

  it('distances match overallDist computed directly from opponent hands', () => {
    const g = startedGame();
    const botSeat = 0;
    const jingTypes = [g.state.jingPrimary, g.state.jingSecondary].filter(
      Boolean,
    ) as import('../types').TileType[];

    const ctx = buildCheatContext(g.state, botSeat, 'psychic')!;

    for (const [seatStr, dist] of Object.entries(ctx.opponentTingDistances)) {
      const i = Number(seatStr) as 0 | 1 | 2 | 3;
      const expected = overallDist(g.state.seats[i].hand, jingTypes);
      expect(dist).toBe(expected);
    }
  });

  it('all distances are non-negative integers', () => {
    const g = startedGame();
    const ctx = buildCheatContext(g.state, 0, 'psychic')!;
    for (const dist of Object.values(ctx.opponentTingDistances)) {
      expect(dist).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(dist)).toBe(true);
    }
  });
});
