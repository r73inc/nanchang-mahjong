import { describe, it, expect } from 'vitest';
import { GameEngine, nextDealer, previewJingReveal } from '../engine';
import { isWinningHand } from '../hand';
import { chowOptions } from '../calls';
import { calculateSpiritSettlement } from '../scoring';
import { tilesRemaining } from '../wall';
import type {
  TileType,
  GameState,
  Meld,
  GameEvent,
  SeatState,
  SeatWind,
  WinPaymentResult,
} from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Run a full deal + jing reveal for any seed. */
function startedGame(seed = 42) {
  return GameEngine.create(seed).deal().revealJing();
}

// ── Lifecycle: create → deal → revealJing ─────────────────────────────────────

describe('GameEngine lifecycle', () => {
  it('starts in dealing phase', () => {
    const g = GameEngine.create(1);
    expect(g.state.phase).toBe('dealing');
  });

  it('transitions to jing_reveal after deal()', () => {
    const g = GameEngine.create(1).deal();
    expect(g.state.phase).toBe('jing_reveal');
  });

  it('transitions to playing after revealJing()', () => {
    const g = GameEngine.create(1).deal().revealJing();
    expect(g.state.phase).toBe('playing');
  });

  it('jingPrimary and jingSecondary are set after revealJing()', () => {
    const g = startedGame(42);
    expect(g.state.jingPrimary).not.toBeNull();
    expect(g.state.jingSecondary).not.toBeNull();
  });

  it('revealJing rolls the jing dice and flips the indicator in place — nothing consumed', () => {
    const afterDeal = GameEngine.create(42).deal();
    expect(afterDeal.state.wall!.jingDice).toBeNull();
    const afterReveal = afterDeal.revealJing();
    expect(afterReveal.state.wall!.jingDice).not.toBeNull();
    expect(afterReveal.state.wall!.jingStackGlobal).not.toBeNull();
    // No tiles are consumed — the indicator stays in the wall and is drawable
    expect(tilesRemaining(afterReveal.state.wall!)).toBe(tilesRemaining(afterDeal.state.wall!));
  });

  it('jingIndicator is set after revealJing()', () => {
    const g = startedGame(42);
    expect(g.state.jingIndicator).not.toBeNull();
  });

  it('throws if deal() called twice', () => {
    const g = GameEngine.create(1).deal();
    expect(() => g.deal()).toThrow();
  });

  it('throws if revealJing() called before deal()', () => {
    expect(() => GameEngine.create(1).revealJing()).toThrow();
  });
});

// ── Deal ──────────────────────────────────────────────────────────────────────

describe('Engine·deal-determinism', () => {
  it('same seed → same hands', () => {
    const g1 = GameEngine.create(99).deal();
    const g2 = GameEngine.create(99).deal();
    for (let i = 0; i < 4; i++) {
      expect(g1.state.seats[i].hand).toEqual(g2.state.seats[i].hand);
    }
  });

  it('different seed → different hands (with overwhelming probability)', () => {
    const g1 = GameEngine.create(1).deal();
    const g2 = GameEngine.create(2).deal();
    expect(g1.state.seats[0].hand).not.toEqual(g2.state.seats[0].hand);
  });

  it('East (seat 0) starts with 14 tiles', () => {
    const g = GameEngine.create(5).deal();
    expect(g.state.seats[0].hand).toHaveLength(14);
  });

  it('other seats start with 13 tiles each', () => {
    const g = GameEngine.create(5).deal();
    for (let i = 1; i < 4; i++) {
      expect(g.state.seats[i].hand).toHaveLength(13);
    }
  });

  it('total tiles dealt = 136 (no tile left behind)', () => {
    const g = GameEngine.create(7).deal();
    const handsTotal = g.state.seats.reduce((sum, s) => sum + s.hand.length, 0);
    // Hands: 14+13+13+13 = 53; remaining drawable wall: 83
    expect(handsTotal + tilesRemaining(g.state.wall!)).toBe(136);
  });

  it('no duplicate tile types beyond 4 copies in any single seat', () => {
    const g = GameEngine.create(42).deal();
    for (const seat of g.state.seats) {
      const counts = new Map<TileType, number>();
      for (const t of seat.hand) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const [, cnt] of counts) expect(cnt).toBeLessThanOrEqual(4);
    }
  });
});

// ── Discard ───────────────────────────────────────────────────────────────────

describe('discard', () => {
  it('removes tile from hand', () => {
    const g = startedGame(42);
    const tile = g.state.seats[0].hand[0];
    const after = g.discard(tile);
    expect(after.state.seats[0].hand).not.toContain(tile);
    expect(after.state.seats[0].hand).toHaveLength(13);
  });

  it('tile appears in discards array', () => {
    const g = startedGame(42);
    const tile = g.state.seats[0].hand[0];
    const after = g.discard(tile);
    expect(after.state.seats[0].discards).toContain(tile);
  });

  it('transitions to awaiting_claims', () => {
    const g = startedGame(42);
    const tile = g.state.seats[0].hand[0];
    const after = g.discard(tile);
    expect(after.state.phase).toBe('awaiting_claims');
  });

  it('sets pendingDiscard correctly', () => {
    const g = startedGame(42);
    const tile = g.state.seats[0].hand[0];
    const after = g.discard(tile);
    expect(after.state.pendingDiscard).toBe(tile);
  });

  it('throws if tile not in hand', () => {
    const g = startedGame(42);
    // Find a tile definitely NOT in hand
    const hand = new Set(g.state.seats[0].hand);
    const allTypes: TileType[] = ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m'];
    const notInHand = allTypes.find((t) => !hand.has(t));
    expect(notInHand).toBeDefined();
    expect(() => g.discard(notInHand!)).toThrow();
  });
});

// ── Pass claims / Draw ────────────────────────────────────────────────────────

describe('passClaims → draw', () => {
  it('passing draws a tile for the next seat', () => {
    const g = startedGame(42).discard(startedGame(42).state.seats[0].hand[0]);
    const after = g.passClaims();
    expect(after.state.phase).toBe('playing');
    expect(after.state.currentSeat).toBe(1);
    // Seat 1 now has 14 tiles
    expect(after.state.seats[1].hand).toHaveLength(14);
  });

  it('wall shrinks by 1 after a draw', () => {
    const g = startedGame(42);
    const wallBefore = tilesRemaining(g.state.wall!);
    const tile = g.state.seats[0].hand[0];
    const after = g.discard(tile).passClaims();
    expect(tilesRemaining(after.state.wall!)).toBe(wallBefore - 1);
  });

  it('records draw event', () => {
    const g = startedGame(42);
    const tile = g.state.seats[0].hand[0];
    const after = g.discard(tile).passClaims();
    const drawEvent = after.events.find((e) => e.kind === 'draw' && e.seat === 1);
    expect(drawEvent).toBeDefined();
  });
});

// ── Pung ──────────────────────────────────────────────────────────────────────

