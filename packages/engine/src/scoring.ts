/**
 * Scoring for Nanchang Mahjong — locked rules (§6).
 *
 * Payment model: Base (1) × Multipliers (§6.3 / §6.4).
 *
 * ── Winning payout ────────────────────────────────────────────────────────────
 *   Tsumo:     each of 3 losers pays  (base × multiplier × 2)
 *   Ron:       discarder pays          (base × multiplier × 2)
 *              each other non-winner   (base × multiplier × 1)
 *   Rob Kong:  same structure as Tsumo, but only the konger pays (all 3 shares)
 *   Heavenly / Earthly Win: flat 20 from each loser (40 if Spirit Fishing) — overrides all multipliers
 *
 * ── Multipliers (stackable) ───────────────────────────────────────────────────
 *   Hand type:  Seven Pairs ×2 · All Triplets ×2 · Thirteen Misfits ×2 · Seven Star ×4
 *   Kong Bloom: ×2 (for ×4 total when combined with tsumo ×2) — win on kong replacement draw
 *   German:     +5 flat per loser only (no ×2 multiplier)
 *   True German: ×2 (+5 flat per loser) — winner & table both jing-free; supersedes German
 *   Spirit Fishing: ×2
 *   Dealer win: ×2  (when winner is the current dealer)
 *   Dealer loss tsumo: dealer pays ×4 (instead of ×2) when winner is not the dealer
 *   Dealer loss ron:   dealer pays ×2× their base rate (discarder ×4, non-discarder ×2)
 *
 * ── Instant payouts (separate from win, called per-event) ────────────────────
 *   Open/Supplement Kong: 1 pt from each other player  (§6.1)
 *   Concealed Kong:       2 pts from each other player (§6.1)
 *
 * ── Spirit settlement (end of every hand, all players) ───────────────────────
 *   Primary Spirit held: 2 pts from each other player
 *   Secondary Spirit held: 1 pt from each other player
 *   Spirit Kong (4 of one spirit type as a kong): +10 pts from each other player
 *   Explosive Spirit (total ≥ 5): formula effectiveScore = raw × (raw − 3)
 *   Indomitable Spirit (only one player has spirits): double their score
 */

import type {
  MultiplierItem,
  WinPaymentResult,
  ScoringContext,
  SeatState,
  TileType,
} from './types';

// ── Win payout ────────────────────────────────────────────────────────────────

/**
 * Calculate the win payment for a completed hand using the locked rules
 * Base × Multiplier system.
 *
 * Returns a zero-sum score delta for all four seats and a breakdown of
 * multiplier items for display / Phase 8 history.
 */
