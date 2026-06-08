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
 *   - Instant Kong payouts and Spirit settlements are applied inside the engine
 *     so the score on SeatState always reflects the full game ledger.
 */
import { buildWall, typeOf, sortTypes } from './tiles';
import { seededShuffle } from './prng';
import { jingTypesFromIndicator, separateJing } from './jing';
import { isWinningHand, decomposeHand } from './hand';
import {
  canPung,
  canKongFromDiscard,
  concealedKongOptions,
  addToKongOptions,
  chowOptions,
} from './calls';
import {
  calculateWinPayout,
  instantKongPayment,
  calculateSpiritSettlement,
  calculateOpeningJingSettlement,
} from './scoring';
import type {
  GameState,
  GameEvent,
  GameConfig,
  SeatState,
  SeatWind,
  TileType,
  TileId,
  Meld,
  WinPaymentResult,
  HandType,
  Decomposition,
} from './types';

const SEAT_WINDS: SeatWind[] = ['east', 'south', 'west', 'north'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function blankSeat(wind: SeatWind, score = 0): SeatState {
  return { wind, hand: [], openMelds: [], discards: [], score };
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

// ── nextDealer ────────────────────────────────────────────────────────────────

/**
 * Pure helper: compute the dealer/wind state for the next hand.
 *
 * Rules (§2.2):
 *   - Dealer wins or game is a draw (winnerSeat === null) → dealer retains.
 *   - Otherwise → dealer advances to seat (dealerSeat + 1) % 4 (CCW play order).
 *   - When the dealer rotation completes a full cycle back to seat 0, the round
 *     wind advances (east → south → west → north).
 *
 * The session layer (Phase 7 GameService) should call this after every hand end
 * to determine the starting state for the next GameEngine.create() call.
 */
export function nextDealer(
  current: { dealerSeat: 0 | 1 | 2 | 3; roundWind: SeatWind },
  winnerSeat: (0 | 1 | 2 | 3) | null,
): {
  dealerSeat: 0 | 1 | 2 | 3;
  roundWind: SeatWind;
  dealerChanged: boolean;
  /** True when a full rotation of all 4 dealerships just completed. */
  roundComplete: boolean;
} {
  // Dealer retains on win or draw
  if (winnerSeat === null || winnerSeat === current.dealerSeat) {
    return { ...current, dealerChanged: false, roundComplete: false };
  }

  const nextDealerSeat = ((current.dealerSeat + 1) % 4) as 0 | 1 | 2 | 3;

  // A full rotation completes when the dealer cycles back to seat 0
  // (assumes games always start with seat 0 as initial dealer)
  const roundComplete = nextDealerSeat === 0;

  let roundWind = current.roundWind;
  if (roundComplete) {
    const idx = SEAT_WINDS.indexOf(current.roundWind);
    roundWind = SEAT_WINDS[(idx + 1) % 4];
  }

  return { dealerSeat: nextDealerSeat, roundWind, dealerChanged: true, roundComplete };
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
   *
   * @param seed - Deterministic PRNG seed (store for replay).
   * @param options.dealerSeat - Which seat is the dealer (default 0 = East).
   * @param options.roundWind  - Prevailing round wind (default 'east').
   * @param options.startingScores - Initial score for each seat (default all 0).
   *   Set to [20,20,20,20] for bust-mode games.
   */
  static create(
    seed: number,
    options: {
      dealerSeat?: 0 | 1 | 2 | 3;
      roundWind?: SeatWind;
      startingScores?: [number, number, number, number];
      /** Optional rule-variant configuration. Unset flags default to false. */
      config?: Partial<GameConfig>;
    } = {},
  ): GameEngine {
    const {
      dealerSeat = 0,
      roundWind = 'east',
      startingScores = [0, 0, 0, 0],
      config = {},
    } = options;

    const fullConfig: GameConfig = {
      ruleTopBottomJing: false,
      ...config,
    };

    // Seat winds are relative to the dealer (dealer = east, next in play order = south, …)
    const seats = [0, 1, 2, 3].map((i) =>
      blankSeat(SEAT_WINDS[(i - dealerSeat + 4) % 4], startingScores[i]),
    ) as GameState['seats'];

    const state: GameState = {
      phase: 'dealing',
      seed,
      config: fullConfig,
      jingIndicator: null,
      jingPrimary: null,
      jingSecondary: null,
      wall: [],
      deadWall: [],
      seats,
      currentSeat: dealerSeat,
      pendingDiscard: null,
      discardedBySeat: null,
      kongsTotal: 0,
      isKongDraw: false,
      dealerSeat,
      roundWind,
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

  private withState(patch: Partial<GameState>, extraEvents: GameEvent[] = []): GameEngine {
    return new GameEngine({ ...this.state, ...patch }, [...this.events, ...extraEvents]);
  }

  private patchSeat(idx: 0 | 1 | 2 | 3, patch: Partial<SeatState>): GameState['seats'] {
    const seats = [...this.state.seats] as GameState['seats'];
    seats[idx] = { ...seats[idx], ...patch };
    return seats;
  }

  /**
   * Patches two seats in one operation — used when a claim (pung/chow/kong)
   * simultaneously updates the claiming seat AND removes the last tile from the
   * discarder's `discards` pile so it doesn't ghost in the UI.
   */
  private patchTwoSeats(
    idx1: 0 | 1 | 2 | 3,
    patch1: Partial<SeatState>,
    idx2: 0 | 1 | 2 | 3,
    patch2: Partial<SeatState>,
  ): GameState['seats'] {
    const seats = [...this.state.seats] as GameState['seats'];
    seats[idx1] = { ...seats[idx1], ...patch1 };
    seats[idx2] = { ...seats[idx2], ...patch2 };
    return seats;
  }

  /**
   * The seat wind of a given seat index for the current hand.
   * Dealer is always 'east'; subsequent seats in play order are south/west/north.
   */
  private seatWindOf(seatIdx: 0 | 1 | 2 | 3): SeatWind {
    return SEAT_WINDS[(seatIdx - this.state.dealerSeat + 4) % 4];
  }

  /**
   * Apply an instant Kong payout to scores (§6.1).
   * Returns updated seats array with scores adjusted.
   */
  private applyKongPayment(
    seatIdx: 0 | 1 | 2 | 3,
    kind: 'open' | 'concealed',
    seats: GameState['seats'],
  ): GameState['seats'] {
    const payment = instantKongPayment(kind);
    const updated = [...seats] as GameState['seats'];
    for (let i = 0; i < 4; i++) {
      updated[i] = {
        ...updated[i],
        score: updated[i].score + (i === seatIdx ? payment * 3 : -payment),
      };
    }
    return updated;
  }

  /**
   * Detect the structural hand type for the winning hand.
   * Used to select the correct multiplier in calculateWinPayout.
   */
  private detectHandType(
    decompositions: Decomposition[],
    openMelds: Meld[],
    fullHand: TileType[],
  ): HandType {
    if (decompositions.length > 0) {
      // All Triplets (大七对): every meld across open + concealed is a pung or kong
      const openAllPungs = openMelds.every((m) => m.kind === 'pung' || m.kind === 'kong');
      if (openAllPungs) {
        const allPungsDecomp = decompositions.find((d) =>
          d.melds.every((m) => m.kind === 'pung' || m.kind === 'kong'),
        );
        if (allPungsDecomp) return 'all_triplets';
      }
      return 'standard';
    }

    // No standard decomposition → Seven Pairs or Thirteen Misfits
    const counts = new Map<TileType, number>();
    for (const t of fullHand) counts.set(t, (counts.get(t) ?? 0) + 1);

    // Seven Pairs: at least 7 tile types each appearing ≥2 times
    const pairCombos = [...counts.values()].filter((c) => c >= 2).length;
    if (pairCombos >= 7) return 'seven_pairs';

    // Thirteen Misfits: check for Seven Star variant (all 7 unique honors present)
    const honors: TileType[] = ['east', 'south', 'west', 'north', 'zhong', 'fa', 'bai'];
    const hasAllHonors = honors.every((h) => fullHand.includes(h));
    return hasAllHonors ? 'seven_star_thirteen' : 'thirteen_misfits';
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

    // Deal: dealer gets 14, others get 13 (3 rounds of 4 + 1 each + 1 extra for dealer)
    const dealt: [TileId[], TileId[], TileId[], TileId[]] = [[], [], [], []];
    let wallIdx = 0;
    for (let round = 0; round < 3; round++) {
      for (let s = 0; s < 4; s++) {
        for (let t = 0; t < 4; t++) dealt[s].push(liveWall[wallIdx++]);
      }
    }
    for (let s = 0; s < 4; s++) dealt[s].push(liveWall[wallIdx++]);
    // Dealer gets one extra
    dealt[this.state.dealerSeat].push(liveWall[wallIdx++]);

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

    return this.withState({ phase: 'jing_reveal', wall: remainingWall, deadWall, seats }, [
      { kind: 'deal', seed: this.state.seed, hands },
    ]);
  }

  // ── Jing reveal ──────────────────────────────────────────────────────────────

  /**
   * Reveal the Jing indicator and determine both wildcard tile types.
   *
   * Standard rule:
   *   Primary Spirit (正精): deadWall[0] (the indicator tile).
   *   Secondary Spirit (副精): one rank above the indicator.
   *   Transitions to 'playing', dealer acts first (14 tiles).
   *
   * With ruleTopBottomJing:
   *   1. wall[0] = settlement tile (下精): instant payout — every player holding
   *      this tile in their dealt hand receives 2 pts per copy from each other player.
   *   2. The settlement tile is tucked to the bottom of the live wall.
   *   3. wall[1] (now wall[0] after tuck) = true indicator for jing determination.
   *   4. Indicator is consumed from the live wall (not the dead wall).
   *   5. deadWall is left intact (4 tiles → all 4 available for kong replacements).
   *   6. Two engine events are appended: opening_jing_settlement, then jing_indicator.
   */
  revealJing(): GameEngine {
    if (this.state.phase !== 'jing_reveal') throw new Error('Not in jing_reveal phase');

    // ── Opening Top & Bottom Spirit Flip variant ─────────────────────────────
    if (this.state.config.ruleTopBottomJing) {
      if (this.state.wall.length < 2) {
        throw new Error('ruleTopBottomJing: not enough wall tiles for settlement + indicator');
      }

      const wall = this.state.wall;

      // wall[0] = settlement tile (下精); wall[1] = indicator (上精 / true Jing indicator)
      const settlementTileId = wall[0];
      const indicatorTileId = wall[1];
      const settlementTile = typeOf(settlementTileId);
      const indicator = typeOf(indicatorTileId);
      const [jingPrimary, jingSecondary] = jingTypesFromIndicator(indicator);

      // Compute instant payout for players holding the settlement tile (wall[0], 2 pts/copy)
      const scoreDelta0 = calculateOpeningJingSettlement(settlementTile, this.state.seats, 2);
      // Compute 1 pt/copy payout for players holding the indicator tile (wall[1], 1 pt/copy)
      const scoreDelta1 = calculateOpeningJingSettlement(indicator, this.state.seats, 1);
      // Combined zero-sum delta (both settlements applied together)
      const scoreDelta = scoreDelta0.map((d, i) => d + scoreDelta1[i]) as [
        number,
        number,
        number,
        number,
      ];

      // Apply score deltas
      const seatsAfterSettlement = [...this.state.seats] as GameState['seats'];
      for (let i = 0; i < 4; i++) {
        seatsAfterSettlement[i] = {
          ...seatsAfterSettlement[i],
          score: seatsAfterSettlement[i].score + scoreDelta[i],
        };
      }

      // Settlement tile tucked to bottom; indicator consumed (removed from live wall).
      // Final wall: [wall[2], wall[3], ..., wall[n-1], wall[0]]
      //   - wall[1] (indicator) is consumed (not available to draw)
      //   - wall[0] (settlement tile) moves to the bottom (last-draw position)
      const newWall = [...wall.slice(2), settlementTileId];

      return this.withState(
        {
          phase: 'playing',
          jingIndicator: indicator,
          jingPrimary,
          jingSecondary,
          wall: newWall,
          // deadWall remains untouched (all 4 tiles available for kong replacements)
          seats: seatsAfterSettlement,
          currentSeat: this.state.dealerSeat,
        },
        [
          { kind: 'opening_jing_settlement', settlementTile, scoreDelta },
          { kind: 'jing_indicator', indicator, jingPrimary, jingSecondary },
        ],
      );
    }

    // ── Standard rule ────────────────────────────────────────────────────────
    const indicatorId = this.state.deadWall[0];
    const indicator = typeOf(indicatorId);
    const [jingPrimary, jingSecondary] = jingTypesFromIndicator(indicator);

    return this.withState(
      {
        phase: 'playing',
        jingIndicator: indicator,
        jingPrimary,
        jingSecondary,
        deadWall: this.state.deadWall.slice(1),
        currentSeat: this.state.dealerSeat,
      },
      [{ kind: 'jing_indicator', indicator, jingPrimary, jingSecondary }],
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

    return this.withState(
      {
        phase: 'awaiting_claims',
        seats: this.patchSeat(seatIdx, {
          hand: removeFromHand(seat.hand, tile),
          discards: [...seat.discards, tile],
        }),
        pendingDiscard: tile,
        discardedBySeat: seatIdx,
      },
      [{ kind: 'discard', seat: seatIdx, tile }],
    );
  }

  // ── Pass (no claim) ───────────────────────────────────────────────────────────

  /** All players pass — no one claims the discard. The next player draws. */
  passClaims(): GameEngine {
    if (this.state.phase !== 'awaiting_claims') throw new Error('Not awaiting claims');

    const fromSeat = this.state.discardedBySeat!;
    const nextSeat = ((fromSeat + 1) % 4) as 0 | 1 | 2 | 3;

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
    const wallPatch = fromDeadWall ? { deadWall: remainingWall } : { wall: remainingWall };

    return this.withState(
      {
        phase: 'playing',
        ...wallPatch,
        seats: this.patchSeat(seatIdx, { hand: sortTypes([...seat.hand, tile]) }),
        currentSeat: seatIdx,
        pendingDiscard: null,
        discardedBySeat: null,
        isKongDraw: fromDeadWall,
      },
      [{ kind: 'draw', seat: seatIdx, tile, fromDeadWall }],
    );
  }

  // ── Win ───────────────────────────────────────────────────────────────────────

  /**
   * Declare a win.
   *
   * @param seatIdx - The winning seat.
   * @param options.isTrueGerman - Pass true from the session layer when no other
   *   player holds any Jing tiles (requires inspecting all seats' hands).
   * @param options.isSpiritFishing - Pass true when the winner was waiting on a
   *   pair with 4 open melds (session layer detects this from tenpai state).
   * @param options.robKongSeat - When a player wins by robbing an add-to-kong,
   *   pass the seat index of the player whose kong was robbed.
   */
  declareWin(
    seatIdx: 0 | 1 | 2 | 3,
    options: {
      isTrueGerman?: boolean;
      isSpiritFishing?: boolean;
      robKongSeat?: 0 | 1 | 2 | 3;
    } = {},
  ): GameEngine {
    const { isTrueGerman = false, isSpiritFishing = false, robKongSeat } = options;

    const isRobKong = robKongSeat !== undefined;

    const isRon =
      !isRobKong &&
      this.state.phase === 'awaiting_claims' &&
      this.state.pendingDiscard !== null &&
      seatIdx !== this.state.discardedBySeat;

    const isTsumo =
      !isRobKong && this.state.phase === 'playing' && seatIdx === this.state.currentSeat;

    // Rob-kong wins happen from the 'playing' phase (after addToKong creates the window)
    if (!isRon && !isTsumo && !isRobKong) throw new Error('Invalid win declaration');

    const winType = isRon ? 'ron' : 'tsumo';
    const winnerSeat = this.state.seats[seatIdx];

    // Reconstruct full 14-tile hand: open melds + concealed + (ron) discard
    const openMeldTiles = winnerSeat.openMelds.flatMap((m) => [...m.tiles]);
    const winningHand: TileType[] = [
      ...openMeldTiles,
      ...winnerSeat.hand,
      ...(isRon ? [this.state.pendingDiscard!] : []),
    ];

    if (!isWinningHand(winningHand, this.jingTypes)) {
      throw new Error('Hand is not a winning hand');
    }

    const decompositions = decomposeHand(winningHand, this.jingTypes);
    const handType = this.detectHandType(decompositions, winnerSeat.openMelds, winningHand);

    const { jingCount: winJings } = separateJing(winningHand, this.jingTypes);
    const isGerman = winJings === 0;

    // Heavenly Win: tsumo before any discard or draw has occurred
    const isHeavenlyWin =
      isTsumo &&
      seatIdx === this.state.dealerSeat &&
      !this.events.some((e) => e.kind === 'discard' || e.kind === 'draw');

    // Earthly Win: ron on the very first discard, before any player has drawn
    const isEarthlyWin =
      isRon &&
      this.events.filter((e) => e.kind === 'discard').length === 1 &&
      !this.events.some((e) => e.kind === 'draw');

    const paymentResult: WinPaymentResult = calculateWinPayout({
      winType,
      handType,
      winnerSeat: seatIdx,
      dealerSeat: this.state.dealerSeat,
      discarderSeat: isRon ? this.state.discardedBySeat! : undefined,
      kongSeat: robKongSeat,
      seatWind: this.seatWindOf(seatIdx),
      roundWind: this.state.roundWind,
      isRobKong,
      isGerman,
      isTrueGerman,
      isSpiritFishing,
      isHeavenlyWin,
      isEarthlyWin,
      isAfterKong: this.state.isKongDraw && isTsumo,
      isLastTile: this.state.wall.length === 0,
      jingsUsed: winJings,
      openMelds: winnerSeat.openMelds,
      decomposition: decompositions[0],
    });

    // Spirit settlement (§6.2) — applies to ALL players at hand end
    const spiritDelta = calculateSpiritSettlement(
      this.state.seats,
      this.state.jingPrimary!,
      this.state.jingSecondary!,
    );

    // Apply win payment + spirit settlement to all seat scores
    const seats = [...this.state.seats] as GameState['seats'];
    for (let i = 0; i < 4; i++) {
      seats[i] = {
        ...seats[i],
        score: seats[i].score + paymentResult.scoreDelta[i] + spiritDelta[i],
      };
    }

    const event: GameEvent = {
      kind: 'win',
      seat: seatIdx,
      winType,
      handType,
      paymentResult,
    };

    return this.withState({ phase: 'finished', seats }, [event]);
  }

  // ── Concede ───────────────────────────────────────────────────────────────────

  /**
   * A player concedes the hand.
   *
   * Per design (D5): score is unchanged (−0). The session layer is responsible
   * for tracking streak breaks. The game is marked finished so the session can
   * move to the next hand or end the session.
   *
   * The concede penalty value is intentionally kept at 0 to start and can be
   * tuned by the session layer later without engine changes.
   */
  concede(seatIdx: 0 | 1 | 2 | 3): GameEngine {
    if (this.state.phase !== 'playing' && this.state.phase !== 'awaiting_claims') {
      throw new Error('Cannot concede outside of an active hand');
    }

    return this.withState({ phase: 'finished' }, [{ kind: 'concede', seat: seatIdx }]);
  }

  // ── Pung ──────────────────────────────────────────────────────────────────────

  /** Claim the pending discard as a Pung. */
  pung(seatIdx: 0 | 1 | 2 | 3): GameEngine {
    if (this.state.phase !== 'awaiting_claims') throw new Error('Not awaiting claims');
    if (seatIdx === this.state.discardedBySeat) throw new Error('Cannot pung own discard');

    const tile = this.state.pendingDiscard!;
    const fromSeat = this.state.discardedBySeat!;
    const seat = this.state.seats[seatIdx];
    const discarderSeat = this.state.seats[fromSeat];

    if (!canPung(seat.hand, tile, this.jingTypes)) {
      throw new Error(`Cannot pung ${tile}`);
    }

    let hand = [...seat.hand];
    const { naturals } = separateJing(hand, this.jingTypes);
    const naturalCount = naturals.filter((t) => t === tile).length;

    if (naturalCount >= 2) {
      hand = removeFromHandN(hand, tile, 2);
    } else if (naturalCount === 1) {
      hand = removeFromHand(hand, tile);
      hand = this.removeJings(hand, 1);
    } else {
      hand = this.removeJings(hand, 2);
    }

    return this.withState(
      {
        phase: 'playing',
        // Patch both seats: add the meld to the claimer AND remove the claimed
        // tile from the discarder's discard pile so it doesn't ghost in the UI.
        seats: this.patchTwoSeats(
          seatIdx,
          {
            hand,
            openMelds: [
              ...seat.openMelds,
              { kind: 'pung', tiles: [tile, tile, tile], concealed: false },
            ],
          },
          fromSeat,
          { discards: discarderSeat.discards.slice(0, -1) },
        ),
        currentSeat: seatIdx,
        pendingDiscard: null,
        discardedBySeat: null,
      },
      [{ kind: 'pung', seat: seatIdx, tile }],
    );
  }

  // ── Chow ──────────────────────────────────────────────────────────────────────

  /** Claim the pending discard as a Chow. `sequence` is the three-tile chow. */
  chow(seatIdx: 0 | 1 | 2 | 3, sequence: [TileType, TileType, TileType]): GameEngine {
    if (this.state.phase !== 'awaiting_claims') throw new Error('Not awaiting claims');

    const fromSeat = this.state.discardedBySeat!;
    const expectedChower = ((fromSeat + 1) % 4) as 0 | 1 | 2 | 3;
    if (seatIdx !== expectedChower) throw new Error('Only the player after the discarder can chow');

    const tile = this.state.pendingDiscard!;
    const seat = this.state.seats[seatIdx];
    const discarderSeat = this.state.seats[fromSeat];

    const options = chowOptions(seat.hand, tile, this.jingTypes);
    if (!options.some((opt) => opt.every((t, i) => t === sequence[i]))) {
      throw new Error(`Cannot chow ${tile} with ${sequence.join(',')}`);
    }

    let hand = [...seat.hand];
    for (const t of sequence) {
      if (t === tile) continue;
      if (hand.includes(t)) {
        hand = removeFromHand(hand, t);
      } else {
        hand = this.removeJings(hand, 1);
      }
    }

    return this.withState(
      {
        phase: 'playing',
        // Patch both seats: add the meld to the claimer AND remove the claimed
        // tile from the discarder's discard pile so it doesn't ghost in the UI.
        seats: this.patchTwoSeats(
          seatIdx,
          {
            hand,
            openMelds: [...seat.openMelds, { kind: 'chow', tiles: sequence, concealed: false }],
          },
          fromSeat,
          { discards: discarderSeat.discards.slice(0, -1) },
        ),
        currentSeat: seatIdx,
        pendingDiscard: null,
        discardedBySeat: null,
      },
      [{ kind: 'chow', seat: seatIdx, tile, sequence }],
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
      hand = this.removeJings(hand, 3);
    }

    const discarder = this.state.discardedBySeat!;
    const discarderSeat = this.state.seats[discarder];

    // Patch both seats: add the meld to the claimer AND remove the claimed tile
    // from the discarder's discard pile so it doesn't ghost in the UI.
    const newSeatsAfterMeld = this.patchTwoSeats(
      seatIdx,
      {
        hand,
        openMelds: [
          ...seat.openMelds,
          { kind: 'kong', tiles: [tile, tile, tile, tile], concealed: false },
        ],
      },
      discarder,
      { discards: discarderSeat.discards.slice(0, -1) },
    );

    // Apply instant open-kong payment (§6.1): 1 pt from each other player
    const seatsAfterPayment = this.applyKongPayment(seatIdx, 'open', newSeatsAfterMeld);

    const g = this.withState(
      {
        phase: 'playing',
        seats: seatsAfterPayment,
        currentSeat: seatIdx,
        pendingDiscard: null,
        discardedBySeat: null,
        kongsTotal: this.state.kongsTotal + 1,
      },
      [{ kind: 'kong_open', seat: seatIdx, tile }],
    );

    return g._drawFor(seatIdx, true);
  }

  // ── Kong (concealed, from hand) ───────────────────────────────────────────────

  kongConcealed(seatIdx: 0 | 1 | 2 | 3, tile: TileType): GameEngine {
    if (this.state.phase !== 'playing') throw new Error('Not in playing phase');
    if (seatIdx !== this.state.currentSeat) throw new Error('Not your turn');

    const seat = this.state.seats[seatIdx];
    const options = concealedKongOptions(seat.hand, this.jingTypes);
    if (!options.includes(tile)) throw new Error(`Cannot declare concealed kong of ${tile}`);

    let hand = [...seat.hand];
    const naturalCount = hand.filter((t) => t === tile).length;

    if (naturalCount >= 4) {
      hand = removeFromHandN(hand, tile, 4);
    } else {
      const jingsNeeded = 4 - naturalCount;
      hand = removeFromHandN(hand, tile, naturalCount);
      hand = this.removeJings(hand, jingsNeeded);
    }

    const newSeatsAfterMeld = this.patchSeat(seatIdx, {
      hand,
      openMelds: [
        ...seat.openMelds,
        { kind: 'kong', tiles: [tile, tile, tile, tile], concealed: true },
      ],
    });

    // Apply instant concealed-kong payment (§6.1): 2 pts from each other player
    const seatsAfterPayment = this.applyKongPayment(seatIdx, 'concealed', newSeatsAfterMeld);

    const g = this.withState(
      {
        seats: seatsAfterPayment,
        kongsTotal: this.state.kongsTotal + 1,
      },
      [{ kind: 'kong_concealed', seat: seatIdx, tile }],
    );

    return g._drawFor(seatIdx, true);
  }

  // ── Add to Kong ───────────────────────────────────────────────────────────────

  /**
   * Add a tile from hand to an existing open Pung, upgrading it to a Kong.
   * Emits a rob-kong claim window opportunity to opponents (handled by gateway).
   * Draws a replacement tile from the dead wall.
   * Applies instant open-kong payment (§6.1).
   */
  addToKong(seatIdx: 0 | 1 | 2 | 3, tile: TileType): GameEngine {
    if (this.state.phase !== 'playing') throw new Error('Not in playing phase');
    if (seatIdx !== this.state.currentSeat) throw new Error('Not your turn');

    const seat = this.state.seats[seatIdx];

    // Find the open pung to upgrade
    const pungIdx = seat.openMelds.findIndex((m) => m.kind === 'pung' && m.tiles[0] === tile);
    if (pungIdx === -1) throw new Error(`No open pung of ${tile} to add to`);

    // Validate: player must have the tile or a Jing that can fill it
    const options = addToKongOptions(seat.hand, tile, this.jingTypes);
    if (options.length === 0) throw new Error(`Cannot add to kong of ${tile}`);

    const addedTile = options[0];
    const newHand = removeFromHand(seat.hand, addedTile);

    // Upgrade pung → kong
    const kongMeld: Meld = {
      kind: 'kong',
      tiles: [tile, tile, tile, tile],
      concealed: false,
    };
    const newMelds = [
      ...seat.openMelds.slice(0, pungIdx),
      kongMeld,
      ...seat.openMelds.slice(pungIdx + 1),
    ];

    const newSeatsAfterMeld = this.patchSeat(seatIdx, { hand: newHand, openMelds: newMelds });

    // Apply instant supplement-kong payment (§6.1): 1 pt from each other player
    const seatsAfterPayment = this.applyKongPayment(seatIdx, 'open', newSeatsAfterMeld);

    const g = this.withState(
      {
        seats: seatsAfterPayment,
        kongsTotal: this.state.kongsTotal + 1,
      },
      [{ kind: 'kong_added', seat: seatIdx, tile }],
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