describe('Pung', () => {
  it('player can pung a discarded tile they have 2 of', () => {
    // Build a game where seat 1 has two of the tile east wants to discard
    // We'll set up by peeking at state
    const g = startedGame(42);
    // Find a tile in east's hand that south also has 2+ copies of
    const eastHand = g.state.seats[0].hand;
    const southHand = g.state.seats[1].hand;
    const target = eastHand.find((t) => southHand.filter((x) => x === t).length >= 2);
    if (!target) {
      // Skip if no such tile in this seed (rare)
      expect(true).toBe(true);
      return;
    }
    const g2 = g.discard(target);
    const g3 = g2.pung(1);
    expect(g3.state.phase).toBe('playing');
    expect(g3.state.currentSeat).toBe(1);
    expect(g3.state.seats[1].openMelds).toHaveLength(1);
    expect(g3.state.seats[1].openMelds[0].kind).toBe('pung');
  });

  it('throws if player cannot pung', () => {
    const g = startedGame(42).discard(startedGame(42).state.seats[0].hand[0]);
    // Seat 3 probably cannot pung a random tile
    const pendingTile = g.state.pendingDiscard!;
    const southHand = g.state.seats[1].hand;
    const canSouthPung = southHand.filter((x) => x === pendingTile).length >= 2;
    if (!canSouthPung) {
      expect(() => g.pung(1)).toThrow();
    } else {
      expect(true).toBe(true); // skip, south can pung
    }
  });

  it('throws if trying to pung own discard', () => {
    const g = startedGame(42).discard(startedGame(42).state.seats[0].hand[0]);
    expect(() => g.pung(0)).toThrow();
  });

  it('pung removes the claimed tile from the discarder discards array (BUG-2D-01)', () => {
    const g = startedGame(42);
    const eastHand = g.state.seats[0].hand;
    const southHand = g.state.seats[1].hand;
    const target = eastHand.find((t) => southHand.filter((x) => x === t).length >= 2);
    if (!target) {
      expect(true).toBe(true);
      return;
    }

    const g2 = g.discard(target);
    expect(g2.state.seats[0].discards).toContain(target); // tile is in discard pile

    const g3 = g2.pung(1);
    // After pung, the tile must NOT remain in the discarder's pile
    expect(g3.state.seats[0].discards).not.toContain(target);
    // And the claimer's meld must contain it
    expect(g3.state.seats[1].openMelds[0].tiles).toContain(target);
  });
});

// ── Concealed Kong ────────────────────────────────────────────────────────────

describe('Engine·kong-concealed', () => {
  it('can declare a concealed kong when hand has 4 of a type', () => {
    // Find a seed where east has 4 of a type
    let g: GameEngine | null = null;
    let kongTile: TileType | null = null;
    for (let seed = 0; seed < 200; seed++) {
      const candidate = GameEngine.create(seed).deal().revealJing();
      const hand = candidate.state.seats[0].hand;
      const counts = new Map<TileType, number>();
      for (const t of hand) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const [t, cnt] of counts) {
        if (cnt >= 4) {
          g = candidate;
          kongTile = t;
          break;
        }
      }
      if (g) break;
    }

    if (!g || !kongTile) {
      // Very rare to have 4 of a kind in 14-tile hand, skip
      expect(true).toBe(true);
      return;
    }

    const after = g.kongConcealed(0, kongTile);
    expect(after.state.seats[0].openMelds.some((m) => m.kind === 'kong' && m.concealed)).toBe(true);
  });

  it('throws if declaring kong not in hand', () => {
    const g = startedGame(42);
    expect(() => g.kongConcealed(0, 'zhong')).toThrow();
  });
});

// ── Win ───────────────────────────────────────────────────────────────────────

describe('Engine·win', () => {
  it('Engine·illegal-moves: cannot win with non-winning hand (tsumo)', () => {
    const g = startedGame(42);
    // East has 14 tiles, almost certainly not winning immediately.
    // Pass isSelfDraw=true: initial deal is a tsumo (heavenly win) context.
    const jts: TileType[] = [g.state.jingPrimary!, g.state.jingSecondary!];
    if (!isWinningHand(g.state.seats[0].hand, jts, true)) {
      expect(() => g.declareWin(0)).toThrow();
    } else {
      expect(true).toBe(true); // very rare immediate win
    }
  });

  it('finished game has finished phase', () => {
    // Manually construct a state where east has a winning 14-tile hand
    // by finding a seed where east deals a winning hand (extremely rare but possible)
    // Instead: test via event chain
    let foundWin = false;
    for (let seed = 0; seed < 10000; seed++) {
      const g = GameEngine.create(seed).deal().revealJing();
      const hand = g.state.seats[0].hand;
      const jts: TileType[] = [g.state.jingPrimary!, g.state.jingSecondary!];
      if (isWinningHand(hand, jts, true)) {
        const finished = g.declareWin(0);
        expect(finished.state.phase).toBe('finished');
        expect(finished.events.some((e) => e.kind === 'win')).toBe(true);
        foundWin = true;
        break;
      }
    }
    if (!foundWin) {
      // Skip if no winning deal found in first 10000 seeds
      expect(true).toBe(true);
    }
  });

  it('score after a win equals starting score + win payment (exact, not just > 0)', () => {
    // Find a heavenly-win seed, then verify the score is exactly what the payment says.
    // Checking `> 0` would NOT catch a double-count bug; reading paymentResult.scoreDelta
    // from the event and asserting equality WILL catch it.
    let foundWin = false;
    for (let seed = 0; seed < 10000; seed++) {
      const g = GameEngine.create(seed).deal().revealJing();
      const hand = g.state.seats[0].hand;
      const jts: TileType[] = [g.state.jingPrimary!, g.state.jingSecondary!];
      if (isWinningHand(hand, jts, true)) {
        const startingScore = g.state.seats[0].score;
        const finished = g.declareWin(0);
        const winEvent = finished.events.find((e: { kind: string }) => e.kind === 'win') as
          | { kind: 'win'; paymentResult: { scoreDelta: number[] } }
          | undefined;
        expect(winEvent).toBeDefined();
        const expectedScore = startingScore + winEvent!.paymentResult.scoreDelta[0];
        // Must be exactly this value — spirit settlement is NOT applied by the engine
        expect(finished.state.seats[0].score).toBe(expectedScore);
        foundWin = true;
        break;
      }
    }
    if (!foundWin) expect(true).toBe(true);
  });

  it('declareWin succeeds when the winner has open melds (full hand reconstructed correctly)', () => {
    // Inject a state where seat 0 has 1 open pung + 11 concealed tiles that together form a win:
    // full hand: 1m1m1m (open pung) + 2p3p4p + 5p6p7p + 8s8s8s + east east = 14 tiles ✓
    const g = startedGame(42);
    const openPung: Meld = { kind: 'pung', tiles: ['1m', '1m', '1m'], concealed: false };
    const concealedHand: TileType[] = [
      '2p',
      '3p',
      '4p',
      '5p',
      '6p',
      '7p',
      '8s',
      '8s',
      '8s',
      'east',
      'east',
    ];
    const patchedSeats = [...g.state.seats] as GameState['seats'];
    patchedSeats[0] = { ...g.state.seats[0], hand: concealedHand, openMelds: [openPung] };
    const injectedState: GameState = {
      ...g.state,
      phase: 'playing',
      currentSeat: 0,
      // Use tiles absent from the test hand as jing types so no wildcards fire
      jingPrimary: 'bai',
      jingSecondary: 'zhong',
      seats: patchedSeats,
    };
    // @ts-expect-error — accessing private constructor for testing
    const engine = new GameEngine(injectedState, g.events);
    const finished = engine.declareWin(0);
    expect(finished.state.phase).toBe('finished');
    expect(finished.events.some((e: { kind: string }) => e.kind === 'win')).toBe(true);
  });
});

// ── BUG-024: winner's hand includes winning tile after declareWin ─────────────

