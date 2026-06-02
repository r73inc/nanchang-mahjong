/**
 * GameEngine — the authoritative Nanchang Mahjong state machine.
 *
 * Fully deterministic: given the same seed, the same sequence of moves
 * always produces the same game (used for replay).
 *
 * Design notes:
 *   - All state is immutable from the caller's perspective (methods return new state).
 *   - Throws on illegal moves so callers always get explicit error feedback.
 *   - The engine does NOT handle networking, persistence, or timers —
 *     those are the responsibility of the Gateway layer (Phase 7).
 */
import { buildWall, typeOf, sortTypes } from './tiles';
import { seededShuffle } from './prng';
import { jingTypesFromIndicator, separateJing } from './jing';
import { isWinningHand, decomposeHand } from './hand';
import { canPung, canKongFromDiscard, concealedKongOptions, chowOptions } from './calls';
import { calculateFan, calculateSevenPairsFan, calculatePayment } from './scoring';
import type {
  GameState,
  GameEvent,
  SeatState,
  SeatWind,
  TileType,
  TileId,
  Meld,
  FanResult,
  WinType,
} from './types';

const SEAT_WINDS: SeatWind[] = ['east', 'south', 'west', 'north'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function blankSeat(wind: SeatWind): SeatState {
  return { wind, hand: [], openMelds: [], discards: [], score: 0 };
}

function seatWindIndex(wind: SeatWind): 0 | 1 | 2 | 3 {
  return SEAT_WINDS.indexOf(wind) as 0 | 1 | 2 | 3;
}

function removeFromHand(hand: TileType[], tile: TileType): TileType[] {
  const idx = hand.indexOf(tile);
  if (idx === -1) throw new Error(`Tile ${tile} not in hand`);
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
}

function removeFromHandN(hand: TileType[], tile: TileType, n: number): TileType[] {
  let h = hand;
  for (let i = 0; i < n; i++) h = removeFromHand(h, tile);
  return h;
}

// ── GameEngine ────────────────────────────────────────────────────────────────

export class GameEngine {
  private constructor(
    public readonly state: GameState,
    public readonly events: GameEvent[],
  ) {}

  // ── Factory ─────────────────────────────────────────────────────────────────

  /**
   * Start a new game with the given seed.
   * Returns an engine whose state is in the 'dealing' phase, ready for `deal()`.
   */
  static create(seed: number): GameEngine {
    const state: GameState = {
      phase: 'dealing',
      seed,
      jingIndicator: null,
      jingPrimary: null,
      jingSecondary: null,
      wall: [],
      deadWall: [],
      seats: [blankSeat('east'), blankSeat('south'), blankSeat('west'), blankSeat('north')],
      currentSeat: 0,
      pendingDiscard: null,
      discardedBySeat: null,
      kongsTotal: 0,
      isKongDraw: false,
    };
    return new GameEngine(state, []);
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private get jingTypes(): TileType[] {
    if (!this.state.jingPrimary || !this.state.jingSecondary) {
      throw new Error('Jing not yet determined');
    }
    return [this.state.jingPrimary, this.state.jingSecondary];
  }

  /**
   * Remove `n` jing tiles from `hand`, choosing whichever jing type is available.
   */
  private removeJings(hand: TileType[], n: number): TileType[] {
    const jts = this.jingTypes;
    let h = hand;
    for (let i = 0; i < n; i++) {
      const jt = jts.find((j) => h.includes(j));
      if (!jt) throw new Error('Not enough jings in hand');
      h = removeFromHand(h, jt);
    }
    return h;
  }

  private seatOf(wind: SeatWind): SeatState {
    return this.state.seats[seatWindIndex(wind)];
  }

  private withState(patch: Partial<GameState>, extraEvents: GameEvent[] = []): GameEngine {
    return new GameEngine({ ...this.state, ...patch }, [...this.events, ...extraEvents]);
  }

  private patchSeat(idx: 0 | 1 | 2 | 3, patch: Partial<SeatState>): GameState['seats'] {
    const seats = [...this.state.seats] as GameState['seats'];
    seats[idx] = { ...seats[idx], ...patch };
    return seats;
  }

  // ── Deal ─────────────────────────────────────────────────────────────────────

  /**
   * Shuffle the wall and deal tiles to all players.
   * Transitions to 'jing_reveal'.
   */
  deal(): GameEngine {
    if (this.state.phase !== 'dealing') throw new Error('Not in dealing phase');

    const shuffled = seededShuffle(buildWall(), this.state.seed);

    // Dead wall: 4 tiles from the end (indicator at index 0, rest for Kong replacements)
    const deadWall = shuffled.slice(-4);
    const liveWall = shuffled.slice(0, -4);

    // Deal: East 14, others 13 (deal in rotation of 4 tiles at a time, standard style)
    const dealt: [TileId[], TileId[], TileId[], TileId[]] = [[], [], [], []];
    let wallIdx = 0;
    // 3 rounds of 4 tiles each
    for (let round = 0; round < 3; round++) {
      for (let s = 0; s < 4; s++) {
        for (let t = 0; t < 4; t++) dealt[s].push(liveWall[wallIdx++]);
      }
    }
    // 1 more tile each
    for (let s = 0; s < 4; s++) dealt[s].push(liveWall[wallIdx++]);
    // East gets one extra
    dealt[0].push(liveWall[wallIdx++]);

    const hands = dealt.map((ids) => sortTypes(ids.map(typeOf))) as [
      TileType[],
      TileType[],
      TileType[],
      TileType[],
    ];

    const remainingWall = liveWall.slice(wallIdx);

    const seats = [...this.state.seats] as GameState['seats'];
    for (let i = 0; i < 4; i++) {
      seats[i] = { ...seats[i], hand: hands[i] };
    }

    const event: GameEvent = { kind: 'deal', seed: this.state.seed, hands };

    return this.withState(
      {
        phase: 'jing_reveal',
        wall: remainingWall,
        deadWall,
        seats,
      },
      [event],
    );
  }

  // ── Jing reveal ──────────────────────────────────────────────────────────────

  /**
   * Reveal the Jing indicator and determine both wildcard tile types.
   * Primary Spirit (正精): the indicator tile itself.
   * Secondary Spirit (副精): the tile one rank above the indicator.
   * Transitions to 'playing', with East to act first (they have 14 tiles).
   */
  revealJing(): GameEngine {
    if (this.state.phase !== 'jing_reveal') throw new Error('Not in jing_reveal phase');

    const indicatorId = this.state.deadWall[0];
    const indicator = typeOf(indicatorId);
    const [jingPrimary, jingSecondary] = jingTypesFromIndicator(indicator);

    const event: GameEvent = { kind: 'jing_indicator', indicator, jingPrimary, jingSecondary };

    return this.withState(
      {
        phase: 'playing',
        jingIndicator: indicator,
        jingPrimary,
        jingSecondary,
        // Consume the indicator tile so it never re-enters play as a kong replacement.
        deadWall: this.state.deadWall.slice(1),
        currentSeat: 0, // East goes first (has 14 tiles, needs to discard)
      },
      [event],
    );
  }

  // ── Discard ───────────────────────────────────────────────────────────────────

  /**
   * The current player discards `tile` from their hand.
   * Transitions to 'awaiting_claims'.
   */
  discard(tile: TileType): GameEngine {
    if (this.state.phase !== 'playing') throw new Error('Not in playing phase');

    const seatIdx = this.state.currentSeat;
    const seat = this.state.seats[seatIdx];

    if (!seat.hand.includes(tile)) {
      throw new Error(`Tile ${tile} not in hand`);
    }

    const newHand = removeFromHand(seat.hand, tile);

    const event: GameEvent = { kind: 'discard', seat: seatIdx, tile };

    return this.withState(
      {
        phase: 'awaiting_claims',
        seats: this.patchSeat(seatIdx, {
          hand: newHand,
          discards: [...seat.discards, tile],
        }),
        pendingDiscard: tile,
        discardedBySeat: seatIdx,
      },
      [event],
    );
  }

  // ── Pass (no claim) ───────────────────────────────────────────────────────────

  /**
   * All players pass — no one claims the discard. The next player draws.
   */
  passClaims(): GameEngine {
    if (this.state.phase !== 'awaiting_claims') throw new Error('Not awaiting claims');

    const fromSeat = this.state.discardedBySeat!;
    const nextSeat = ((fromSeat + 1) % 4) as 0 | 1 | 2 | 3;

    // Wall exhausted → draw game
    if (this.state.wall.length === 0) {
      return this.withState({ phase: 'finished' }, [{ kind: 'draw_game' }]);
    }

    return this._drawFor(nextSeat, false);
  }

  // ── Draw (internal) ───────────────────────────────────────────────────────────

  private _drawFor(seatIdx: 0 | 1 | 2 | 3, fromDeadWall: boolean): GameEngine {
    const wall = fromDeadWall ? this.state.deadWall : this.state.wall;
    if (wall.length === 0) {
      return this.withState({ phase: 'finished' }, [{ kind: 'draw_game' }]);
    }

    const [tileId, ...remainingWall] = wall;
    const tile = typeOf(tileId);
    const seat = this.state.seats[seatIdx];

    const event: GameEvent = { kind: 'draw', seat: seatIdx, tile, fromDeadWall };

    const newSeats = this.patchSeat(seatIdx, {
      hand: sortTypes([...seat.hand, tile]),
    });

    const wallPatch = fromDeadWall ? { deadWall: remainingWall } : { wall: remainingWall };

    return this.withState(
      {
        phase: 'playing',
        ...wallPatch,
        seats: newSeats,
        currentSeat: seatIdx,
        pendingDiscard: null,
        discardedBySeat: null,
        isKongDraw: fromDeadWall,
      },
      [event],
    );
  }

  // ── Win ───────────────────────────────────────────────────────────────────────

  /**
   * Declare a win. `seatIdx` is the winner.
   * - Tsumo: winner is the current player, tile is the drawn tile.
   * - Ron: winner is a non-current player, tile is the pending discard.
   */
  declareWin(seatIdx: 0 | 1 | 2 | 3): GameEngine {
    const isRon =
      this.state.phase === 'awaiting_claims' &&
      this.state.pendingDiscard !== null &&
      seatIdx !== this.state.discardedBySeat;

    const isTsumo = this.state.phase === 'playing' && seatIdx === this.state.currentSeat;

    if (!isRon && !isTsumo) throw new Error('Invalid win declaration');

    const winType: WinType = isTsumo ? 'tsumo' : 'ron';
    const winnerSeat = this.state.seats[seatIdx];

    // Reconstruct the full 14-tile hand: open melds + concealed tiles + (ron) discard.
    // isWinningHand requires exactly 14 tiles, so open-meld tiles must be included.
    const openMeldTiles = winnerSeat.openMelds.flatMap((m) => [...m.tiles]);
    const winningHand: TileType[] = [
      ...openMeldTiles,
      ...winnerSeat.hand,
      ...(isRon ? [this.state.pendingDiscard!] : []),
    ];

    if (!isWinningHand(winningHand, this.jingTypes)) {
      throw new Error('Hand is not a winning hand');
    }

    // Find best decomposition for scoring
    const decompositions = decomposeHand(winningHand, this.jingTypes);
    const decomp = decompositions[0]; // first valid standard decomp (undefined for 7-pairs/misfits)

    const { jingCount: winJings } = separateJing(winningHand, this.jingTypes);

    let fanResult: FanResult;
    if (decomp) {
      fanResult = calculateFan({
        winType,
        seatWind: winnerSeat.wind,
        roundWind: 'east', // Phase 6 will track round wind
        isLastTile: this.state.wall.length === 0,
        isAfterKong: this.state.isKongDraw && isTsumo,
        isRobKong: false, // Phase 7 will track this
        decomposition: decomp,
        openMelds: winnerSeat.openMelds,
      });
    } else {
      // Seven Pairs or Thirteen Misfits — use pair-based scoring
      fanResult = calculateSevenPairsFan({
        winType,
        seatWind: winnerSeat.wind,
        roundWind: 'east',
        isLastTile: this.state.wall.length === 0,
        isAfterKong: this.state.isKongDraw && isTsumo,
        isRobKong: false,
        openMelds: winnerSeat.openMelds,
        jingsUsed: winJings,
        hasLongPair: false, // Dragon 7 pairs detection can be added later
      });
    }

    const payment = calculatePayment(fanResult.total, winType);

    // Apply scores
    const seats = [...this.state.seats] as GameState['seats'];
    if (winType === 'tsumo') {
      for (let i = 0; i < 4; i++) {
        if (i === seatIdx) {
          seats[i] = { ...seats[i], score: seats[i].score + payment.totalReceived };
        } else {
          seats[i] = { ...seats[i], score: seats[i].score - payment.unitsPerPayer };
        }
      }
    } else {
      const discarderIdx = this.state.discardedBySeat!;
      seats[seatIdx] = { ...seats[seatIdx], score: seats[seatIdx].score + payment.unitsPerPayer };
      seats[discarderIdx] = {
        ...seats[discarderIdx],
        score: seats[discarderIdx].score - payment.unitsPerPayer,
      };
    }

    const event: GameEvent = { kind: 'win', seat: seatIdx, winType, fanResult };

    return this.withState({ phase: 'finished', seats }, [event]);
  }

  // ── Pung ──────────────────────────────────────────────────────────────────────

  /**
   * Claim the pending discard as a Pung.
   */
  pung(seatIdx: 0 | 1 | 2 | 3): GameEngine {
    if (this.state.phase !== 'awaiting_claims') throw new Error('Not awaiting claims');
    if (seatIdx === this.state.discardedBySeat) throw new Error('Cannot pung own discard');

    const tile = this.state.pendingDiscard!;
    const seat = this.state.seats[seatIdx];

    if (!canPung(seat.hand, tile, this.jingTypes)) {
      throw new Error(`Cannot pung ${tile}`);
    }

    // Remove 2 matching tiles from hand (natural or jing)
    let hand = [...seat.hand];
    const { naturals } = separateJing(hand, this.jingTypes);
    const naturalCount = naturals.filter((t) => t === tile).length;

    if (naturalCount >= 2) {
      hand = removeFromHandN(hand, tile, 2);
    } else if (naturalCount === 1) {
      hand = removeFromHand(hand, tile);
      hand = this.removeJings(hand, 1);
    } else {
      // 0 naturals: use 2 jings
      hand = this.removeJings(hand, 2);
    }

    const meld: Meld = {
      kind: 'pung',
      tiles: [tile, tile, tile],
      concealed: false,
    };

    const event: GameEvent = { kind: 'pung', seat: seatIdx, tile };

    return this.withState(
      {
        phase: 'playing',
        seats: this.patchSeat(seatIdx, {
          hand,
          openMelds: [...seat.openMelds, meld],
        }),
        currentSeat: seatIdx,
        pendingDiscard: null,
        discardedBySeat: null,
      },
      [event],
    );
  }

  // ── Chow ──────────────────────────────────────────────────────────────────────

  /**
   * Claim the pending discard as a Chow. `sequence` is the three-tile chow.
   */
  chow(seatIdx: 0 | 1 | 2 | 3, sequence: [TileType, TileType, TileType]): GameEngine {
    if (this.state.phase !== 'awaiting_claims') throw new Error('Not awaiting claims');

    const fromSeat = this.state.discardedBySeat!;
    const expectedChower = ((fromSeat + 1) % 4) as 0 | 1 | 2 | 3;
    if (seatIdx !== expectedChower) throw new Error('Only the player after the discarder can chow');

    const tile = this.state.pendingDiscard!;
    const seat = this.state.seats[seatIdx];

    const options = chowOptions(seat.hand, tile, this.jingTypes);
    const valid = options.some((opt) => opt.every((t, i) => t === sequence[i]));
    if (!valid) throw new Error(`Cannot chow ${tile} with ${sequence.join(',')}`);

    // Remove the two non-discard tiles from hand
    let hand = [...seat.hand];
    for (const t of sequence) {
      if (t === tile) continue; // this is the discard, not from hand
      // Try to use natural tile, fall back to jing
      if (hand.includes(t)) {
        hand = removeFromHand(hand, t);
      } else {
        hand = this.removeJings(hand, 1);
      }
    }

    const meld: Meld = {
      kind: 'chow',
      tiles: sequence,
      concealed: false,
    };

    const event: GameEvent = { kind: 'chow', seat: seatIdx, tile, sequence };

    return this.withState(
      {
        phase: 'playing',
        seats: this.patchSeat(seatIdx, {
          hand,
          openMelds: [...seat.openMelds, meld],
        }),
        currentSeat: seatIdx,
        pendingDiscard: null,
        discardedBySeat: null,
      },
      [event],
    );
  }

  // ── Kong (open off discard) ───────────────────────────────────────────────────

  kongFromDiscard(seatIdx: 0 | 1 | 2 | 3): GameEngine {
    if (this.state.phase !== 'awaiting_claims') throw new Error('Not awaiting claims');
    if (seatIdx === this.state.discardedBySeat) throw new Error('Cannot kong own discard');

    const tile = this.state.pendingDiscard!;
    const seat = this.state.seats[seatIdx];

    if (!canKongFromDiscard(seat.hand, tile, this.jingTypes)) {
      throw new Error(`Cannot kong ${tile} from discard`);
    }

    // Remove 3 tiles from hand
    let hand = [...seat.hand];
    const { naturals: kNaturals, jingCount: kJingCount } = separateJing(hand, this.jingTypes);
    const naturalCount = kNaturals.filter((t) => t === tile).length;

    if (naturalCount >= 3) {
      hand = removeFromHandN(hand, tile, 3);
    } else if (naturalCount === 2 && kJingCount >= 1) {
      hand = removeFromHandN(hand, tile, 2);
      hand = this.removeJings(hand, 1);
    } else if (naturalCount === 1 && kJingCount >= 2) {
      hand = removeFromHand(hand, tile);
      hand = this.removeJings(hand, 2);
    } else {
      // 0 naturals, 3 jings
      hand = this.removeJings(hand, 3);
    }

    const meld: Meld = {
      kind: 'kong',
      tiles: [tile, tile, tile, tile],
      concealed: false,
    };

    const event: GameEvent = { kind: 'kong_open', seat: seatIdx, tile };

    const newSeats = this.patchSeat(seatIdx, {
      hand,
      openMelds: [...seat.openMelds, meld],
    });

    const g = this.withState(
      {
        phase: 'playing',
        seats: newSeats,
        currentSeat: seatIdx,
        pendingDiscard: null,
        discardedBySeat: null,
        kongsTotal: this.state.kongsTotal + 1,
      },
      [event],
    );

    // Draw replacement tile from dead wall
    return g._drawFor(seatIdx, true);
  }

  // ── Kong (concealed, from hand) ───────────────────────────────────────────────

  kongConcealed(seatIdx: 0 | 1 | 2 | 3, tile: TileType): GameEngine {
    if (this.state.phase !== 'playing') throw new Error('Not in playing phase');
    if (seatIdx !== this.state.currentSeat) throw new Error('Not your turn');

    const seat = this.state.seats[seatIdx];
    const options = concealedKongOptions(seat.hand, this.jingTypes);
    if (!options.includes(tile)) throw new Error(`Cannot declare concealed kong of ${tile}`);

    // Remove 4 tiles from hand
    let hand = [...seat.hand];
    const naturalCount = hand.filter((t) => t === tile).length;

    if (naturalCount >= 4) {
      hand = removeFromHandN(hand, tile, 4);
    } else {
      const jingsNeeded = 4 - naturalCount;
      hand = removeFromHandN(hand, tile, naturalCount);
      hand = this.removeJings(hand, jingsNeeded);
    }

    const meld: Meld = {
      kind: 'kong',
      tiles: [tile, tile, tile, tile],
      concealed: true,
    };

    const event: GameEvent = { kind: 'kong_concealed', seat: seatIdx, tile };

    const newSeats = this.patchSeat(seatIdx, {
      hand,
      openMelds: [...seat.openMelds, meld],
    });

    const g = this.withState(
      {
        seats: newSeats,
        kongsTotal: this.state.kongsTotal + 1,
      },
      [event],
    );

    // Draw replacement tile from dead wall
    return g._drawFor(seatIdx, true);
  }

  // ── Convenience getters ───────────────────────────────────────────────────────

  get isFinished(): boolean {
    return this.state.phase === 'finished';
  }

  get currentSeatState(): SeatState {
    return this.state.seats[this.state.currentSeat];
  }
}
