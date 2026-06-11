# Game Setup Configuration — Plain English Guide

Everything you can configure when creating a room, plus the fixed rules and scoring mechanics that run automatically during play. Written for a player who knows Mahjong but hasn't read the source code.

---

## Part 1 — Room Settings (Host-Configurable)

These are the eight settings the host controls before starting a game.

---

### 1. Rounds

**Options:** East only · East + South (default)

This controls how long the game session lasts — measured in "rounds", which are groups of hands.

- A **round** is one full rotation of the dealer seat. There are 4 players, so one round = 4 hands (one hand per player being dealer).
- **East only** = 4 hands total, then the session ends and scores are settled.
- **East + South** = 8 hands total (East round first, then South round), then settle.

> This setting only matters when Termination Type is set to "Rounds". In Bust mode it's ignored.

---

### 2. Termination Type

**Options:** Rounds · Bust (default: Rounds)

Controls _when_ the session ends.

- **Rounds** — play the full number of hands set above (4 or 8), then the game ends regardless of scores.
- **Bust** — play until _any player's cumulative score drops below zero_. The moment that happens, the session ends immediately and scores are settled.

> Bust mode is typically paired with a Starting Score above zero (e.g. 20) so players don't bust in the first hand.

---

### 3. Starting Score

**Range:** 0 to 1000 (default: 0)

Each player starts the session with this many points. Points are added or subtracted throughout the session (win payouts, spirit settlements) and the final cumulative score is what matters at the end.

- **0** — pure zero-sum mode. Scores go negative freely. The numbers at the end are how much each player is up or down relative to everyone else.
- **20+** — useful with Bust mode. Gives everyone a cushion before they can hit zero. A starting score of 20 means a player needs to lose 21 points before busting.

---

### 4. Minimum Fan (minFan)

**Range:** 1 to 8 (default: 1, currently not enforced)

In many Mahjong variants you need to score a minimum number of "fan" (points / value) before you're allowed to declare a win. Fan is essentially a measure of how valuable or difficult your winning hand is.

- **1 fan** = any legal winning hand is accepted. This is the current Nanchang setting and effectively means no minimum at all.
- **2+ fan** = reserved for future rule variants where weak hands would be rejected. Not currently enforced by the engine.

> For this family app, fan minimum is always 1 — you don't need to worry about it. It's stored in case a stricter rule mode is added later.

---

### 5. View Mode

**Options:** 2D · 3D (default: 2D)

Simply controls which visual renderer draws the game table.

- **2D** — the standard flat table layout.
- **3D (WIP)** — an experimental three-dimensional table view. Labelled WIP because it's still being polished. The actual game rules and logic are identical either way.

---

### 6. Turn Timer (timerSecs)

**Range:** 5 to 60 seconds (default: 30, currently not enforced)

How long a player has to make their discard on their turn before an automatic action kicks in.

> This setting is stored but **not currently active**. No player is ever auto-discarded right now. It's there so the feature can be turned on later without changing the data format.

---

### 7. Claim Window

**Options:** 5s · 8s · 15s · 30s · Unlimited (default: 8 seconds)

After a player discards a tile, all other players have this many seconds to decide whether they want to claim that tile (Pung, Kong, Chow, or win on it). Once the window closes, the highest-priority valid claim wins.

- **0 (Unlimited)** — the window only closes when every eligible player has explicitly responded or passed. Nobody gets cut off by a timer.
- **5–30 seconds** — a countdown. If you don't respond in time, you automatically pass.

**Claim priority when multiple players want the same tile:** Win > Kong / Pung > Chow.

---

### 8. Opening Top & Bottom Spirit Flip (开局上下翻精)

**Options:** Off (default) · On

This is an optional variant rule that adds an extra payout event at the very start of each hand, before any play begins.

**Standard (Off):** After dealing, the dealer rolls dice to find a specific tile in the wall. That tile is flipped face-up and becomes the **Spirit (Jing / 精) indicator** — see Part 2 for how Spirit tiles work.

**With this rule On:** The dice procedure is the same, but instead of revealing one tile it reveals two tiles and does something more elaborate:

1. The **top** tile of the selected stack is flipped — this becomes the **Settlement Tile**.
2. Players who received the Settlement Tile in their dealt hand immediately collect **2 points from each other player** per copy they hold.
3. The Settlement Tile is then swapped with the tile below it.
4. The **bottom** tile (now on top after the swap) becomes the Spirit indicator for the rest of the hand.
5. Both tiles stay in the wall and get drawn normally — they aren't removed.

So with this rule enabled, every hand starts with an instant payout event before anyone picks up or discards anything.

---

## Part 2 — Fixed Rules (Not Configurable)

These things happen the same way every game. You don't set them; the engine handles them automatically.

---

### The Tile Set

136 tiles total: 34 unique types, 4 copies of each.