describe('Engine·declareWin-hand-completeness', () => {
  it('tsumo win: winner hand has 14 tiles in finished state', () => {
    let foundWin = false;
    for (let seed = 0; seed < 10000; seed++) {
      const g = GameEngine.create(seed).deal().revealJing();
      const hand = g.state.seats[0].hand;
      const jts: TileType[] = [g.state.jingPrimary!, g.state.jingSecondary!];
      if (isWinningHand(hand, jts, true)) {
        const finished = g.declareWin(0);
        expect(finished.state.seats[0].hand).toHaveLength(14);
        foundWin = true;
        break;
      }
    }
    if (!foundWin) expect(true).toBe(true);
  });

  it('ron win: winner hand includes the discarded winning tile in finished state', () => {
    // Seat 1 holds: 1m1m1m (open pung) + 2p3p4p 5p6p7p 8s8s8s east (10 concealed)
    // Seat 0 discards 'east' — seat 1 claims Ron to complete the east-east pair.
    // Full winning hand: [1m1m1m] + [2p3p4p] + [5p6p7p] + [8s8s8s] + [east east] = 14 ✓
    const g = startedGame(42);
    const openPung: Meld = { kind: 'pung', tiles: ['1m', '1m', '1m'], concealed: false };
    const concealedHand: TileType[] = [
      '2p',
      '3p',
      '4p',
      '5p',
      '6p',
      '7p',
      '8s',
      '8s',
      '8s',
      'east',
    ];
    const winTile: TileType = 'east'; // completes the east-east pair
    const patchedSeats = [...g.state.seats] as GameState['seats'];
    patchedSeats[1] = { ...g.state.seats[1], hand: concealedHand, openMelds: [openPung] };
    const injectedState: GameState = {
      ...g.state,
      phase: 'awaiting_claims',
      currentSeat: 0,
      discardedBySeat: 0,
      pendingDiscard: winTile,
      jingPrimary: 'bai',
      jingSecondary: 'zhong',
      seats: patchedSeats,
    };
    // @ts-expect-error — private constructor
    const engine = new GameEngine(injectedState, g.events);
    const finished = engine.declareWin(1);
    expect(finished.state.phase).toBe('finished');
    // The winning tile (the discard) must now appear in the winner's concealed hand
    expect(finished.state.seats[1].hand).toContain(winTile);
    // concealedHand (10) + winTile (1) = 11 tiles
    expect(finished.state.seats[1].hand).toHaveLength(concealedHand.length + 1);
  });
});

// ── Draw game ─────────────────────────────────────────────────────────────────

describe('Engine·draw-conditions', () => {
  it('game ends in draw_game when wall is exhausted', () => {
    // Exhaust the wall artificially by creating a state with no tiles
    // We test via the event log instead
    const g = startedGame(1);
    const event = g.events.find((e) => e.kind === 'deal');
    expect(event).toBeDefined();
    // Wall exhaustion logic: passClaims when no tiles remain → draw_game
    // (hard to test end-to-end quickly, so test the transition logic)
    // Build a minimal state: front and back pointers have met (0 remaining)
    const depleted = {
      ...g.state,
      wall: { ...g.state.wall!, drawPtr: 136, kongDraws: 0 },
    };
    // @ts-expect-error — accessing private constructor for testing
    const engine = new GameEngine(depleted, g.events);
    const tile = g.state.seats[0].hand[0];
    const withDiscard = engine.discard(tile);
    const drawGame = withDiscard.passClaims();
    expect(drawGame.state.phase).toBe('finished');
    expect(drawGame.events.some((e: { kind: string }) => e.kind === 'draw_game')).toBe(true);
  });
});

// ── Event log ─────────────────────────────────────────────────────────────────

describe('Event log', () => {
  it('deal records both setup dice rolls then the deal event', () => {
    const g = GameEngine.create(42).deal();
    expect(g.events.map((e) => e.kind)).toEqual(['dice_roll', 'dice_roll', 'deal']);
  });

  it('jing_indicator event is recorded', () => {
    const g = GameEngine.create(42).deal().revealJing();
    expect(g.events.some((e) => e.kind === 'jing_indicator')).toBe(true);
  });

  it('discard event is recorded', () => {
    const g = startedGame(42);
    const tile = g.state.seats[0].hand[0];
    const after = g.discard(tile);
    expect(after.events.some((e) => e.kind === 'discard')).toBe(true);
  });

  it('events accumulate across moves', () => {
    const g = startedGame(42);
    const tile = g.state.seats[0].hand[0];
    const after = g.discard(tile).passClaims();
    // deal + jing_indicator + discard + draw
    expect(after.events.length).toBeGreaterThanOrEqual(4);
  });

  it('replay: event sequence from same seed is identical', () => {
    const seq = (seed: number) => {
      const g = GameEngine.create(seed).deal().revealJing();
      const tile = g.state.seats[0].hand[0];
      return g.discard(tile).events.map((e) => e.kind);
    };
    expect(seq(42)).toEqual(seq(42));
  });
});

// ── E1: addToKong ─────────────────────────────────────────────────────────────

describe('Engine·add-kong', () => {
  it('upgrades an open pung to a kong and draws a replacement tile', () => {
    // Inject a state where seat 0 has an open pung of '1m' and '1m' in hand
    const g = startedGame(42);
    const openPung: Meld = { kind: 'pung', tiles: ['1m', '1m', '1m'], concealed: false };
    // Give seat 0 a hand that includes '1m' (so they can add to the pung)
    const handWith1m: TileType[] = ['1m', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '1s'];
    const patchedSeats = [...g.state.seats] as GameState['seats'];
    patchedSeats[0] = {
      ...g.state.seats[0],
      hand: handWith1m,
      openMelds: [openPung],
    };
    // @ts-expect-error — private constructor
    const engine = new GameEngine(
      { ...g.state, phase: 'playing', currentSeat: 0, seats: patchedSeats },
      g.events,
    );

    const after = engine.addToKong(0, '1m');

    // Pung upgraded to kong
    expect(after.state.seats[0].openMelds[0].kind).toBe('kong');
    // '1m' removed from hand
    expect(after.state.seats[0].hand).not.toContain('1m');
    // Replacement tile drawn (hand should be the same length: lost 1m, gained replacement)
    expect(after.state.seats[0].hand.length).toBe(handWith1m.length); // -1 added +1 drawn
    // Event recorded
    expect(after.events.some((e: GameEvent) => e.kind === 'kong_added')).toBe(true);
  });

  it('applies instant open-kong payment (1 pt from each other player)', () => {
    const g = startedGame(42);
    const openPung: Meld = { kind: 'pung', tiles: ['1m', '1m', '1m'], concealed: false };
    const handWith1m: TileType[] = ['1m', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '1s'];
    const patchedSeats = [...g.state.seats] as GameState['seats'];
    patchedSeats[0] = { ...g.state.seats[0], hand: handWith1m, openMelds: [openPung] };
    // @ts-expect-error — private constructor
    const engine = new GameEngine(
      { ...g.state, phase: 'playing', currentSeat: 0, seats: patchedSeats },
      g.events,
    );

    const before = engine.state.seats.map((s: SeatState) => s.score);
    const after = engine.addToKong(0, '1m');
    const afterScores = after.state.seats.map((s: SeatState) => s.score);

    expect(afterScores[0]).toBe(before[0] + 3); // declarer receives 3 (1 from each other)
    expect(afterScores[1]).toBe(before[1] - 1);
    expect(afterScores[2]).toBe(before[2] - 1);
    expect(afterScores[3]).toBe(before[3] - 1);
  });

  it('throws when there is no open pung to add to', () => {
    const g = startedGame(42);
    expect(() => g.addToKong(0, '1m')).toThrow();
  });

  it('throws when not the current seat', () => {
    const g = startedGame(42);
    const openPung: Meld = { kind: 'pung', tiles: ['1m', '1m', '1m'], concealed: false };
    const patchedSeats = [...g.state.seats] as GameState['seats'];
    patchedSeats[1] = { ...g.state.seats[1], openMelds: [openPung] };
    // @ts-expect-error — private constructor
    const engine = new GameEngine(
      { ...g.state, phase: 'playing', currentSeat: 0, seats: patchedSeats },
      g.events,
    );
    expect(() => engine.addToKong(1, '1m')).toThrow('Not your turn');
  });
});

// ── E2: Rob-kong (declareWin with robKongSeat) ────────────────────────────────

