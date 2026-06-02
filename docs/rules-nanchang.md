# Nanchang Mahjong — Rules Reference

> **Status**: Drafted from public sources (Phase 5). **Review this document before the engine is locked in.**
> Correct any rules that differ from your family's actual play.

---

## 1. Overview

Nanchang Mahjong (南昌麻将) is a four-player tile game from Nanchang, Jiangxi province, China. It shares the foundation of Chinese Standard Mahjong but adds a wildcard mechanism called the **Jing (经)** tile that distinguishes it from most other regional variants.

---

## 2. Equipment

### 2.1 Tile Set (136 tiles)

| Category            | Tiles                         | Count   |
| ------------------- | ----------------------------- | ------- |
| Characters (万/man) | 1–9 × 4                       | 36      |
| Circles (饼/pin)    | 1–9 × 4                       | 36      |
| Bamboo (条/sou)     | 1–9 × 4                       | 36      |
| Winds (风)          | East/South/West/North × 4     | 16      |
| Dragons (箭/arrow)  | Zhong 中 / Fa 发 / Bai 白 × 4 | 12      |
| **Total**           |                               | **136** |

Flower/season tiles are **not used** in Nanchang Mahjong.

---

## 3. Setup

### 3.1 Seating

Players are assigned seat winds by any agreed method (dice roll, draw, convention). The four seat winds rotate each round:

- **East (东)** — dealer; always draws first and starts with 14 tiles.
- **South (南)**, **West (西)**, **North (北)** — each starts with 13 tiles.

### 3.2 The Wall and Deal

1. Tiles are shuffled face-down and arranged into four sides of a square wall (34 tiles per side).
2. Each player draws 13 tiles; East draws one extra (14 total).
3. **Four tiles are set aside as the dead wall** before the deal (used for the Jing indicator and Kong replacements).

### 3.3 Jing (经) Wildcard Determination

1. The East player draws the **top tile** from the dead wall and places it face-up — this is the **indicator**.
2. The **Jing tile** is the tile **one rank above** the indicator in the same category:
   - Suit tiles: 1→2, 2→3, … 8→9, **9→1** (wraps around within the same suit).
   - Winds: East→South, South→West, West→North, **North→East** (wraps).
   - Dragons: Zhong→Fa, Fa→Bai, **Bai→Zhong** (wraps).
3. All four copies of the Jing tile become **wildcards** for this game.
4. Example: indicator is 3-Bamboo → Jing is **4-Bamboo**; all four 4-Bamboo tiles are wildcards.

### 3.4 Jing (Wildcard) Rules

- A Jing tile **substitutes for any tile** to complete a meld (Chow, Pung, or Kong).
- **The pair (eyes) must use at least one natural tile.** A pure wildcard pair (Jing × Jing) is only allowed in the Seven Pairs special hand.
- **Each meld must contain at least one natural tile.** You cannot use three or four Jing tiles alone to form a meld.
- A **concealed Kong of four Jing tiles** (四经) is a valid special meld and earns bonus fans.

---

## 4. Gameplay

### 4.1 Turn Order

Play proceeds counter-clockwise (East → North → West → South → East…).

On their turn a player either:

- **Draws** the next tile from the live wall, then **discards** one tile face-up.
- **Claims** an opponent's discard (see §4.2), then discards one tile.

### 4.2 Claiming a Discard

When a tile is discarded, players may claim it — **before the next player draws** — for:

| Claim              | Eligibility                                                     | Priority |
| ------------------ | --------------------------------------------------------------- | -------- |
| **Win (胡 Hú)**    | Anyone whose hand is completed by the discard                   | Highest  |
| **Kong (杠 Gàng)** | Any player with three matching tiles (natural or Jing-assisted) | 2nd      |
| **Pung (碰 Pèng)** | Any player with two matching tiles (can use one Jing)           | 3rd      |
| **Chow (吃 Chī)**  | Only the player **immediately after** the discarder             | Lowest   |

Priority is strictly **Win > Kong > Pung > Chow**. If two players both claim Win simultaneously, the player closest to the discarder in turn order wins; ties are split (if house rules allow draws, otherwise the player with the higher fan hand wins).

### 4.3 Melding and Declaring a Kong

After claiming a discard to form a Pung or Kong (or declaring a concealed Kong on your draw turn), the claimed tiles are placed face-up in front of you (**open meld**). Concealed Kongs are placed face-down with the outer two tiles face-up.

After any Kong, the player **draws a replacement tile** from the dead wall.

**Adding to a Kong (加杠)**: If you have an open Pung and draw (or hold) the fourth matching tile, you may extend it to a Kong on your turn. Any player holding a winning hand that includes that tile may immediately declare **Rob Kong (抢杠 Qiāng Gàng)** to win.

### 4.4 Winning

A hand wins when it forms one of the following valid hand shapes:

#### 4.4.1 Standard Hand (4 melds + 1 pair)

- **4 × meld**: each meld is a Chow, Pung, or Kong (4-tile Kong counts as one meld).
- **1 × pair (将/eyes)**: two identical tiles (at least one must be natural).
- Total tiles consumed: 14 (or more if Kongs replace Pungs).

#### 4.4.2 Seven Pairs (七对子 Qī Duì Zǐ)

- Exactly 7 pairs in the 14-tile hand.
- Each pair must have **at least one natural tile** (one Jing per pair is allowed; a pure Jing × Jing pair counts as one allowed wildcard pair — maximum one per hand).

#### 4.4.3 Draw

If the live wall is exhausted without any player winning, the round ends in a **draw (流局)**. The dealer retains their seat; all other players rotate.

