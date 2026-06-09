# Bot System Implementation Plan - Nanchang Mahjong

## Overview

This document outlines the architecture and implementation steps for adding AI opponents to Nanchang Mahjong. Bots will operate in two difficulties (Easy and Normal), simulate human decision times (1-3 seconds), and integrate seamlessly into the existing multiplayer architecture without requiring dedicated WebSocket connections.

## 1. Architectural Strategy

Bots should act as "virtual players." They do not need WebSocket connections. Instead, the backend `GameSession` class will recognize when it is a bot's turn (or when a bot needs to react to a discard) and trigger an internal asynchronous loop.

- **Logic Isolation:** All bot decision-making logic (what to discard, whether to claim) must live in `packages/engine/src/bot/`. This keeps the engine easily testable and pure.
- **State Integration:** The NestJS backend (`apps/api/src/game/game-session.ts`) will handle the 1-3 second delay and invoke the bot engine.
- **Identity:** Bots will use reserved user IDs (e.g., `bot-easy-1`, `bot-normal-2`) and bypass standard authentication checks in the room.

---

## 2. Difficulty Algorithms & Logic (`packages/engine`)

Create a new module `packages/engine/src/bot/bot-engine.ts`.

### Human Simulation (The Delay)

All bot actions in the backend must be wrapped in a randomized timeout to prevent instant plays, which break the flow and feel unnatural.

- **Delay Formula:** `Math.floor(Math.random() * 2000) + 1000` (Yields 1000ms to 3000ms).

### "Easy" Difficulty

The Easy bot makes legal, mostly random moves, but avoids completely game-breaking stupidity (like throwing away a winning hand).

- **Discarding:**
  - Identify all playable tiles in hand (exclude Jing/Wildcards unless forced).
  - Randomly select one non-Jing tile to discard.
- **Claiming (Chow/Pung/Kong):**
  - If the claim results in a `Win` (Hu), **always** claim.
  - For Chow/Pung/Kong: 30% chance to claim if valid. If it decides to claim, randomly select which combination to use if multiple exist.

### "Normal" Difficulty

The Normal bot uses a heuristic "greedy" approach. It doesn't calculate deep game-tree Shanten (tiles to win), but it logically groups its hand and discards isolated useless tiles.

- **Discarding Priority (Lowest to Highest value):**
  1.  Isolated Winds/Dragons (Honors with 0 matches).
  2.  Isolated Terminals (1s and 9s with no adjacent tiles).
  3.  Isolated Simples (2-8 with no adjacent tiles).
  4.  Partials (e.g., holding a 1 and 2, but missing the 3).
  5.  Completed Melds / Pairs.
  6.  Jing (Wildcards) - NEVER discard unless literally forced by having only Jing left.
      _Algorithm:_ The engine will scan the hand, score each tile based on its utility (is it part of a pair? a sequence?), and discard the lowest-scoring tile.
- **Claiming (Chow/Pung/Kong):**
  - If `Win` (Hu), **always** claim.
  - If `Kong`, **always** claim (extra points/draw).
  - If `Pung`, **always** claim if it uses Honor/Terminal tiles. 50% chance for Simples.
  - If `Chow`, only claim if the hand has 2 or fewer open melds (avoids exposing the whole hand early unless necessary).

---

## 3. Implementation Steps

### Phase 1: Shared Schema & Types (`packages/shared`)

1.  **Update `Room` Schema:** Add support for bot configurations.
    - Update `CreateRoomDto` to accept `bots: { count: number, difficulty: 'easy' | 'normal' }`.
    - Update the Room state payload so the frontend knows which seats are occupied by bots.
2.  **Bot User Mocking:** Ensure the `User` schema or `Seat` schema can gracefully handle a `bot` flag or specific ID format (`bot-<uuid>`) so the frontend can render default avatars and names like "Bot 1 (Easy)".

### Phase 2: Engine Bot Logic (`packages/engine`)

1.  Create `bot-engine.ts`.
2.  Implement `getBotDiscard(hand: Tile[], wildcards: Tile[], difficulty: 'easy' | 'normal'): Tile`.
3.  Implement `getBotClaim(claimsAvailable: Claim[], hand: Tile[], difficulty: 'easy' | 'normal'): Claim | null`.

### Phase 3: Backend Integration (`apps/api`)

1.  **Room Creation (`rooms.service.ts`):** When a host adds bots, automatically populate the empty seats with mock bot profiles.
2.  **Game Session Loop (`game-session.ts`):** \* Modify the start of a turn (`nextTurn` or similar method). Check if `this.seats[currentTurn].isBot`.
    - If true, trigger an asynchronous function: `handleBotTurn(seatIndex)`.
    - `handleBotTurn` -> wait 1-3 seconds -> call `getBotDiscard` -> execute standard discard pipeline.
3.  **Claim Resolution (`claim-resolver.ts` / `game-session.ts`):**
    - When a human or bot discards, the engine checks for valid claims (Pung/Chow).
    - If a bot is eligible to claim, trigger `handleBotReaction(seatIndex)`.
    - Wait 1-3 seconds -> call `getBotClaim` -> register the bot's intent (either `Pass` or `Claim`).
    - _Crucial:_ Ensure the bot's reaction delay does not block human players from reacting. Use Promise.all or independent timeouts that resolve the claim phase when all players (human and bot) have responded.

### Phase 4: Frontend UI (`apps/web`)

1.  **Lobby/Room Screen:** Update the Game Creation modal to include a "Add Bots" selector (Count: 0-3, Difficulty: Easy/Normal).
2.  **Table UI:** Update player badges (`OpponentBadge2D.tsx` / `OpponentBadge3D.tsx`) to recognize bot IDs and display a robot icon or distinct "Bot (Easy)" nameplate.

## 4. Edge Cases to Handle

- **Host Disconnects:** If humans leave and only bots remain, the room should immediately close/terminate to save server resources.
- **Timeouts during Claim Phase:** The existing claim timer (e.g., 10 seconds for humans to react) must account for the bot's 1-3 second delay. Bots should always register their pass/claim before the global claim timer expires.
- **Wildcard Transformation:** Rely on the recent engine fix (PR #69) to ensure bots do not mistakenly use wildcards in Chows/Pungs, but leverage them purely mathematically or for wins.