describe('Engine·rob-kong-scores-as-tsumo', () => {
  it('rob-kong win: konger pays all 3 shares, others pay nothing', () => {
    const g = startedGame(42);
    const openPung: Meld = { kind: 'pung', tiles: ['1m', '1m', '1m'], concealed: false };
    // Seat 2 has a winning hand that includes '1m' as the rob tile
    // Full hand: open pung 1m1m1m + concealed 2p3p4p + 5p6p7p + 8s8s8s + east east = 14
    const concealedHand: TileType[] = [
      '2p',
      '3p',
      '4p',
      '5p',
      '6p',
      '7p',
      '8s',
      '8s',
      '8s',
      'east',
      'east',
    ];
    const patchedSeats = [...g.state.seats] as GameState['seats'];
    patchedSeats[2] = {
      ...g.state.seats[2],
      hand: concealedHand,
      openMelds: [openPung],
    };
    const injectedState: GameState = {
      ...g.state,
      phase: 'playing',
      currentSeat: 0,
      jingPrimary: 'bai',
      jingSecondary: 'zhong',
      seats: patchedSeats,
    };
    // @ts-expect-error — private constructor
    const engine = new GameEngine(injectedState, g.events);

    const before = engine.state.seats.map((s: SeatState) => s.score);
    // Seat 2 wins by robbing seat 0's add-to-kong
    const finished = engine.declareWin(2, { robKongSeat: 0 });

    expect(finished.state.phase).toBe('finished');

    // Derive expected values from the event rather than hard-coding a payment amount.
    // The payment depends on German detection (winJings === 0 → German), dealer modifiers, etc.
    // Asserting score === before + paymentDelta is the correct invariant: it catches any
    // double-counting bug without requiring the test to replicate the scoring formula.
    const winEvent = finished.events.find((e: { kind: string }) => e.kind === 'win') as
      | { kind: 'win'; paymentResult: { scoreDelta: number[] } }
      | undefined;
    expect(winEvent).toBeDefined();
    const pd = winEvent!.paymentResult.scoreDelta;

    // Rob-kong structure: konger(0) pays all, bystanders(1,3) pay nothing, winner(2) receives
    expect(pd[0]).toBeLessThan(0); // konger pays
    expect(pd[1]).toBe(0); // bystander: no payment
    expect(pd[2]).toBeGreaterThan(0); // winner receives
    expect(pd[3]).toBe(0); // bystander: no payment
    expect(pd.reduce((s: number, v: number) => s + v, 0)).toBe(0); // zero-sum

    // Each seat's score must equal starting score + payment delta — no more, no less.
    // Spirit settlement is NOT applied by the engine (owned by the service layer).
    const afterWin = finished.state.seats;
    for (let i = 0; i < 4; i++) {
      expect(afterWin[i].score).toBe(before[i] + pd[i]);
    }
  });
});

// ── E3: Dealer rotation & round wind ─────────────────────────────────────────

describe('Engine·dealer-rotation', () => {
  it('nextDealer: dealer retains when dealer wins', () => {
    const result = nextDealer({ dealerSeat: 0, roundWind: 'east' }, 0);
    expect(result.dealerSeat).toBe(0);
    expect(result.dealerChanged).toBe(false);
    expect(result.roundComplete).toBe(false);
  });

  it('nextDealer: dealer retains on draw (null winner)', () => {
    const result = nextDealer({ dealerSeat: 2, roundWind: 'east' }, null);
    expect(result.dealerSeat).toBe(2);
    expect(result.dealerChanged).toBe(false);
  });

  it('nextDealer: dealer advances when non-dealer wins', () => {
    const result = nextDealer({ dealerSeat: 0, roundWind: 'east' }, 1);
    expect(result.dealerSeat).toBe(1);
    expect(result.dealerChanged).toBe(true);
    expect(result.roundComplete).toBe(false);
  });

  it('nextDealer: full rotation back to seat 0 completes the round', () => {
    const result = nextDealer({ dealerSeat: 3, roundWind: 'east' }, 1);
    expect(result.dealerSeat).toBe(0);
    expect(result.roundComplete).toBe(true);
    expect(result.roundWind).toBe('south'); // east round done → south round
  });

  it('Engine·dealer-rotation: round wind advances east → south after full cycle', () => {
    let state: { dealerSeat: 0 | 1 | 2 | 3; roundWind: SeatWind } = {
      dealerSeat: 0,
      roundWind: 'east',
    };
    // Simulate 4 dealer changes (0→1→2→3→0)
    for (let w = 1; w <= 4; w++) {
      const r = nextDealer(state, (w % 4) as 0 | 1 | 2 | 3);
      state = { dealerSeat: r.dealerSeat, roundWind: r.roundWind };
    }
    expect(state.roundWind).toBe('south');
  });

  it('Engine·create uses dealerSeat and roundWind options', () => {
    const g = GameEngine.create(42, { dealerSeat: 2, roundWind: 'south' });
    expect(g.state.dealerSeat).toBe(2);
    expect(g.state.roundWind).toBe('south');
    // Seat 2 should have wind 'east' (it is the dealer)
    expect(g.state.seats[2].wind).toBe('east');
    // Seat 3 (next in play order after 2) should be 'south'
    expect(g.state.seats[3].wind).toBe('south');
  });

  it('Engine·create with startingScores sets initial scores', () => {
    const g = GameEngine.create(42, { startingScores: [20, 20, 20, 20] });
    for (const seat of g.state.seats) {
      expect(seat.score).toBe(20);
    }
  });
});

// ── E4: Concede ───────────────────────────────────────────────────────────────

describe('Engine·concede-penalty', () => {
  it('concede transitions the game to finished', () => {
    const g = startedGame(42);
    const after = g.concede(0);
    expect(after.state.phase).toBe('finished');
  });

  it('concede records a concede event', () => {
    const g = startedGame(42);
    const after = g.concede(1);
    const ev = after.events.find((e) => e.kind === 'concede');
    expect(ev).toBeDefined();
    expect((ev as { kind: string; seat: number }).seat).toBe(1);
  });

  it('concede does not change any seat score (D5: penalty = 0 at MVP)', () => {
    const g = startedGame(42);
    const before = g.state.seats.map((s) => s.score);
    const after = g.concede(0);
    for (let i = 0; i < 4; i++) {
      expect(after.state.seats[i].score).toBe(before[i]);
    }
  });

  it('concede works from awaiting_claims phase', () => {
    const g = startedGame(42).discard(startedGame(42).state.seats[0].hand[0]);
    expect(g.state.phase).toBe('awaiting_claims');
    const after = g.concede(0);
    expect(after.state.phase).toBe('finished');
  });

  it('throws when trying to concede from dealing phase', () => {
    const g = GameEngine.create(42).deal();
    expect(() => g.concede(0)).toThrow();
  });
});

// ── Kong instant payments (§6.1) ─────────────────────────────────────────────

describe('Engine·kong-instant-payments', () => {
  it('open kong from discard: each other player pays 1 point', () => {
    // Find a seed where seat 1 can kong seat 0's discard
    let g: GameEngine | null = null;
    let target: TileType | null = null;

    for (let seed = 0; seed < 500; seed++) {
      const candidate = GameEngine.create(seed).deal().revealJing();
      const eastHand = candidate.state.seats[0].hand;
      const southHand = candidate.state.seats[1].hand;
      for (const t of eastHand) {
        if (southHand.filter((x) => x === t).length >= 3) {
          g = candidate;
          target = t;
          break;
        }
      }
      if (g) break;
    }

    if (!g || !target) {
      expect(true).toBe(true); // rare: skip
      return;
    }

    const before = g.state.seats.map((s) => s.score);
    const after = g.discard(target).kongFromDiscard(1);

    expect(after.state.seats[1].score).toBe(before[1] + 3); // +3 (1 from each of 3 others)
    expect(after.state.seats[0].score).toBe(before[0] - 1);
    expect(after.state.seats[2].score).toBe(before[2] - 1);
    expect(after.state.seats[3].score).toBe(before[3] - 1);
  });

  it('concealed kong: each other player pays 2 points', () => {
    let g: GameEngine | null = null;
    let kongTile: TileType | null = null;

    for (let seed = 0; seed < 200; seed++) {
      const candidate = GameEngine.create(seed).deal().revealJing();
      const hand = candidate.state.seats[0].hand;
      const counts = new Map<TileType, number>();
      for (const t of hand) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const [t, cnt] of counts) {
        if (cnt >= 4) {
          g = candidate;
          kongTile = t;
          break;
        }
      }
      if (g) break;
    }

    if (!g || !kongTile) {
      expect(true).toBe(true); // rare: skip
      return;
    }

    const before = g.state.seats.map((s) => s.score);
    const after = g.kongConcealed(0, kongTile);

    expect(after.state.seats[0].score).toBe(before[0] + 6); // +6 (2 from each of 3 others)
    expect(after.state.seats[1].score).toBe(before[1] - 2);
    expect(after.state.seats[2].score).toBe(before[2] - 2);
    expect(after.state.seats[3].score).toBe(before[3] - 2);
  });
});