---

## 5. Scoring

### 5.1 Fan (番) System

The winning hand's **fan count** determines the payment size. Fans from different categories are **added together**.

#### 5.1.1 Situational Fans (added based on how the win occurred)

| Fan | Name              | Condition                                             |
| --- | ----------------- | ----------------------------------------------------- |
| +1  | 自摸 Zìmō         | Self-draw win (draw the winning tile from wall)       |
| +1  | 门清 Méng Qīng    | Fully concealed hand winning off a discard            |
| +1  | 海底捞月 Hǎidǐ    | Win on the very last tile drawn from the wall         |
| +1  | 杠上花 Gàng Shàng | Win on the replacement draw after a Kong              |
| +1  | 抢杠 Qiāng Gàng   | Win by Rob Kong (claiming opponent's added Kong tile) |

#### 5.1.2 Hand Composition Fans

| Fan | Name                | Condition                                                                              |
| --- | ------------------- | -------------------------------------------------------------------------------------- |
| +1  | 断幺 Duàn Yāo       | No terminal (1 or 9) or honor tiles in the hand                                        |
| +2  | 对对胡 Duì Duì Hú   | All Pungs (and/or Kongs); no Chows                                                     |
| +2  | 混一色 Hùn Yī Sè    | All tiles from one suit **plus** honor tiles                                           |
| +2  | 七对子 Qī Duì Zǐ    | Seven Pairs special hand                                                               |
| +3  | 龙七对 Lóng Qī Duì  | Seven Pairs with one Dragon-Pair (same tile × 4)                                       |
| +4  | 清一色 Qīng Yī Sè   | All tiles from one suit, no honors                                                     |
| +4  | 全带幺 Quán Dài Yāo | Every meld and pair contains at least one terminal or honor                            |
| +4  | 小四喜 Xiǎo Sì Xǐ   | Three Wind Pungs + Wind pair                                                           |
| +5  | 三元刻 Sān Yuán Kè  | All three Dragon types as Pungs/Kongs                                                  |
| +8  | 大四喜 Dà Sì Xǐ     | All four Wind types as Pungs/Kongs                                                     |
| +13 | 十三幺 Shísān Yāo   | Thirteen Orphans (one each of 1m 9m 1p 9p 1s 9s + 4 winds + 3 dragons + any duplicate) |

#### 5.1.3 Jing (Wildcard) Fans

| Fan       | Name         | Condition                                                |
| --------- | ------------ | -------------------------------------------------------- |
| +1        | 净胡 Jìng Hú | Won with **zero** Jing tiles in the hand (a "clean" win) |
| +1 (each) | 暗杠 Àn Gāng | Each concealed Kong in the hand                          |
| +3        | 四经 Sì Jīng | Concealed Kong of all four Jing (wildcard) tiles         |

#### 5.1.4 Fan Floor

A winning hand must have at least **1 fan** to be valid. A hand that calculates to 0 fans (e.g., a simple Ping Hu with no bonuses) still wins but pays at the 1-fan rate.

### 5.2 Payment

Payments are in whole units. Fan-to-units mapping:

| Fan | Units per payer |
| --- | --------------- |
| 1   | 1               |
| 2   | 2               |
| 3   | 4               |
| 4   | 8               |
| 5   | 16              |
| n   | 2^(n−1)         |

Capped at **64 units** (6 fan) for a single payment — any hand ≥ 6 fan pays at 64 units. (House rules may remove the cap.)

#### Ron (胡别人的牌 — win off discard)

- **Discarder pays** the full units.
- Other two players pay **nothing**.

#### Tsumo (自摸 — self-draw win)

- **All three players** each pay the full units.
- Dealer tsumo: each player pays the dealer's full units (no special doubling in this variant).

### 5.3 Dealer Rotation

- If **East wins or the round draws**: East **retains** dealer status (保庄); no rotation.
- Otherwise: dealer passes counter-clockwise.

---

## 6. Tile Glossary

| Term         | Hanzi | Meaning                                  |
| ------------ | ----- | ---------------------------------------- |
| Man          | 万    | Characters suit (1–9)                    |
| Pin          | 饼    | Circles suit (1–9)                       |
| Sou          | 条    | Bamboo suit (1–9)                        |
| Jing / 经    | 经    | Wildcard tile for this game              |
| Chow / 吃    | 吃    | Sequence of 3 in the same suit           |
| Pung / 碰    | 碰    | Triplet of 3 identical tiles             |
| Kong / 杠    | 杠    | Quadruplet of 4 identical tiles          |
| Tsumo / 自摸 | 自摸  | Self-draw win                            |
| Ron / 胡     | 胡    | Win off another's discard                |
| Shanten      | —     | Number of tiles away from a winning hand |

---

## 7. Open Questions for Family Review

> Please correct any of these before the engine is finalized:

1. **Jing determination**: Is it "the tile one above the indicator" (as written here) or "the indicator tile itself"?
2. **Wildcard pair**: Is a Jing × Jing pair allowed in standard hands (not just Seven Pairs)?
3. **Chow direction**: Is Chow restricted to the player immediately left of the discarder only (standard), or can any player Chow?
4. **Payment cap**: Is there a fan cap (e.g., max 6 fan) or is the payment uncapped?
5. **Dealer retention**: Does the dealer retain seat on any win (even if a non-dealer wins), or only on dealer win?
6. **Thirteen Orphans**: Is this special hand played in your family's variant?
7. **Scoring base**: Is the base unit 1 or a different starting value (some families start at 2 or 5)?