export function calculateWinPayout(ctx: ScoringContext): WinPaymentResult {
  const {
    winType,
    handType,
    winnerSeat,
    dealerSeat,
    discarderSeat,
    kongSeat,
    isRobKong,
    isGerman,
    isTrueGerman,
    isSpiritFishing,
    isHeavenlyWin,
    isEarthlyWin,
    isAfterKong,
  } = ctx;

  // ── Heavenly / Earthly Win — flat rate, overrides standard multipliers ────────
  // Spirit Fishing doubles the flat rate (20 → 40) per §2.3.
  if (isHeavenlyWin || isEarthlyWin) {
    const flat = isSpiritFishing ? 40 : 20;
    const scoreDelta: [number, number, number, number] = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      scoreDelta[i] = i === winnerSeat ? flat * 3 : -flat;
    }
    const items: MultiplierItem[] = [
      {
        name: isHeavenlyWin ? 'Heavenly Win' : 'Earthly Win',
        nameZh: isHeavenlyWin ? '天胡' : '地胡',
        multiplier: 1,
        flatPerLoser: isSpiritFishing ? 0 : flat,
      },
    ];
    if (isSpiritFishing) {
      items.push({ name: 'Spirit Fishing', nameZh: '精钓', multiplier: 1, flatPerLoser: flat });
    }
    return {
      items,
      totalMultiplier: 1,
      flatBonusPerLoser: flat,
      scoreDelta,
      winnerTotal: flat * 3,
    };
  }

  // ── Build multiplier stack ─────────────────────────────────────────────────

  const items: MultiplierItem[] = [];
  let multiplier = 1;
  let flatBonusPerLoser = 0;

  // Hand-type multiplier (§6.3)
  switch (handType) {
    case 'seven_pairs':
      items.push({ name: 'Seven Pairs', nameZh: '七对子', multiplier: 2, flatPerLoser: 0 });
      multiplier *= 2;
      break;
    case 'all_triplets':
      items.push({
        name: 'All Triplets',
        nameZh: '大七对',
        multiplier: 2,
        flatPerLoser: 0,
      });
      multiplier *= 2;
      break;
    case 'thirteen_misfits':
      items.push({
        name: 'Thirteen Misfits',
        nameZh: '十三烂',
        multiplier: 2,
        flatPerLoser: 0,
      });
      multiplier *= 2;
      break;
    case 'seven_star_thirteen':
      items.push({
        name: 'Seven Star Thirteen Misfits',
        nameZh: '七星十三烂',
        multiplier: 4,
        flatPerLoser: 0,
      });
      multiplier *= 4;
      break;
    // 'standard': no hand-type multiplier
  }

  // German (§2.4): no ×2 multiplier — only a flat +5 per loser added after other multipliers.
  // True German (§2.4): an additional ×2 on top of accumulated multipliers, plus flat +5.
  // True German supersedes German.
  if (isTrueGerman) {
    items.push({ name: 'True German', nameZh: '德中德', multiplier: 2, flatPerLoser: 5 });
    multiplier *= 2;
    flatBonusPerLoser += 5;
  } else if (isGerman) {
    items.push({ name: 'German', nameZh: '德国', multiplier: 1, flatPerLoser: 5 });
    flatBonusPerLoser += 5;
  }

  // Spirit Fishing (§2.2)
  if (isSpiritFishing) {
    items.push({ name: 'Spirit Fishing', nameZh: '精钓', multiplier: 2, flatPerLoser: 0 });
    multiplier *= 2;
  }

  // Kong Bloom (§2.2): win on a kong replacement draw (杠开) adds ×2 to stack (→ ×4 total with tsumo ×2).
  if (isAfterKong) {
    items.push({ name: 'Kong Bloom', nameZh: '杠开', multiplier: 2, flatPerLoser: 0 });
    multiplier *= 2;
  }

  // Dealer win (§2.2): winner is the current dealer → ×2 on the whole hand
  const isDealer = winnerSeat === dealerSeat;
  if (isDealer) {
    items.push({ name: 'Dealer', nameZh: '庄家', multiplier: 2, flatPerLoser: 0 });
    multiplier *= 2;
  }

  // ── Compute per-seat score delta ─────────────────────────────────────────────

  const scoreDelta: [number, number, number, number] = [0, 0, 0, 0];

  if (isRobKong && kongSeat !== undefined) {
    // Rob Kong: konger pays all three shares (treated as tsumo).
    // If the konger is the dealer-loser, their entire payment is doubled.
    const kongerIsDealer = !isDealer && kongSeat === dealerSeat;
    const kongerRate = kongerIsDealer ? 4 : 2;
    const kongerPays = multiplier * kongerRate * 3 + flatBonusPerLoser * 3;
    scoreDelta[winnerSeat] += kongerPays;
    scoreDelta[kongSeat] -= kongerPays;
    // The other two seats pay nothing
  } else if (winType === 'tsumo') {
    // Self-draw: each loser pays ×2.
    // Dealer loss (§2.2): when winner is not the dealer, the dealer pays ×4 instead of ×2.
    for (let i = 0; i < 4; i++) {
      if (i === winnerSeat) continue;
      const payerIsDealer = !isDealer && i === dealerSeat;
      const pays = multiplier * (payerIsDealer ? 4 : 2) + flatBonusPerLoser;
      scoreDelta[i] = -pays;
      scoreDelta[winnerSeat] += pays;
    }
  } else {
    // Ron: discarder pays ×2, each other non-winner pays ×1.
    // Dealer loss (§2.2): when dealer is a losing payer, their rate is doubled.
    //   Dealer-as-discarder: ×2 × ×2 = ×4
    //   Dealer-as-non-discarder: ×1 × ×2 = ×2
    const discarder = discarderSeat!;
    for (let i = 0; i < 4; i++) {
      if (i === winnerSeat) continue;
      const payerIsDealer = !isDealer && i === dealerSeat;
      let pays: number;
      if (i === discarder) {
        pays = multiplier * (payerIsDealer ? 4 : 2) + flatBonusPerLoser;
      } else {
        pays = multiplier * (payerIsDealer ? 2 : 1) + flatBonusPerLoser;
      }
      scoreDelta[i] -= pays;
      scoreDelta[winnerSeat] += pays;
    }
  }

  return {
    items,
    totalMultiplier: multiplier,
    flatBonusPerLoser,
    scoreDelta,
    winnerTotal: scoreDelta[winnerSeat],
  };
}

// ── Opening Top & Bottom Spirit Flip settlement (开局上下翻精) ────────────────

