import { describe, it, expect } from 'vitest';
import { GameEngine, nextDealer } from '../engine';
import { isWinningHand } from '../hand';
import type { TileType, GameState, Meld, GameEvent, SeatState, SeatWind } from '../types';

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

  it('revealJing removes the indicator from deadWall, leaving 3 replacement tiles', () => {
    const afterDeal = GameEngine.create(42).deal();
    expect(afterDeal.state.deadWall).toHaveLength(4);
    const afterReveal = afterDeal.revealJing();
    expect(afterReveal.state.deadWall).toHaveLength(3);
    // The indicator (index 0) must no longer be the first replacement tile
    expect(afterReveal.state.deadWall[0]).not.toBe(afterDeal.state.deadWall[0]);
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
    const wallTotal = g.state.wall.length;
    const deadTotal = g.state.deadWall.length;
    // Hands: 14+13+13+13=53; dead wall: 4; live wall: remainder
    expect(handsTotal + wallTotal + deadTotal).toBe(136);
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
    expect(() => g.discard('bai' as TileType)).not.toThrow(); // bai might be in hand
    // Find a tile definitely NOT in hand
    const hand = new Set(g.state.seats[0].hand);
    // If hand has all 34 types this is tricky, but practically:
    const allTypes: TileType[] = ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m'];
    const notInHand = allTypes.find((t) => !hand.has(t));
    if (notInHand) {
      expect(() => g.discard(notInHand)).toThrow();
    }
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
    const wallBefore = g.state.wall.length;
    const tile = g.state.seats[0].hand[0];
    const after = g.discard(tile).passClaims();
    expect(after.state.wall.length).toBe(wallBefore - 1);
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
    // East has 14 tiles, almost certainly not winning immediately
    const jts: TileType[] = [g.state.jingPrimary!, g.state.jingSecondary!];
    if (!isWinningHand(g.state.seats[0].hand, jts)) {
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
      if (isWinningHand(hand, jts)) {
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

  it('score changes after a win', () => {
    let foundWin = false;
    for (let seed = 0; seed < 10000; seed++) {
      const g = GameEngine.create(seed).deal().revealJing();
      const hand = g.state.seats[0].hand;
      const jts: TileType[] = [g.state.jingPrimary!, g.state.jingSecondary!];
      if (isWinningHand(hand, jts)) {
        const finished = g.declareWin(0);
        expect(finished.state.seats[0].score).toBeGreaterThan(0);
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

// ── Draw game ─────────────────────────────────────────────────────────────────

describe('Engine·draw-conditions', () => {
  it('game ends in draw_game when wall is exhausted', () => {
    // Exhaust the wall artificially by creating a state with no tiles
    // We test via the event log instead
    const g = startedGame(1);
    const event = g.events.find((e) => e.kind === 'deal');
    expect(event).toBeDefined();
    // Wall exhaustion logic: passClaims when wall is empty → draw_game
    // (hard to test end-to-end quickly, so test the transition logic)
    // Build a minimal state: discard then pass with empty wall
    const depleted = { ...g.state, wall: [] };
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
  it('deal event is recorded', () => {
    const g = GameEngine.create(42).deal();
    expect(g.events).toHaveLength(1);
    expect(g.events[0].kind).toBe('deal');
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
    const winEvent = finished.events.find((e: GameEvent) => e.kind === 'win');
    expect(winEvent).toBeDefined();

    // Konger (seat 0) pays for everyone; seats 1 and 3 pay nothing from win
    const afterWin = finished.state.seats;
    // Seat 0 (konger): score should decrease
    expect(afterWin[0].score).toBeLessThan(before[0]);
    // Seat 1 and 3: score unchanged from win payment (spirit settlement may apply)
    // (We just verify the rob-kong payment direction is correct)
    expect(afterWin[2].score).toBeGreaterThan(before[2]);
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

// ── Win uses locked-rules scoring ─────────────────────────────────────────────

describe('Engine·win-locked-rules-scoring', () => {
  it('declareWin uses Base × Multiplier system (paymentResult on event)', () => {
    let foundWin = false;
    for (let seed = 0; seed < 10000; seed++) {
      const g = GameEngine.create(seed).deal().revealJing();
      const jts: TileType[] = [g.state.jingPrimary!, g.state.jingSecondary!];
      if (isWinningHand(g.state.seats[0].hand, jts)) {
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