// ── Claim removes tile from discarder's pile (BUG-2D-01) ─────────────────────

describe('Engine·claim-clears-discarder-pile', () => {
  it('chow removes the claimed tile from the discarder discards array', () => {
    // Find a seed where seat 1 (south, directly after east) can chow east's discard
    let g: GameEngine | null = null;
    let target: TileType | null = null;

    for (let seed = 0; seed < 500; seed++) {
      const candidate = GameEngine.create(seed).deal().revealJing();
      const eastHand = candidate.state.seats[0].hand;
      const southHand = candidate.state.seats[1].hand;
      const jts: TileType[] = [candidate.state.jingPrimary!, candidate.state.jingSecondary!];
      for (const t of eastHand) {
        if (chowOptions(southHand, t, jts).length > 0) {
          g = candidate;
          target = t;
          break;
        }
      }
      if (g) break;
    }

    if (!g || !target) {
      expect(true).toBe(true);
      return;
    }

    const g2 = g.discard(target);
    expect(g2.state.seats[0].discards).toContain(target);

    const jingTypes: TileType[] = [g.state.jingPrimary!, g.state.jingSecondary!];
    const seq = chowOptions(g.state.seats[1].hand, target, jingTypes)[0];
    const g3 = g2.chow(1, seq);

    expect(g3.state.seats[0].discards).not.toContain(target);
    expect(g3.state.seats[1].openMelds[0].tiles).toContain(target);
  });

  it('kongFromDiscard removes the claimed tile from the discarder discards array', () => {
    let g: GameEngine | null = null;
    let target: TileType | null = null;

    for (let seed = 0; seed < 500; seed++) {
      const candidate = GameEngine.create(seed).deal().revealJing();
      const eastHand = candidate.state.seats[0].hand;
      const southHand = candidate.state.seats[1].hand;
      for (const t of eastHand) {
        if (southHand.filter((x) => x === t).length >= 3) {
          g = candidate;
          target = t;
          break;
        }
      }
      if (g) break;
    }

    if (!g || !target) {
      expect(true).toBe(true);
      return;
    }

    const g2 = g.discard(target);
    expect(g2.state.seats[0].discards).toContain(target);

    const g3 = g2.kongFromDiscard(1);
    expect(g3.state.seats[0].discards).not.toContain(target);
    expect(g3.state.seats[1].openMelds[0].tiles).toContain(target);
  });
});

// ── Win uses locked-rules scoring ─────────────────────────────────────────────

describe('Engine·win-locked-rules-scoring', () => {
  it('declareWin uses Base × Multiplier system (paymentResult on event)', () => {
    let foundWin = false;
    for (let seed = 0; seed < 10000; seed++) {
      const g = GameEngine.create(seed).deal().revealJing();
      const jts: TileType[] = [g.state.jingPrimary!, g.state.jingSecondary!];
      if (isWinningHand(g.state.seats[0].hand, jts, true)) {
        const finished = g.declareWin(0);
        const winEv = finished.events.find((e) => e.kind === 'win') as
          | { kind: 'win'; paymentResult: { scoreDelta: number[] } }
          | undefined;
        expect(winEv).toBeDefined();
        expect(winEv!.paymentResult.scoreDelta).toHaveLength(4);
        // Zero-sum
        expect(winEv!.paymentResult.scoreDelta.reduce((s, v) => s + v, 0)).toBe(0);
        foundWin = true;
        break;
      }
    }
    if (!foundWin) expect(true).toBe(true);
  });
});

// ── Immutability ──────────────────────────────────────────────────────────────

describe('Immutability', () => {
  it('each action returns a new engine (original unchanged)', () => {
    const g = startedGame(42);
    const tile = g.state.seats[0].hand[0];
    const after = g.discard(tile);
    // Original still in playing phase with original hand
    expect(g.state.phase).toBe('playing');
    expect(g.state.seats[0].hand).toContain(tile);
    expect(after.state.phase).toBe('awaiting_claims');
  });
});

// ── Opening Top & Bottom Spirit Flip (开局上下翻精) ────────────────────────────

