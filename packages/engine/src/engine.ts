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
import { buildWall, typeOf, sortTypes, stepAbove } from './tiles';
import { seededShuffle, mulberry32 } from './prng';
import { rollDice, DICE_SALT } from './dice';
import {
  buildWallState,
  drawFront,
  drawBack,
  tilesRemaining,
  resolveJingStack,
  swapStackTiles,
} from './wall';
import { jingTypesFromIndicator, separateJing } from './jing';
import { isWinningHand, decomposeHand, decomposeConcealed, checkSevenPairs } from './hand';
import { GameRuleError } from './errors';
import {
  canPung,
  canKongFromDiscard,
  concealedKongOptions,
  addToKongOptions,
  chowOptions,
} from './calls';
import { calculateWinPayout, instantKongPayment, calculateOpeningJingSettlement } from './scoring';
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
  WallState,
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

// ── Jing reveal preview ───────────────────────────────────────────────────────

/**
 * Pure preview of the jing reveal: derives the jing dice from the seed and
 * resolves the stack they select, WITHOUT mutating state. The session layer
 * uses this to build the settlement preview before revealJing() runs;
 * revealJing() itself uses the same derivation, so preview and reveal always
 * agree.
 *
 * topTile  — the tile flipped first (settlement tile in ruleTopBottomJing
 *            mode; the jing indicator in standard mode).
 * bottomTile — the tile under it (the jing indicator in ruleTopBottomJing
 *            mode; untouched in standard mode).
 */
