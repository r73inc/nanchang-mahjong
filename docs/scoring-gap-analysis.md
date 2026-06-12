# Scoring Gap Analysis — Code vs. Definitive Rules

Compiled 2026-06-12. Based on reading the actual source code (`packages/engine/src/scoring.ts`, `engine.ts`, `types.ts`, `hand.ts`, `jing.ts`, `apps/api/src/game/game.service.ts`, `elo.service.ts`). No markdown docs consulted.

---

## Part 1 — Round/Hand Scoring (Game Engine)

### How the code works

**Win payout** — `calculateWinPayout()` in `scoring.ts`

The engine uses a Base(1) × Multipliers model.

1. **Hand-type multiplier** selected by `detectHandType()` in `engine.ts`:

   | `HandType` value      | Code multiplier | Notes                                      |
   | --------------------- | --------------- | ------------------------------------------ |
   | `standard`            | ×1              | 4 melds + 1 pair                           |
   | `seven_pairs`         | ×2              | 7 distinct pairs (小七对)                  |
   | `all_triplets`        | ×2              | All melds are pungs/kongs (大七对)         |
   | `thirteen_misfits`    | ×2              | No jing, rank gap > 2 (十三烂)             |
   | `seven_star_thirteen` | ×4              | 13-misfits with all 7 honours (七星十三烂) |

2. **Win-type multiplier** applied in the payment calculation:
   - Tsumo: each of 3 losers pays `multiplier × 2 + flatBonus`
   - Ron: discarder pays `multiplier × 2 + flatBonus`; each non-discarder non-winner pays `multiplier × 1 + flatBonus`
   - Rob-kong: treated as tsumo; only the konger pays (all 3 shares)

3. **Additional multipliers** stacked onto `multiplier`:
   - German (`isGerman`): `multiplier *= 2`, then `flatBonusPerLoser += 5`
   - True German (`isTrueGerman`): `multiplier *= 4`, `flatBonusPerLoser += 5` (supersedes German)
   - Spirit Fishing (`isSpiritFishing`): `multiplier *= 2`
   - Dealer win (`winnerSeat === dealerSeat`): `multiplier *= 2`

4. **Dealer loss (partial)**: only when the discarder is the dealer (`isDiscarderDealer`): `discarderPays = multiplier × 2 × 2 + flatBonus` (i.e., ×4 instead of ×2).

5. **Heavenly / Earthly Win**: flat 20 from each loser; exits early, ignores all multipliers.

**Instant Kong payouts** — `instantKongPayment()` in `scoring.ts`:

- Open kong (from discard or add-to-pung): 1 point from each other player
- Concealed kong: 2 points from each other player

**Spirit settlement** — `calculateSpiritSettlement()` in `scoring.ts`, called from `game.service.ts` after every hand:

- rawScore per player = (primary_spirit_count × 2) + (secondary_spirit_count × 1) + (spirit_kongs × 10)
- Explosive Spirit (rawScore ≥ 5): `effectiveScore = rawScore × (rawScore − 3)`
- Indomitable Spirit (only one player has spirits): `effectiveScore × 2`
- Zero-sum delta: `scoreDelta[i] = 4 × effectiveScore[i] − totalEffectiveSpirits`

**isGerman** is computed correctly in the engine: `winJings === 0` (no wildcards used in the winning hand).

---

## Part 2 — Persistent Scoring (ELO)

Implemented in `apps/api/src/game/elo.service.ts`.

- **K-factor**: 32 (constant)
- **Method**: pairwise comparison — each player is evaluated against each of the other 3 players (6 pairs total)
- **Formula per player i**:
  ```
  Δi = round( K × Σ_j (actual_ij − expected_ij) )
  expected_ij = 1 / (1 + 10^((rating_j − rating_i) / 400))
  actual_ij   = 1    if placement[i] < placement[j]   (i ranks higher)
              = 0.5  if placement[i] === placement[j]  (tie)
              = 0    otherwise
  ```
- Placement comes from cumulative session scores (higher score = lower placement number = better)
- ELO is updated once per session (all hands combined), not per hand

---

## Part 3 — Mismatches Between Code and Definitive Rules

### GAP-01 — Kong Bloom (Gang Kai) ×4 multiplier: not implemented

**Guide (§2.2):** Kong Bloom is listed as a stackable ×4 win multiplier. "Calculated as Self-Draw ×2 + Kong Bloom ×2."

**Code:** `isAfterKong` is computed (`engine.ts:697`: `this.state.isKongDraw && isTsumo`) and passed into `ScoringContext`, but the field is explicitly documented as `"Informational; not a win multiplier"` (`types.ts:128`). It is never read inside `calculateWinPayout`. Winning on a kong replacement draw currently has no scoring difference from a regular tsumo.