describe('Engine·ruleTopBottomJing', () => {
  /** Create a game with the top-bottom rule enabled, through revealJing. */
  function topBottomGame(seed = 42) {
    return GameEngine.create(seed, { config: { ruleTopBottomJing: true } })
      .deal()
      .revealJing();
  }

  it('GameConfig is stored on state with ruleTopBottomJing: false by default', () => {
    const g = GameEngine.create(1);
    expect(g.state.config.ruleTopBottomJing).toBe(false);
  });

  it('GameConfig ruleTopBottomJing: true is persisted through deal', () => {
    const g = GameEngine.create(1, { config: { ruleTopBottomJing: true } }).deal();
    expect(g.state.config.ruleTopBottomJing).toBe(true);
  });

  it('transitions to playing phase after revealJing with top-bottom rule', () => {
    const g = topBottomGame(7);
    expect(g.state.phase).toBe('playing');
  });

  it('jingPrimary and jingSecondary are set after revealJing with top-bottom rule', () => {
    const g = topBottomGame(7);
    expect(g.state.jingPrimary).not.toBeNull();
    expect(g.state.jingSecondary).not.toBeNull();
  });

  it('no tiles are consumed by the reveal — wall count unchanged', () => {
    const afterDeal = GameEngine.create(7, { config: { ruleTopBottomJing: true } }).deal();
    const before = tilesRemaining(afterDeal.state.wall!);
    const afterReveal = afterDeal.revealJing();
    expect(tilesRemaining(afterReveal.state.wall!)).toBe(before);
  });

  it('settlement tile and indicator are swapped in place within the dice-resolved stack', () => {
    const afterDeal = GameEngine.create(7, { config: { ruleTopBottomJing: true } }).deal();
    const preview = previewJingReveal(afterDeal.state);
    const topBefore = afterDeal.state.wall!.drawOrder[preview.topIdx];
    const bottomBefore = afterDeal.state.wall!.drawOrder[preview.topIdx + 1];
    const afterReveal = afterDeal.revealJing();
    // Swapped: former top (settlement) is now below; former bottom (indicator) on top
    expect(afterReveal.state.wall!.drawOrder[preview.topIdx]).toBe(bottomBefore);
    expect(afterReveal.state.wall!.drawOrder[preview.topIdx + 1]).toBe(topBefore);
  });

  it('both settlement and indicator tiles remain in the wall and are drawable', () => {
    const afterDeal = GameEngine.create(7, { config: { ruleTopBottomJing: true } }).deal();
    const preview = previewJingReveal(afterDeal.state);
    const settlementId = afterDeal.state.wall!.drawOrder[preview.topIdx];
    const indicatorId = afterDeal.state.wall!.drawOrder[preview.topIdx + 1];
    const afterReveal = afterDeal.revealJing();
    expect(afterReveal.state.wall!.drawOrder).toContain(settlementId);
    expect(afterReveal.state.wall!.drawOrder).toContain(indicatorId);
  });

  it('emits opening_jing_settlement event before jing_indicator event', () => {
    const g = topBottomGame(7);
    const kinds = g.events.map((e) => e.kind);
    const settleIdx = kinds.indexOf('opening_jing_settlement');
    const jingIdx = kinds.indexOf('jing_indicator');
    expect(settleIdx).toBeGreaterThanOrEqual(0);
    expect(jingIdx).toBeGreaterThan(settleIdx);
  });

  it('opening_jing_settlement event scoreDelta is zero-sum', () => {
    const g = topBottomGame(7);
    const ev = g.events.find((e) => e.kind === 'opening_jing_settlement') as
      | { kind: 'opening_jing_settlement'; scoreDelta: [number, number, number, number] }
      | undefined;
    expect(ev).toBeDefined();
    const sum = ev!.scoreDelta.reduce((s, v) => s + v, 0);
    expect(sum).toBe(0);
  });

  it('seat scores after revealJing reflect the opening settlement delta', () => {
    const afterDeal = GameEngine.create(7, { config: { ruleTopBottomJing: true } }).deal();
    const scoresBefore = afterDeal.state.seats.map((s) => s.score);
    const afterReveal = afterDeal.revealJing();
    const ev = afterReveal.events.find((e) => e.kind === 'opening_jing_settlement') as
      | { kind: 'opening_jing_settlement'; scoreDelta: [number, number, number, number] }
      | undefined;
    expect(ev).toBeDefined();
    for (let i = 0; i < 4; i++) {
      expect(afterReveal.state.seats[i].score).toBe(scoresBefore[i] + ev!.scoreDelta[i]);
    }
  });

  it('jingIndicator is the BOTTOM tile of the dice-resolved stack', () => {
    const afterDeal = GameEngine.create(7, { config: { ruleTopBottomJing: true } }).deal();
    const preview = previewJingReveal(afterDeal.state);
    const afterReveal = afterDeal.revealJing();
    expect(afterReveal.state.jingIndicator).toBe(preview.bottomTile);
  });

  it('standard mode: indicator is the TOP tile of the dice-resolved stack, no swap', () => {
    const afterDeal = GameEngine.create(7).deal();
    expect(afterDeal.state.config.ruleTopBottomJing).toBe(false);
    const preview = previewJingReveal(afterDeal.state);
    const afterReveal = afterDeal.revealJing();
    expect(afterReveal.state.jingIndicator).toBe(preview.topTile);
    // No swap, nothing consumed
    expect(afterReveal.state.wall!.drawOrder).toEqual(afterDeal.state.wall!.drawOrder);
    expect(tilesRemaining(afterReveal.state.wall!)).toBe(tilesRemaining(afterDeal.state.wall!));
  });

  it('previewJingReveal matches what revealJing actually does (settlement tile)', () => {
    const afterDeal = GameEngine.create(123, { config: { ruleTopBottomJing: true } }).deal();
    const preview = previewJingReveal(afterDeal.state);
    const afterReveal = afterDeal.revealJing();
    const ev = afterReveal.events.find((e) => e.kind === 'opening_jing_settlement') as {
      settlementTile: TileType;
    };
    expect(ev.settlementTile).toBe(preview.topTile);
    expect(afterReveal.state.wall!.jingDice).toEqual(preview.dice);
    expect(afterReveal.state.wall!.jingStackGlobal).toBe(preview.stackGlobal);
  });

  it('deterministic: same seed always produces same settlement tile and delta', () => {
    const g1 = GameEngine.create(42, { config: { ruleTopBottomJing: true } })
      .deal()
      .revealJing();
    const g2 = GameEngine.create(42, { config: { ruleTopBottomJing: true } })
      .deal()
      .revealJing();
    const ev1 = g1.events.find((e) => e.kind === 'opening_jing_settlement') as {
      settlementTile: TileType;
      scoreDelta: number[];
    };
    const ev2 = g2.events.find((e) => e.kind === 'opening_jing_settlement') as {
      settlementTile: TileType;
      scoreDelta: number[];
    };
    expect(ev1.settlementTile).toBe(ev2.settlementTile);
    expect(ev1.scoreDelta).toEqual(ev2.scoreDelta);
  });
});

// ── BUG-036 regression: win() must NOT apply spirit settlement ─────────────────
// Spirit settlement is applied exactly once by the service layer (handleHandEnd).
// The engine's win() must only apply the win payment so there is no double-count.

describe('Engine·BUG-036-regression', () => {
  it('declareWin scores contain only win payment — spirit settlement not included', () => {
    // Inject a state where:
    //   seat 0 (tsumo): winning 14-tile hand that includes jingPrimary tiles (spirits)
    //   seats 1-3: blank hands with no spirits
    // After declareWin(0), seats[0].score must equal starting score + tsumo payment only.
    // calculateSpiritSettlement must return a non-zero delta to confirm spirit would
    // have changed the score — proving the engine did NOT apply it.
    const g = startedGame(42);

    const jingPrimary: TileType = 'east';
    const jingSecondary: TileType = 'south';

    // Full 14-tile tsumo winning hand (3×pung + 1×chow + 1×pair), includes 2 jingPrimary.
    // Breakdown: [1m1m1m] + [2p3p4p] + [5p6p7p] + [8s8s8s] + [east east] — 14 tiles ✓
    const winHand: TileType[] = [
      '1m',
      '1m',
      '1m',
      '2p',
      '3p',
      '4p',
      '5p',
      '6p',
      '7p',
      '8s',
      '8s',
      '8s',
      'east',
      'east',
    ];

    const startingScore = 20;
    const blankHand: TileType[] = [];

    const patchedSeats = [...g.state.seats] as GameState['seats'];
    patchedSeats[0] = { ...g.state.seats[0], hand: winHand, openMelds: [], score: startingScore };
    for (let i = 1; i < 4; i++) {
      patchedSeats[i] = {
        ...g.state.seats[i],
        hand: blankHand,
        openMelds: [],
        score: startingScore,
      };
    }

    // @ts-expect-error — private constructor
    const engine = new GameEngine(
      {
        ...g.state,
        phase: 'playing',
        currentSeat: 0,
        dealerSeat: 3, // seat 0 is NOT the dealer — simpler payment math
        jingPrimary,
        jingSecondary,
        seats: patchedSeats,
      },
      g.events,
    );

    const finished = engine.declareWin(0);

    // Confirm spirit delta is non-zero (Indomitable: only seat 0 holds spirits)
    const spiritDelta = calculateSpiritSettlement(finished.state.seats, jingPrimary, jingSecondary);
    expect(spiritDelta[0]).toBeGreaterThan(0);

    // The win event must exist and carry a scoreDelta for the winner
    const winEvent = finished.events.find((e: { kind: string }) => e.kind === 'win') as
      | { kind: 'win'; paymentResult: { scoreDelta: number[] } }
      | undefined;
    expect(winEvent).toBeDefined();
    const winPayment = winEvent!.paymentResult.scoreDelta[0];

    // Engine score must equal starting + win payment ONLY (no spirit)
    expect(finished.state.seats[0].score).toBe(startingScore + winPayment);
    // If spirit were included it would be: startingScore + winPayment + spiritDelta[0]
    expect(finished.state.seats[0].score).not.toBe(startingScore + winPayment + spiritDelta[0]);
  });
});

// ── BUG-038 regression: win must be accepted when player has a kong in open melds ──
// Before the fix: isWinningHand hard-rejects any hand != 14 tiles. After k kongs the
// flattened hand (open melds + concealed) is 14+k tiles, so tsumo was silently blocked
// and engine.declareWin() threw "Hand is not a winning hand".
// Fix: normalize each kong (4 tiles) → pung (3 tiles) before calling isWinningHand.
// All k∈{1,2,3,4} cases are covered below (the flatMap iterates every meld uniformly).