/**
 * Instant payout for the Opening Top & Bottom Spirit Flip rule (开局上下翻精).
 *
 * Each player who holds one or more copies of the settlement tile in their
 * INITIAL DEALT HAND receives 2 points from every other player per copy held.
 *
 * Formula (identical structure to spirit settlement):
 *   scoreDelta[i] = RATE × (4 × copies_i − total_copies)
 *
 * This guarantees zero-sum: Σ scoreDelta[i] = 0.
 *
 * When nobody holds the tile (all copies are in the wall), the delta is [0,0,0,0].
 *
 * @param settlementTile  The flipped tile (wall[0] after dealing).
 * @param seats           The four seat states immediately after dealing.
 * @returns               Zero-sum score delta [seat0, seat1, seat2, seat3].
 */
export function calculateOpeningJingSettlement(
  settlementTile: TileType,
  seats: readonly [SeatState, SeatState, SeatState, SeatState],
  rate = 2,
): [number, number, number, number] {
  const counts = seats.map((seat) => seat.hand.filter((t) => t === settlementTile).length);
  const total = counts.reduce((sum, c) => sum + c, 0);

  if (total === 0) return [0, 0, 0, 0];

  // scoreDelta[i] = rate × (4 × copies_i − total)
  // Proof of zero-sum: Σ(4×c_i − total) = 4×total − 4×total = 0
  return counts.map((c) => rate * (4 * c - total)) as [number, number, number, number];
}

// ── Instant Kong payout (§6.1) ────────────────────────────────────────────────

/**
 * Points each OTHER player pays to the kong declarer immediately when a kong
 * is declared (before any draw, independent of who wins).
 *
 * Open (from discard) or Supplement (add-to-pung): 1 point from each.
 * Concealed: 2 points from each.
 *
 * The engine applies this in kongFromDiscard / kongConcealed / addToKong.
 */
export function instantKongPayment(kind: 'open' | 'concealed'): number {
  return kind === 'open' ? 1 : 2;
}

// ── Spirit settlement (§6.2) ──────────────────────────────────────────────────

/**
 * Calculate the per-player spirit tile settlement at end of each hand.
 *
 * Every player pays every other player based on the spirit tiles the other
 * player holds (in hand + open melds).
 *
 * Settlement formula (zero-sum):
 *   scoreDelta[i] = (4 × effectiveScore[i]) − totalEffectiveSpirits
 *
 * effectiveScore per player:
 *   rawScore = (primaryTileCount × 2) + (secondaryTileCount × 1) + (spiritKongs × 10)
 *   if rawScore ≥ 5: effectiveScore = rawScore × (rawScore − 3)   [Explosive Spirit]
 *   else:             effectiveScore = rawScore
 *   if only ONE player has spirits: effectiveScore × 2              [Indomitable Spirit]
 *
 * Returns a [number, number, number, number] score delta (zero-sum).
 */
export function calculateSpiritSettlement(
  seats: readonly [SeatState, SeatState, SeatState, SeatState],
  jingPrimary: TileType,
  jingSecondary: TileType,
): [number, number, number, number] {
  const rawScores = seats.map((seat) => {
    // All tiles the player holds: concealed hand + all tiles in open melds
    const allTiles: TileType[] = [
      ...seat.hand,
      ...(seat.openMelds.flatMap((m) => m.tiles) as TileType[]),
    ];

    const primaryCount = allTiles.filter((t) => t === jingPrimary).length;
    const secondaryCount = allTiles.filter((t) => t === jingSecondary).length;

    // Spirit Kong: a kong meld whose tiles are all one spirit type
    const spiritKongs = seat.openMelds.filter(
      (m) => m.kind === 'kong' && (m.tiles[0] === jingPrimary || m.tiles[0] === jingSecondary),
    ).length;

    const raw = primaryCount * 2 + secondaryCount * 1 + spiritKongs * 10;

    // Explosive Spirit (§6.2): total ≥ 5 → raw × (raw − 3)
    return raw >= 5 ? raw * (raw - 3) : raw;
  });

  // Indomitable Spirit (§6.2): if exactly ONE player has spirits, double their score
  const playersWithSpirits = rawScores.filter((s) => s > 0).length;
  const effectiveScores = rawScores.map((s) => (playersWithSpirits === 1 ? s * 2 : s));

  const totalSpirits = effectiveScores.reduce((sum, s) => sum + s, 0);

  // scoreDelta[i] = 4 × effectiveScores[i] − totalSpirits  (zero-sum proof: Σ = 0)
  return effectiveScores.map((s) => 4 * s - totalSpirits) as [number, number, number, number];
}