**Impact:** Every gang-bloom win undercharges by a factor of 4 (code pays ×2 for tsumo; guide requires ×4 for gang-bloom).

---

### GAP-02 — Sacking the Dealer (踢庄 / 踢庄): not implemented

**Guide (§1, Instant Payouts):** "If all four players discard the same tile in the first round, the Dealer pays 5 points to each player."

**Code:** No implementation found anywhere in the engine, session layer, or API.

**Impact:** The entire Sacking the Dealer instant payout is absent.

---

### GAP-03 — Heavenly Win + Spirit Fishing = 40 pts: not handled

**Guide (§2.3):** "Heavenly Win: 20 points from every player. (If it is also Spirit Fishing, it is 40 points)."

**Code (`scoring.ts:66–87`):** The Heavenly Win code path is an early-return that always uses flat 20 per loser:

```typescript
if (isHeavenlyWin || isEarthlyWin) {
  const flat = 20;
  // ... returns flat * 3 winner, -flat each loser
}
```

`isSpiritFishing` is never checked inside this branch.

**Impact:** A Spirit-Fishing Heavenly Win pays 20 per loser instead of 40.

---

### GAP-04 — Earthly Win + Spirit Fishing = 40 pts: not handled

**Guide (§2.3):** Same rule as GAP-03 for Earthly Win.

**Code:** Same early-return path as Heavenly Win; `isSpiritFishing` ignored.

**Impact:** A Spirit-Fishing Earthly Win pays 20 per loser instead of 40.

---

### GAP-05 — True German never activates in production

**Guide (§2.4):** True German should apply when the winner holds no Jing and no other player holds any Jing.

**Engine:** `isTrueGerman` is a supported parameter in `declareWin()` and ×4 multiplier is applied when true.

**Code (`game.service.ts:1039`):**

```typescript
session.engine = session.engine.declareWin(winnerSeat, {
  isTrueGerman: false,   // ← hardcoded
  isSpiritFishing: false,
  ...
});
```

`isTrueGerman` is **always false** in the session layer. The check for whether any opponent holds Jing tiles is never performed, so True German never fires in any live game.

---

### GAP-06 — Spirit Fishing never activates in production

**Guide (§2.2):** Spirit Fishing (精钓) is a ×2 multiplier when the player is waiting on a single tile to form a pair while holding a Jing, and wins by self-draw.

**Engine:** `isSpiritFishing` parameter supported; ×2 multiplier applied when true.

**Code (`game.service.ts:1040`):** Hardcoded `false` — same call site as GAP-05. Spirit Fishing never fires in any live game.

---

### GAP-07 — Dealer-as-loser on tsumo: payment not doubled

**Guide (§2.2, Dealer Factor):** "If the Dealer loses, all their payments are doubled (×2)." This applies unconditionally whenever the dealer is a losing payer.

**Code (`scoring.ts:165–170`):**

```typescript
const perLoser = multiplier * 2 + flatBonusPerLoser;
for (let i = 0; i < 4; i++) {
  scoreDelta[i] = i === winnerSeat ? perLoser * 3 : -perLoser;
}
```

All 3 tsumo losers pay the same `perLoser` amount. When the dealer is one of those 3 losers, they pay no more than the non-dealer losers.

**Impact:** Dealer pays ×2 on tsumo loss; guide requires ×4 (×2 tsumo base × ×2 dealer-loss). Each hand where a non-dealer wins by tsumo and the dealer is a loser undercharges the dealer by half.

---

### GAP-08 — Dealer-as-non-discarder-payer on ron: payment not doubled

**Guide (§2.2, Dealer Factor):** Same "dealer loses → all payments doubled" rule applies to side payments on ron.

**Code (`scoring.ts:174–181`):**

```typescript
const isDiscarderDealer = discarder === dealerSeat && !isDealer;
const discarderPays = multiplier * 2 * (isDiscarderDealer ? 2 : 1) + flatBonusPerLoser;
const otherPays = multiplier * 1 + flatBonusPerLoser; // same for ALL non-discarders
```

When the dealer is the discarder their ×4 is computed correctly. But when the dealer is a **non-discarder payer** (third player on ron), they pay `otherPays = multiplier * 1` — the same as any other non-winner — instead of `multiplier * 2` (dealer penalty × non-discarder rate).

**Impact:** In ron where the dealer is not the discarder and not the winner, they underpay by a factor of 2.

---