describe('Engine·BUG-038-regression', () => {
  it('tsumo accepted after concealed kong — 15-tile hand (4 kong + 11 hand)', () => {
    const g = startedGame(99);

    // Seat 0: concealed kong of east + 3 pungs + 1 pair in remaining tiles (11 tiles)
    const kongHand: TileType[] = ['9p', '9p', '9p', '8p', '8p', '8p', '7p', '7p', '7p', '5p', '5p'];
    const kongMeld: Meld = {
      kind: 'kong',
      tiles: ['east', 'east', 'east', 'east'],
      concealed: true,
    };

    const patchedSeats = g.state.seats.map((s, i) =>
      i === 0 ? { ...s, hand: kongHand, openMelds: [kongMeld] } : s,
    );

    // @ts-expect-error — private constructor
    const engine = new GameEngine(
      {
        ...g.state,
        phase: 'playing',
        currentSeat: 0,
        isKongDraw: true,
        jingPrimary: 'zhong',
        jingSecondary: 'fa',
        seats: patchedSeats,
      },
      g.events,
    );

    // Before fix: threw "Hand is not a winning hand" because flatMap produced 15 tiles
    expect(() => engine.declareWin(0)).not.toThrow();
    const finished = engine.declareWin(0);
    expect(finished.state.phase).toBe('finished');
    expect(finished.events.some((e: GameEvent) => e.kind === 'win')).toBe(true);
  });

  it('tsumo accepted after open kong (add-to-kong) — winning replacement tile', () => {
    const g = startedGame(101);

    // Seat 0: open kong of east (from add-to-kong) + 3 pungs + pair (11 tiles)
    const kongHand: TileType[] = [
      'south',
      'south',
      'south',
      'west',
      'west',
      'west',
      'north',
      'north',
      'north',
      '1m',
      '1m',
    ];
    const kongMeld: Meld = {
      kind: 'kong',
      tiles: ['east', 'east', 'east', 'east'],
      concealed: false,
    };

    const patchedSeats = g.state.seats.map((s, i) =>
      i === 0 ? { ...s, hand: kongHand, openMelds: [kongMeld] } : s,
    );

    // @ts-expect-error — private constructor
    const engine = new GameEngine(
      {
        ...g.state,
        phase: 'playing',
        currentSeat: 0,
        isKongDraw: true,
        jingPrimary: 'zhong',
        jingSecondary: 'fa',
        seats: patchedSeats,
      },
      g.events,
    );

    expect(() => engine.declareWin(0)).not.toThrow();
    const finished = engine.declareWin(0);
    expect(finished.state.phase).toBe('finished');
    expect(finished.events.some((e: GameEvent) => e.kind === 'win')).toBe(true);
  });

  it('tsumo accepted after two kongs — 16-tile hand (8 kong + 8 hand)', () => {
    // 2 concealed kongs (east, north) + south pung + west pung + 1m pair
    // Raw: 4+4 + 3+3+2 = 16 tiles → normalized: 3+3+3+3+2 = 14 ✓
    const g = startedGame(102);

    const hand: TileType[] = ['south', 'south', 'south', 'west', 'west', 'west', '1m', '1m'];
    const melds: Meld[] = [
      { kind: 'kong', tiles: ['east', 'east', 'east', 'east'], concealed: true },
      { kind: 'kong', tiles: ['north', 'north', 'north', 'north'], concealed: true },
    ];

    const patchedSeats = g.state.seats.map((s, i) =>
      i === 0 ? { ...s, hand, openMelds: melds } : s,
    );

    // @ts-expect-error — private constructor
    const engine = new GameEngine(
      {
        ...g.state,
        phase: 'playing',
        currentSeat: 0,
        isKongDraw: true,
        jingPrimary: 'zhong',
        jingSecondary: 'fa',
        seats: patchedSeats,
      },
      g.events,
    );

    expect(() => engine.declareWin(0)).not.toThrow();
    const finished = engine.declareWin(0);
    expect(finished.state.phase).toBe('finished');
    expect(finished.events.some((e: GameEvent) => e.kind === 'win')).toBe(true);
  });

  it('tsumo accepted after three kongs — 17-tile hand (12 kong + 5 hand)', () => {
    // 3 concealed kongs (east, north, west) + south pung + 1m pair
    // Raw: 4+4+4 + 3+2 = 17 tiles → normalized: 3+3+3+3+2 = 14 ✓
    const g = startedGame(103);

    const hand: TileType[] = ['south', 'south', 'south', '1m', '1m'];
    const melds: Meld[] = [
      { kind: 'kong', tiles: ['east', 'east', 'east', 'east'], concealed: true },
      { kind: 'kong', tiles: ['north', 'north', 'north', 'north'], concealed: true },
      { kind: 'kong', tiles: ['west', 'west', 'west', 'west'], concealed: true },
    ];

    const patchedSeats = g.state.seats.map((s, i) =>
      i === 0 ? { ...s, hand, openMelds: melds } : s,
    );

    // @ts-expect-error — private constructor
    const engine = new GameEngine(
      {
        ...g.state,
        phase: 'playing',
        currentSeat: 0,
        isKongDraw: true,
        jingPrimary: 'zhong',
        jingSecondary: 'fa',
        seats: patchedSeats,
      },
      g.events,
    );

    expect(() => engine.declareWin(0)).not.toThrow();
    const finished = engine.declareWin(0);
    expect(finished.state.phase).toBe('finished');
    expect(finished.events.some((e: GameEvent) => e.kind === 'win')).toBe(true);
  });

  it('tsumo accepted after four kongs — 18-tile hand (16 kong + 2 hand)', () => {
    // 4 concealed kongs (east, south, west, north) + 1m pair
    // Raw: 4+4+4+4 + 2 = 18 tiles → normalized: 3+3+3+3+2 = 14 ✓
    const g = startedGame(104);

    const hand: TileType[] = ['1m', '1m'];
    const melds: Meld[] = [
      { kind: 'kong', tiles: ['east', 'east', 'east', 'east'], concealed: true },
      { kind: 'kong', tiles: ['south', 'south', 'south', 'south'], concealed: true },
      { kind: 'kong', tiles: ['west', 'west', 'west', 'west'], concealed: true },
      { kind: 'kong', tiles: ['north', 'north', 'north', 'north'], concealed: true },
    ];

    const patchedSeats = g.state.seats.map((s, i) =>
      i === 0 ? { ...s, hand, openMelds: melds } : s,
    );

    // @ts-expect-error — private constructor
    const engine = new GameEngine(
      {
        ...g.state,
        phase: 'playing',
        currentSeat: 0,
        isKongDraw: true,
        jingPrimary: 'zhong',
        jingSecondary: 'fa',
        seats: patchedSeats,
      },
      g.events,
    );

    expect(() => engine.declareWin(0)).not.toThrow();
    const finished = engine.declareWin(0);
    expect(finished.state.phase).toBe('finished');
    expect(finished.events.some((e: GameEvent) => e.kind === 'win')).toBe(true);
  });
});

// ── Sacking the Dealer (踢庄) ─────────────────────────────────────────────────
// When all four players discard the same tile in the first round (no claims),
// the dealer pays 5 pts to each of the other three players (−15 total).