export function previewJingReveal(state: GameState): {
  dice: [number, number];
  stackGlobal: number;
  topIdx: number;
  topTile: TileType;
  bottomTile: TileType;
} {
  if (!state.wall) throw new Error('Wall not built yet — call deal() first');
  const dice = rollDice(mulberry32((state.seed ^ DICE_SALT.jing_reveal) >>> 0)) as [number, number];
  const { stackGlobal, topIdx, bottomIdx } = resolveJingStack(state.wall, dice);
  return {
    dice,
    stackGlobal,
    topIdx,
    topTile: typeOf(state.wall.drawOrder[topIdx]),
    bottomTile: typeOf(state.wall.drawOrder[bottomIdx]),
  };
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
      wall: null,
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

  /** The wall after deal() — throws if accessed before the wall is built. */
  private get wallState(): WallState {
    if (!this.state.wall) throw new Error('Wall not built yet — call deal() first');
    return this.state.wall;
  }

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

      // Seven Pairs (小七对): a concealed hand with 7 distinct pairs may also admit a
      // standard chow decomposition (e.g. two pairs of consecutive tiles). Prefer
      // 'seven_pairs' (×2) over 'standard' (×1) when the hand qualifies.
      if (openMelds.length === 0) {
        const { naturals, jingCount } = separateJing(fullHand, this.jingTypes);
        if (checkSevenPairs(naturals, jingCount)) return 'seven_pairs';
      }

      return 'standard';
    }

    // No standard decomposition → Seven Pairs, Thirteen Misfits, or Seven Star Thirteen Misfits.
    // Use the proper jing-aware check (checkSevenPairs handles jing wildcards completing a pair).
    const { naturals, jingCount } = separateJing(fullHand, this.jingTypes);
    if (checkSevenPairs(naturals, jingCount)) return 'seven_pairs';

    // Must be Thirteen Misfits — check for Seven Star variant (all 7 unique honors present)
    const HONORS: TileType[] = ['east', 'south', 'west', 'north', 'zhong', 'fa', 'bai'];
    const hasAllHonors = HONORS.every((h) => fullHand.includes(h));
    return hasAllHonors ? 'seven_star_thirteen' : 'thirteen_misfits';
  }

  // ── Deal ─────────────────────────────────────────────────────────────────────

  /**
   * Build the physical wall and deal tiles to all players the way the table
   * does it. Transitions to 'jing_reveal'.
   *
   * Procedure (all derived from the hand seed — see wall.ts for conventions):
   *   1. Shuffle the 136 tiles into the ring layout (4 walls × 17 stacks × 2).
   *   2. Dice roll #1 (dealer): inclusive CCW count selects whose wall.
   *   3. Dice roll #2 (selected player): inclusive count from the left of
   *      that wall selects the starting stack.
   *   4. Stack taking — dealer first, then CCW: one 2-tile stack per seat per
   *      round, 6 rounds (12 tiles each); then one single tile each (13);
   *      then the dealer alone takes a 14th.
   *   5. Live drawing later continues from exactly where the deal stopped.
   */
  deal(): GameEngine {
    if (this.state.phase !== 'dealing') throw new Error('Not in dealing phase');

    const seed = this.state.seed;
    const layout = seededShuffle(buildWall(), seed);

    const wallSelectionDice = rollDice(mulberry32((seed ^ DICE_SALT.wall_selection) >>> 0)) as [
      number,
      number,
    ];
    const dealStartDice = rollDice(mulberry32((seed ^ DICE_SALT.deal_start) >>> 0)) as [
      number,
      number,
    ];

    let wall = buildWallState(layout, wallSelectionDice, dealStartDice, this.state.dealerSeat);

    const dealt: [TileId[], TileId[], TileId[], TileId[]] = [[], [], [], []];
    const take = (seat: 0 | 1 | 2 | 3): void => {
      const d = drawFront(wall);
      wall = d.wall;
      dealt[seat].push(d.tile);
    };
    const seatAt = (offset: number): 0 | 1 | 2 | 3 =>
      ((this.state.dealerSeat + offset) % 4) as 0 | 1 | 2 | 3;

    // 6 rounds of one full stack (2 tiles) per seat → 12 tiles each
    for (let round = 0; round < 6; round++) {
      for (let k = 0; k < 4; k++) {
        take(seatAt(k));
        take(seatAt(k));
      }
    }
    // One single tile each → 13 each
    for (let k = 0; k < 4; k++) take(seatAt(k));
    // Dealer's 14th
    take(this.state.dealerSeat);

    const hands = dealt.map((ids) => sortTypes(ids.map(typeOf))) as [
      TileType[],
      TileType[],
      TileType[],
      TileType[],
    ];

    const seats = [...this.state.seats] as GameState['seats'];
    for (let i = 0; i < 4; i++) {
      seats[i] = { ...seats[i], hand: hands[i] };
    }

    return this.withState({ phase: 'jing_reveal', wall, seats }, [
      {
        kind: 'dice_roll',
        purpose: 'wall_selection',
        roller: this.state.dealerSeat,
        dice: wallSelectionDice,
      },
      { kind: 'dice_roll', purpose: 'deal_start', roller: wall.dealStartSeat, dice: dealStartDice },
      { kind: 'deal', seed, hands },
    ]);
  }

  // ── Jing reveal ──────────────────────────────────────────────────────────────

  /**
   * Roll the jing dice, resolve the jing stack, and determine both wildcard
   * tile types. Transitions to 'playing', dealer acts first (14 tiles).
   *
   * Both modes: the dealer rolls two dice; the sum counts stacks backwards
   * from the BACK of the wall (inclusive) to resolve the jing stack. The
   * dice are seed-derived (see previewJingReveal) so preview and replay
   * always agree.
   *
   * Standard rule:
   *   The TOP tile of the resolved stack is flipped as the Jing indicator.
   *   It stays in the wall, face up, and is drawn normally.
   *
   * With ruleTopBottomJing:
   *   1. The TOP tile is the settlement tile (下精): instant payout — every
   *      player holding it in their dealt hand receives 2 pts per copy from
   *      each other player (+1 pt per copy of the next-in-sequence tile).
   *   2. The settlement tile is swapped with the tile directly below it; the
   *      revealed BOTTOM tile is the Jing indicator.
   *   3. Both tiles remain in the wall in their swapped positions and are
   *      drawn normally — neither is consumed.
   *   4. Three events: dice_roll, opening_jing_settlement, jing_indicator.
   */
  revealJing(): GameEngine {
    if (this.state.phase !== 'jing_reveal') throw new Error('Not in jing_reveal phase');

    const wall = this.wallState;
    const { dice, stackGlobal, topIdx, topTile, bottomTile } = previewJingReveal(this.state);

    const diceEvent: GameEvent = {
      kind: 'dice_roll',
      purpose: 'jing_reveal',
      roller: this.state.dealerSeat,
      dice,
    };

    // ── Opening Top & Bottom Spirit Flip variant ─────────────────────────────
    if (this.state.config.ruleTopBottomJing) {
      const settlementTile = topTile;
      const indicator = bottomTile;
      const [jingPrimary, jingSecondary] = jingTypesFromIndicator(indicator);

      // Instant payout for players holding the settlement tile (2 pts/copy)
      const scoreDelta0 = calculateOpeningJingSettlement(settlementTile, this.state.seats, 2);
      // 1 pt/copy payout for the "next in sequence" tile (stepAbove settlement).
      // Purely derived — no physical tile is involved in this part.
      const nextInSeq = stepAbove(settlementTile);
      const scoreDelta1 = calculateOpeningJingSettlement(nextInSeq, this.state.seats, 1);
      // Combined zero-sum delta (both settlements applied together)
      const scoreDelta = scoreDelta0.map((d, i) => d + scoreDelta1[i]) as [
        number,
        number,
        number,
        number,
      ];

      const seatsAfterSettlement = [...this.state.seats] as GameState['seats'];
      for (let i = 0; i < 4; i++) {
        seatsAfterSettlement[i] = {
          ...seatsAfterSettlement[i],
          score: seatsAfterSettlement[i].score + scoreDelta[i],
        };
      }

      // Swap the settlement tile with the indicator below it — both stay in
      // the wall in their swapped positions and remain drawable.
      const newWall: WallState = {
        ...swapStackTiles(wall, topIdx),
        jingDice: dice,
        jingStackGlobal: stackGlobal,
      };

      return this.withState(
        {
          phase: 'playing',
          jingIndicator: indicator,
          jingPrimary,
          jingSecondary,
          wall: newWall,
          seats: seatsAfterSettlement,
          currentSeat: this.state.dealerSeat,
        },
        [
          diceEvent,
          { kind: 'opening_jing_settlement', settlementTile, scoreDelta },
          {
            kind: 'jing_indicator',
            indicator,
            jingPrimary,
            jingSecondary,
          },
        ],
      );
    }

    // ── Standard rule ────────────────────────────────────────────────────────
    const indicator = topTile;
    const [jingPrimary, jingSecondary] = jingTypesFromIndicator(indicator);

    return this.withState(
      {
        phase: 'playing',
        jingIndicator: indicator,
        jingPrimary,
        jingSecondary,
        wall: { ...wall, jingDice: dice, jingStackGlobal: stackGlobal },
        currentSeat: this.state.dealerSeat,
      },
      [diceEvent, { kind: 'jing_indicator', indicator, jingPrimary, jingSecondary }],
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

    // Build updated seats for the discard (hand/discards only; scores adjusted below if needed).
    let updatedSeats = this.patchSeat(seatIdx, {
      hand: removeFromHand(seat.hand, tile),
      discards: [...seat.discards, tile],
    });

    const extraEvents: GameEvent[] = [];

    // ── Sacking the Dealer (踢庄) detection ─────────────────────────────────
    // Condition: the 4th discard completes the first round with all four players
    // discarding the same tile type, and no claims (pung/chow/kong) have occurred.
    const prevDiscards = this.events.filter(
      (e): e is Extract<GameEvent, { kind: 'discard' }> => e.kind === 'discard',
    );
    if (prevDiscards.length === 3) {
      const prevDraws = this.events.filter((e) => e.kind === 'draw').length;
      const noClaims = !this.events.some(
        (e) =>
          e.kind === 'pung' ||
          e.kind === 'chow' ||
          e.kind === 'kong_open' ||
          e.kind === 'kong_concealed' ||
          e.kind === 'kong_added',
      );
      if (prevDraws <= 3 && noClaims) {
        const allTiles: TileType[] = [...prevDiscards.map((e) => e.tile), tile];
        if (allTiles.every((t) => t === allTiles[0])) {
          // All four first-round discards are the same tile — dealer pays 5 to each other player.
          const dealer = this.state.dealerSeat;
          const sackDelta: [number, number, number, number] = [0, 0, 0, 0];
          for (let i = 0; i < 4; i++) {
            sackDelta[i] = i === dealer ? -15 : 5;
          }
          const sackSeats = [...updatedSeats] as GameState['seats'];
          for (let i = 0; i < 4; i++) {
            sackSeats[i] = { ...sackSeats[i], score: sackSeats[i].score + sackDelta[i] };
          }
          updatedSeats = sackSeats as GameState['seats'];
          extraEvents.push({ kind: 'sacking_dealer', tile: allTiles[0], scoreDelta: sackDelta });
        }
      }
    }

    return this.withState(
      {
        phase: 'awaiting_claims',
        seats: updatedSeats,
        pendingDiscard: tile,
        discardedBySeat: seatIdx,
      },
      [{ kind: 'discard', seat: seatIdx, tile }, ...extraEvents],
    );
  }

  // ── Pass (no claim) ───────────────────────────────────────────────────────────

  /** All players pass — no one claims the discard. The next player draws. */
  passClaims(): GameEngine {
    if (this.state.phase !== 'awaiting_claims') throw new Error('Not awaiting claims');

    const fromSeat = this.state.discardedBySeat!;
    const nextSeat = ((fromSeat + 1) % 4) as 0 | 1 | 2 | 3;

    return this._drawFor(nextSeat, false);
  }

  // ── Draw (internal) ───────────────────────────────────────────────────────────

  /**
   * Draw a tile for `seatIdx`. Normal draws come from the front of the wall
   * (continuing from where dealing stopped); kong replacement draws come from
   * the back. The hand is wall-exhausted when front and back meet.
   */
  private _drawFor(seatIdx: 0 | 1 | 2 | 3, fromBack: boolean): GameEngine {
    const wall = this.wallState;
    if (tilesRemaining(wall) === 0) {
      return this.withState({ phase: 'finished' }, [{ kind: 'draw_game' }]);
    }

    const { tile: tileId, wall: newWall } = fromBack ? drawBack(wall) : drawFront(wall);
    const tile = typeOf(tileId);
    const seat = this.state.seats[seatIdx];

    return this.withState(
      {
        phase: 'playing',
        wall: newWall,
        seats: this.patchSeat(seatIdx, { hand: sortTypes([...seat.hand, tile]) }),
        currentSeat: seatIdx,
        pendingDiscard: null,
        discardedBySeat: null,
        isKongDraw: fromBack,
      },
      [{ kind: 'draw', seat: seatIdx, tile, fromBack }],
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

    const robKongEvent = isRobKong
      ? this.events
          .slice()
          .reverse()
          .find((e): e is Extract<GameEvent, { kind: 'kong_added' }> => e.kind === 'kong_added')
      : null;
    const robTile = robKongEvent?.tile ?? null;

    // Reconstruct 14-tile hand for win validation.
    // isWinningHand requires exactly 14 tiles, but a hand with k kongs has 14+k total
    // (each kong is 4 tiles rather than 3). Normalize each kong to 3 tiles so the invariant
    // holds. Scoring uses openMelds directly and still sees the full 4-tile kong structure.
    const openMeldTiles = winnerSeat.openMelds.flatMap((m) =>
      m.kind === 'kong' ? [m.tiles[0], m.tiles[0], m.tiles[0]] : [...m.tiles],
    );
    const concealedPlusDraw: TileType[] = [
      ...winnerSeat.hand,
      ...(isRon ? [this.state.pendingDiscard!] : []),
      ...(isRobKong && robTile ? [robTile] : []),
    ];
    // Full 14-tile hand (open melds normalized to 3 tiles each) — used for
    // detectHandType and scoring, which need the complete tile picture.
    const winningHand: TileType[] = [...openMeldTiles, ...concealedPlusDraw];

    // BUG-057: validate using only the concealed portion when open melds exist.
    // Passing the flat 14-tile pool to isWinningHand allows decomposeCore to
    // reassign locked meld tiles into different pairs/melds — an illegal move.
    const isValid =
      openMeldTiles.length === 0
        ? isWinningHand(winningHand, this.jingTypes, isTsumo)
        : decomposeConcealed(concealedPlusDraw, this.jingTypes).length > 0;
    if (!isValid) {
      throw new Error('Hand is not a winning hand');
    }

    const decompositions = decomposeHand(winningHand, this.jingTypes);
    const handType = this.detectHandType(decompositions, winnerSeat.openMelds, winningHand);

    // Defense-in-depth: isWinningHand already excludes Thirteen Misfits for non-tsumo
    // evaluations, so this branch is only reachable via a direct engine call that bypasses
    // the normal claim-window flow. Use GameRuleError so the API layer can reply to the
    // client with a structured error instead of absorbing a generic exception.
    if (
      (handType === 'thirteen_misfits' || handType === 'seven_star_thirteen') &&
      winType !== 'tsumo'
    ) {
      throw new GameRuleError(
        'Thirteen Misfits (十三烂) must be won by self-draw — ron is not allowed',
      );
    }

    const { naturals: winNaturals, jingCount: winJings } = separateJing(
      winningHand,
      this.jingTypes,
    );

    let isGerman: boolean;
    if (handType === 'thirteen_misfits' || handType === 'seven_star_thirteen') {
      // Face-value pattern — no tile acts as a wildcard by definition.
      isGerman = true;
    } else if (handType === 'seven_pairs') {
      // German if no Jing was used as a wildcard to complete a natural singleton.
      // Pure-jing pairs (both tiles are the Jing at face value) are NOT wildcard use.
      const naturalCounts = new Map<TileType, number>();
      for (const t of winNaturals) naturalCounts.set(t, (naturalCounts.get(t) ?? 0) + 1);
      const singles = [...naturalCounts.values()].reduce((sum, c) => sum + (c % 2), 0);
      isGerman = singles === 0;
    } else {
      isGerman = winJings === 0;
    }

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
      isLastTile: tilesRemaining(this.wallState) === 0,
      jingsUsed: winJings,
      openMelds: winnerSeat.openMelds,
      decomposition: decompositions[0],
    });

    // Winner's concealed hand for the hand-reveal — include the winning tile so
    // all four hands in the finished state have their full 14 tiles visible.
    const winnerFinalHand = sortTypes([
      ...winnerSeat.hand,
      ...(isRon ? [this.state.pendingDiscard!] : []),
      ...(isRobKong && robTile ? [robTile] : []),
    ]);

    // Apply win payment to all seat scores.
    // Spirit settlement is intentionally NOT applied here — the service layer
    // (handleHandEnd) owns spirit settlement uniformly for all end types
    // (win / draw / concede) to avoid double-counting.
    const seats = [...this.state.seats] as GameState['seats'];
    for (let i = 0; i < 4; i++) {
      seats[i] = {
        ...seats[i],
        score: seats[i].score + paymentResult.scoreDelta[i],
        ...(i === seatIdx ? { hand: winnerFinalHand } : {}),
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

    // canKongFromDiscard guarantees 3 exact copies of tile in hand (no jing substitution).
    const hand = removeFromHandN([...seat.hand], tile, 3);

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

    // concealedKongOptions guarantees 4 exact copies of tile in hand (no jing substitution;
    // Spirit Kong also satisfies this since the jing tile itself appears 4 times).
    const hand = removeFromHandN([...seat.hand], tile, 4);

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
   * Draws a replacement tile from the back of the wall.
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

    // Draw replacement tile from the back of the wall
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