### GAP-09 — German formula: code adds a ×2 stacking multiplier; guide says flat +5 only

**Guide (§2.4 header):** "These bonuses are **added after multipliers are applied**."
German formula: `Payout = (Base × Multipliers) + 5 points` — no explicit ×2 of its own.

**Code (`scoring.ts:136–139`):**

```typescript
items.push({ name: 'German', multiplier: 2, flatPerLoser: 5 });
multiplier *= 2; // ← adds a ×2 to the multiplier stack
flatBonusPerLoser += 5;
```

German is treated as a stacking ×2 multiplier AND a +5 flat bonus.

**Concrete example — standard tsumo, German:**

- Guide: each loser pays (1 × 2[tsumo]) + 5 = **7**
- Code: each loser pays (1 × 2[German] × 2[tsumo]) + 5 = **9**

---

### GAP-10 — True German formula: potentially over-multiplied

**Guide (§2.4):** `Payout = (Base × Multipliers × 2) + 5` where "Multipliers" is the existing stack excluding German/True German. The "(or Base x4 + 5)" hint in the guide suggests this is a total factor of 4 on the base for a standard hand (Base=1, no other multipliers), not an additional ×4 stacked on top of hand-type multipliers.

**Code:** True German applies `multiplier *= 4` which stacks multiplicatively with hand-type multipliers (Seven Pairs, All Triplets, etc.).

**Example — Seven Pairs + True German tsumo:**

- Guide intent (True German = additional ×2 on whole payout): (2 × 2[True German] × 2[tsumo]) + 5 = **13** per loser
- Code: (1 × 2[Seven Pairs] × 4[True German] × 2[tsumo]) + 5 = **21** per loser

The discrepancy grows with more stacked multipliers.

---

## Summary Table

| #      | Rule                                                                          | Section | Status                                                         |
| ------ | ----------------------------------------------------------------------------- | ------- | -------------------------------------------------------------- |
| GAP-01 | Kong Bloom ×4 multiplier                                                      | §2.2    | Not implemented — `isAfterKong` is informational only          |
| GAP-02 | Sacking the Dealer instant payout                                             | §1      | Not implemented — no code exists                               |
| GAP-03 | Heavenly Win + Spirit Fishing = 40pts                                         | §2.3    | Not implemented — early-return ignores `isSpiritFishing`       |
| GAP-04 | Earthly Win + Spirit Fishing = 40pts                                          | §2.3    | Not implemented — same code path as GAP-03                     |
| GAP-05 | True German activates when no opponent holds Jing                             | §2.4    | Never activates — hardcoded `false` in `game.service.ts`       |
| GAP-06 | Spirit Fishing activates for pair-wait tsumo holding Jing                     | §2.2    | Never activates — hardcoded `false` in `game.service.ts`       |
| GAP-07 | Dealer pays ×2 extra as loser on tsumo                                        | §2.2    | Not implemented — all tsumo losers pay equally                 |
| GAP-08 | Dealer pays ×2 extra as non-discarder payer on ron                            | §2.2    | Not implemented — only dealer-as-discarder is doubled          |
| GAP-09 | German is a flat +5 only, not a ×2 stacking multiplier                        | §2.4    | Over-counts — code applies ×2 AND +5 instead of just +5        |
| GAP-10 | True German is an additional ×2 on total payout, not a ×4 stacking multiplier | §2.4    | Potential over-counts when combined with hand-type multipliers |

---

## What IS Implemented Correctly

- Basic Ping Hu (standard hand): base 1 ✓
- Seven Pairs / All Triplets: base 2 ✓
- Thirteen Misfits: base 2 ✓
- Seven Star Thirteen Misfits: base 4 ✓
- Tsumo structure (all 3 pay ×2) ✓
- Ron structure (discarder ×2, others ×1) ✓
- Dealer win ×2 ✓
- Dealer-as-discarder loss ×4 on ron ✓
- Rob Kong treated as tsumo, konger pays all 3 shares ✓
- Open/Supplement Kong instant payout: 1pt each ✓
- Concealed Kong instant payout: 2pts each ✓
- Spirit settlement: primary ×2, secondary ×1, spirit kong +10 ✓
- Explosive Spirit formula `raw × (raw − 3)` when raw ≥ 5 ✓
- Indomitable Spirit ×2 when only one player holds spirits ✓
- isGerman detection: `winJings === 0` ✓
- Heavenly Win flat 20 each (no Spirit Fishing combo) ✓
- Earthly Win flat 20 each (no Spirit Fishing combo) ✓
- Opening Jing settlement (上下翻精) formula ✓
- ELO pairwise K=32 system ✓