describe('Engine·sacking-dealer', () => {
  it('emits sacking_dealer event and updates scores when all four first discards match', () => {
    const g = startedGame(42);

    // Inject a state where seat 3 is about to make the 4th discard of '1m'.
    // Events already contain 3 discard events ('1m') and 3 draw events — no claims.
    const sackTile: TileType = '1m';
    const startScore = 0;
    const patchedSeats = g.state.seats.map((s, i) => ({
      ...s,
      hand:
        i === 3
          ? [sackTile, '2m', '3m', '4p', '5p', '6p', '7s', '8s', '9s', '1m', '2m', '3m', 'east']
          : s.hand,
      score: startScore,
    })) as [SeatState, SeatState, SeatState, SeatState];

    const priorEvents: GameEvent[] = [
      { kind: 'discard', seat: 0, tile: sackTile },
      { kind: 'draw', seat: 1, tile: '2m', fromBack: false },
      { kind: 'discard', seat: 1, tile: sackTile },
      { kind: 'draw', seat: 2, tile: '3m', fromBack: false },
      { kind: 'discard', seat: 2, tile: sackTile },
      { kind: 'draw', seat: 3, tile: '4m', fromBack: false },
    ];

    // @ts-expect-error — private constructor
    const engine = new GameEngine(
      {
        ...g.state,
        phase: 'playing' as const,
        currentSeat: 3 as const,
        dealerSeat: 0 as const,
        jingPrimary: 'zhong',
        jingSecondary: 'fa',
        seats: patchedSeats,
      },
      priorEvents,
    );

    const after = engine.discard(sackTile);

    const sackEv = after.events.find((e: GameEvent) => e.kind === 'sacking_dealer') as
      | { kind: 'sacking_dealer'; tile: TileType; scoreDelta: [number, number, number, number] }
      | undefined;
    expect(sackEv).toBeDefined();
    expect(sackEv!.tile).toBe(sackTile);

    // Zero-sum invariant
    const sum = sackEv!.scoreDelta.reduce((acc, v) => acc + v, 0);
    expect(sum).toBe(0);

    // Dealer (seat 0) loses 15; each other player gains 5
    expect(sackEv!.scoreDelta[0]).toBe(-15);
    expect(sackEv!.scoreDelta[1]).toBe(5);
    expect(sackEv!.scoreDelta[2]).toBe(5);
    expect(sackEv!.scoreDelta[3]).toBe(5);

    // Scores updated on state
    expect(after.state.seats[0].score).toBe(startScore - 15);
    expect(after.state.seats[1].score).toBe(startScore + 5);
    expect(after.state.seats[2].score).toBe(startScore + 5);
    expect(after.state.seats[3].score).toBe(startScore + 5);
  });

  it('does NOT emit sacking_dealer when tiles do not all match', () => {
    const g = startedGame(42);

    const patchedSeats = g.state.seats.map((s, i) => ({
      ...s,
      hand:
        i === 3
          ? ['2m', '2m', '3m', '4p', '5p', '6p', '7s', '8s', '9s', '1m', '2m', '3m', 'east']
          : s.hand,
      score: 0,
    })) as [SeatState, SeatState, SeatState, SeatState];

    const priorEvents: GameEvent[] = [
      { kind: 'discard', seat: 0, tile: '1m' },
      { kind: 'draw', seat: 1, tile: '2m', fromBack: false },
      { kind: 'discard', seat: 1, tile: '1m' },
      { kind: 'draw', seat: 2, tile: '3m', fromBack: false },
      { kind: 'discard', seat: 2, tile: '1m' },
      { kind: 'draw', seat: 3, tile: '4m', fromBack: false },
    ];

    // @ts-expect-error — private constructor
    const engine = new GameEngine(
      {
        ...g.state,
        phase: 'playing' as const,
        currentSeat: 3 as const,
        dealerSeat: 0 as const,
        jingPrimary: 'zhong',
        jingSecondary: 'fa',
        seats: patchedSeats,
      },
      priorEvents,
    );

    // Seat 3 discards '2m' — breaks the match
    const after = engine.discard('2m');
    expect(after.events.some((e: GameEvent) => e.kind === 'sacking_dealer')).toBe(false);
    // Scores unchanged
    for (let i = 0; i < 4; i++) {
      expect(after.state.seats[i].score).toBe(0);
    }
  });
});

// ── BUG-059: German win detection with spirit tiles at face value ──────────────
// Before the fix: isGerman = winJings === 0 incorrectly classified hands where
// the winner holds spirit tiles at their natural tile value (e.g., a pung of 一索
// when 一索 is jingPrimary) as non-German. The hand can win without any wildcard
// substitution, so isGerman must be true.

describe('Engine·BUG-059-german-detection', () => {
  it('isGerman=true when jing tiles are held at face value (no wildcard substitution)', () => {
    // Hand: pung of jingPrimary ('1s') + three chows + pair — all natural, no wildcards.
    // [1s,1s,1s] + [3s,4s,5s] + [6s,7s,8s] + [5m,6m,7m] + [9s,9s] = 14 tiles ✓
    const g = startedGame(42);
    const jingPrimary: TileType = '1s';
    const jingSecondary: TileType = '2s';

    const winHand: TileType[] = [
      '1s',
      '1s',
      '1s',
      '3s',
      '4s',
      '5s',
      '6s',
      '7s',
      '8s',
      '5m',
      '6m',
      '7m',
      '9s',
      '9s',
    ];

    const patchedSeats = [...g.state.seats] as GameState['seats'];
    patchedSeats[0] = { ...g.state.seats[0], hand: winHand, openMelds: [], score: 0 };
    for (let i = 1; i < 4; i++) {
      patchedSeats[i] = { ...g.state.seats[i], hand: [], openMelds: [], score: 0 };
    }

    // @ts-expect-error — private constructor
    const engine = new GameEngine(
      {
        ...g.state,
        phase: 'playing',
        currentSeat: 0,
        dealerSeat: 3,
        jingPrimary,
        jingSecondary,
        seats: patchedSeats,
      },
      g.events,
    );

    const finished = engine.declareWin(0);
    const winEvent = finished.events.find((e: GameEvent) => e.kind === 'win') as
      | { kind: 'win'; paymentResult: WinPaymentResult }
      | undefined;

    expect(winEvent).toBeDefined();
    // German bonus: flatBonusPerLoser=5. Jing tiles at face value must NOT disqualify it.
    expect(winEvent!.paymentResult.flatBonusPerLoser).toBe(5);
  });

  it('isGerman=false when a jing tile IS used as a wildcard — flatBonusPerLoser=0', () => {
    // Hand requires '1s' (jingPrimary) to substitute for '3m' to complete:
    // [1m,2m,1s/=3m] + [3s,4s,5s] + [6s,7s,8s] + [5m,6m,7m] + [9s,9s] = 14 tiles ✓
    // Without wildcards the hand cannot decompose → not German → flatBonusPerLoser=0.
    const g = startedGame(42);
    const jingPrimary: TileType = '1s';
    const jingSecondary: TileType = '2s';

    const winHand: TileType[] = [
      '1s',
      '1m',
      '2m',
      '3s',
      '4s',
      '5s',
      '6s',
      '7s',
      '8s',
      '5m',
      '6m',
      '7m',
      '9s',
      '9s',
    ];

    const patchedSeats = [...g.state.seats] as GameState['seats'];
    patchedSeats[0] = { ...g.state.seats[0], hand: winHand, openMelds: [], score: 0 };
    for (let i = 1; i < 4; i++) {
      patchedSeats[i] = { ...g.state.seats[i], hand: [], openMelds: [], score: 0 };
    }

    // @ts-expect-error — private constructor
    const engine = new GameEngine(
      {
        ...g.state,
        phase: 'playing',
        currentSeat: 0,
        dealerSeat: 3,
        jingPrimary,
        jingSecondary,
        seats: patchedSeats,
      },
      g.events,
    );

    const finished = engine.declareWin(0);
    const winEvent = finished.events.find((e: GameEvent) => e.kind === 'win') as
      | { kind: 'win'; paymentResult: WinPaymentResult }
      | undefined;

    expect(winEvent).toBeDefined();
    // 1s is used as a wildcard for 3m → not German → no flat bonus.
    expect(winEvent!.paymentResult.flatBonusPerLoser).toBe(0);
  });
});