| Group                 | Tiles                                            |
| --------------------- | ------------------------------------------------ |
| Characters (万 / Man) | 1m through 9m                                    |
| Circles (饼 / Pin)    | 1p through 9p                                    |
| Bamboo (条 / Sou)     | 1s through 9s                                    |
| Winds                 | East, South, West, North                         |
| Dragons               | Zhong (中, red), Fa (发, green), Bai (白, blank) |

No flower tiles or season tiles in Nanchang Mahjong.

---

### The Wall

136 tiles are shuffled and stacked into 68 stacks of 2 tiles each, arranged as 4 side-walls (17 stacks per side, one per player's side of the table). Together they form a closed rectangle.

The dealer rolls dice to pick a starting point on the wall. Tiles are drawn forward from that point. Kong replacement tiles come from the _back_ end of the remaining wall.

---

### Dealer Rotation

- **Seat 0** is always the first dealer.
- When a dealer wins a hand, **they deal again** (dealer doesn't rotate on a dealer win).
- When a non-dealer wins (or the hand is drawn), the deal passes clockwise to the next seat.
- After all 4 players have been dealer once, the **round** advances (East → South → West → North) and the deal returns to Seat 0.

---

### Round Wind and Seat Winds

The **round wind** starts at East and advances after each full dealer rotation. It's mostly relevant for the seat wind display (the compass labels at each seat).

**Seat winds** per hand:

- Seat 0 (current dealer) = East
- Seat 1 = South
- Seat 2 = West
- Seat 3 = North

These rotate relative to who the dealer is, so every player experiences every wind during the session.

---

### Spirit Tiles (精 / Jing)

Spirit tiles are this game's wildcard system. They're determined fresh at the start of every hand by the dice roll.

**Two types of spirit tiles are revealed each hand:**

- **Primary Spirit (jingPrimary)** — the indicator tile itself. All 4 copies of this tile type are wildcards.
- **Secondary Spirit (jingSecondary)** — the tile one rank above the primary in the same suit or group. All 4 copies of _this_ tile type are also wildcards, but worth less in Spirit Settlement.

**"One rank above" wraps around:**

- 3m → 4m, 9m → 1m (wraps within the same suit)
- North wind → East wind (winds wrap as a group)
- Bai (white dragon) → Zhong (red dragon) (dragons wrap as a group)

**How wildcards work in melds:**
Spirit tiles can substitute for any tile in a Chow (sequence), Pung (triplet), or Pair. They cannot be used to form a Kong by themselves — a Spirit Kong is when you hold 4 copies of an actual Spirit tile type and declare it as a real Kong.

**What Spirit tiles cannot do:**

- You cannot discard a Spirit tile to win (Ron). If your winning tile is a Spirit, you must self-draw it (Tsumo).
- Once a Spirit tile is discarded, it loses wildcard status and is just a regular tile for other players to claim.

---

## Part 3 — Winning Hand Types

A hand is valid when it matches one of these shapes. The hand type determines your scoring multiplier.

---

### Standard (标准胡) — ×1

4 melds + 1 pair.

A **meld** is one of:

- **Chow (顺子)** — 3 consecutive tiles of the same suit (e.g. 3m-4m-5m). Cannot be formed with wind or dragon tiles.
- **Pung (刻子)** — 3 identical tiles.
- **Kong (杠)** — 4 identical tiles. Declares immediately when you have all 4. You draw a replacement tile from the back of the wall.

The **pair** is 2 identical tiles.

---

### Seven Pairs (七对子) — ×2

Exactly 7 pairs in a fully concealed hand (no open melds). No repeats — each pair must be a different tile type.

---

### All Triplets / Big Seven Pairs (大七对) — ×2

4 Pungs or Kongs + 1 pair. All melds are triplets or quads — no Chows allowed. Must be fully concealed.

---

### Thirteen Misfits (十三烂) — ×2

A hand containing: one of each of the 7 unique honor tiles (all 4 winds + all 3 dragons), plus tiles from a single suit where no two tiles are within 2 ranks of each other (e.g. 1, 4, 7). Must be fully concealed.

---

### Seven Star Thirteen Misfits (七星十三烂) — ×4

The rarest hand. Same as Thirteen Misfits but the 7 honor tiles must be all 7 _unique_ honor types (East, South, West, North, Zhong, Fa, Bai). Must be fully concealed.

---

## Part 4 — Scoring System

All scoring uses a **Base × Multipliers** model. Start at 1 point, then multiply by each applicable factor.

---

### Win Payout (paid when someone wins a hand)

**Base:** 1 point.

**Step 1 — Apply hand type multiplier** (if not a standard hand):

| Hand Type                   | Multiplier     |
| --------------------------- | -------------- |
| Standard                    | ×1 (no change) |
| Seven Pairs                 | ×2             |
| All Triplets                | ×2             |
| Thirteen Misfits            | ×2             |
| Seven Star Thirteen Misfits | ×4             |

**Step 2 — Apply any special win multipliers** (stack on top of each other):

| Special Win                                                                             | Multiplier | Extra                   |
| --------------------------------------------------------------------------------------- | ---------- | ----------------------- |
| **German (德国)** — won without using any Spirit wildcards                              | ×2         | +5 flat bonus per loser |
| **True German (德中德)** — German win AND no other player holds any Spirit tiles        | ×4         | +5 flat bonus per loser |
| **Spirit Fishing (精钓)** — won via self-draw while waiting on a pair with 4 open melds | ×2         | —                       |
| **Dealer win** — the current dealer wins the hand                                       | ×2         | —                       |

**Step 3 — Determine who pays what:**

| Win Type                                                              | Who Pays                                                                            |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Tsumo (自摸)** — self-draw win                                      | Each of the 3 other players pays (base × total multiplier) × **2**                  |
| **Ron (胡)** — discard win                                            | Discarder pays (base × total multiplier) × **2** · Other 2 players each pay × **1** |
| **Rob Kong (抢杠)** — you win on a tile someone added to an open Pung | Treated like Tsumo; only the Kong player pays all 3 shares                          |

**Extra dealer penalty on Ron:** If the discarder _is_ the current dealer (but the _winner_ isn't), the dealer pays double their share.

---

### Instant Payouts (happen immediately when declared, separate from win)

These trigger during play, not at hand end:

| Event                                                                                      | Payout                                           |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Declare an Open or Supplement Kong                                                         | 1 point from each other player (3 points total)  |
| Declare a Concealed Kong                                                                   | 2 points from each other player (6 points total) |
| Sacking the Dealer (抄庄) — all 4 players discard the exact same tile in the opening round | Dealer pays 5 points to every other player       |

---

### Special Instant Wins (flat payout, overrides all multipliers)

| Event                                                                                                     | Payout                                      |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Heavenly Win (天胡)** — dealer wins on their initial 14-tile hand before making any discard             | 20 points from each other player (60 total) |
| **Earthly Win (地胡)** — a non-dealer wins on the very first discard of the hand, before anyone has drawn | 20 points from each other player (60 total) |

---

### Spirit Settlement (happens at the end of every hand, win or lose)

After every hand — whether someone won or the hand was drawn — all players settle based on how many Spirit tiles they were holding (in hand or in open melds).

**Step 1 — Calculate your raw Spirit score:**

| Tiles You Hold                                       | Raw Points    |
| ---------------------------------------------------- | ------------- |
| Each copy of a **Primary Spirit** tile               | +2 pts        |
| Each copy of a **Secondary Spirit** tile             | +1 pt         |
| A **Spirit Kong** (Kong made of 4 spirit-type tiles) | +10 pts bonus |

_Example: you hold 2 primary spirits + 1 secondary = 2×2 + 1×1 = 5 raw points._

**Step 2 — Explosive Spirit multiplier (冲关):**

If your raw score is **5 or more**, it explodes:

> Effective score = raw × (raw − 3)

| Raw | Effective       |
| --- | --------------- |
| 1   | 1               |
| 2   | 2               |
| 3   | 3               |
| 4   | 4               |
| 5   | 5 × 2 = **10**  |
| 6   | 6 × 3 = **18**  |
| 7   | 7 × 4 = **28**  |
| 8   | 8 × 5 = **40**  |
| 10  | 10 × 7 = **70** |

**Step 3 — Indomitable Spirit bonus (霸王精):**

If only **one player** holds any Spirit tiles at all, their effective score is **doubled again**.

**Step 4 — Zero-sum payout:**

Each player's score change = (4 × their effective score) − (total effective spirits across all players).

This formula is guaranteed zero-sum: the 4 deltas always add up to zero, so the group neither gains nor loses points collectively — it's pure redistribution.

_Example: you have 18 effective, everyone else has 0._

- Your delta = (4 × 18) − 18 = +54
- Each other player's delta = (4 × 0) − 18 = −18
- Check: 54 + (−18 × 3) = 54 − 54 = 0 ✓

---

## Quick Reference Table

| Setting             | Default      | Range / Options   | Enforced Now? |
| ------------------- | ------------ | ----------------- | ------------- |
| Rounds              | East + South | East · East+South | Yes           |
| Termination Type    | Rounds       | Rounds · Bust     | Yes           |
| Starting Score      | 0            | 0 – 1000          | Yes           |
| Minimum Fan         | 1            | 1 – 8             | No (reserved) |
| View Mode           | 2D           | 2D · 3D           | Yes           |
| Turn Timer          | 30 s         | 5 – 60 s          | No (reserved) |
| Claim Window        | 8 s          | 0 (∞) – 60 s      | Yes           |
| Opening Spirit Flip | Off          | Off · On          | Yes           |
