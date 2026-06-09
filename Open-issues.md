# Open Issues & Improvements

This document consolidates all open bugs, unfixed issues, and pending improvements across the Nanchang Mahjong project.

---

## Currently Open Bugs

### BUG-020 · Last-discard red pulse never visible to end user — ACTIVE

**Symptom:** The most recently discarded tile should display a pulsing red outline during the claim window so players can see which tile is "in play." No red pulse is ever visible during live gameplay regardless of the fix applied.

**Status:** ACTIVE, UNRESOLVED (as of 2026-06-09)

**Root cause:** Unknown. Every plausible rendering, data-flow, and animation layer has been addressed without success.

**Fixes attempted (none worked):**

1. Framer Motion bleed isolation — moved pulse into dedicated overlay div
2. Increased contrast — red outline instead of gold shimmer
3. React 18 batching race fix — added `lastDiscard` to Zustand store
4. Exact tile+seat coordinate match — unambiguous value matching
5. zIndex + shadow visibility fix — added z-index and border fallback
6. Key-based remount to force Framer Motion new mount — key remounts based on pulse state

**Suspected remaining causes:**

- `lastDiscard` in the Zustand store may never be getting set (socket event not received or hook not wired)
- `CombinedDiscardPool2D` may not be the component actually rendered
- Exact tile value mismatch between `lastDiscard.tile` and `discards` array
- `Table2DContext`'s `tileScale` causing overlay to render at 0×0

**Next steps:** Add `console.log` to verify data pipeline before continuing with rendering fixes.

**Location:** Branch `fix/issue-03-05-06-game-polish` (PR #77)

---

### BUG-021 · Hand-reveal meld grouping does not work — ACTIVE

**Symptom:** On the post-hand reveal screen, the winner's concealed hand should be displayed decomposed into constituent melds (chow/pung/kong groups) and pair with labeled headers. Instead the hand appears as a flat row of individual tiles with no grouping.

**Status:** ACTIVE, UNRESOLVED (as of 2026-06-09)

**Root cause:** Unknown. The decomposition logic was implemented but the visual result is unchanged.

**Fix attempted:**

1. Re-exported `decomposeHand` and `Decomposition` from `@nanchang/shared`
2. In `HandRevealScreen`, winner's concealed hand section replaced with decomposition logic
3. Falls back to flat tile list if conditions not met

**Suspected remaining causes:**

- Winner's hand at reveal time may have fewer than 14 tiles (open melds tracked separately)
- Guard `hand.length === 14` may be too strict
- `decomposeHand` may be returning empty array for valid winning hands
- `handReveal.jingPrimary` / `jingSecondary` may be undefined

**Next steps:** Log `hand.length`, decomposition result, and `jingTypes` to verify the data before continuing with rendering.

**Location:** Branch `fix/issue-03-05-06-game-polish` (PR #77)

---

### BUG-08 · Viewer discard tiles not visible in the center of the table — 3D UI

**Symptom:** The viewer's own discard tiles (pile in center-south zone) do not appear visible in the 3D scene.

**Status:** OPEN — deferred to post-merge (Phase 12B or later)

**Suspected cause:** Depth-sorting issue. `MeshBasicMaterial` face stamps use `depthWrite: false` to prevent transparent SVG fragments from z-fighting. When tiles overlap at similar Y heights, Three.js may render some behind felt or other tiles.

**Where to look:**

- `apps/web/src/r3f/components/DiscardPool3D.tsx`
- `apps/web/src/r3f/components/MahjongTile3D.tsx`
- `apps/web/src/r3f/utils/table-layout.ts` — `discardPoses` offset

**Approach:** Try enabling `depthTest: false` on face stamps and/or adding small Y offset per discard row; or sort tiles back-to-front manually.

**Location:** `3D-BUG-LOG.md`

---

### BUG-09 · TileWall3D removed; needs redesign — 3D UI

**Symptom:** The tile wall (remaining draw tiles as rectangular frame) was removed because `Back.svg` has bright-red `fill:#ff3737` background.

**Status:** OPEN — deferred to post-merge

**Fix needed:** Either replace `Back.svg` background with neutral colour (dark grey `#2a2a2a`) or render wall slots as plain `MeshBasicMaterial` boxes instead of textured.

**Current state:** `TileWall3D` component still exists and is fully functional — just not mounted in `GameCanvas.tsx`.

**Reinstate in:** `apps/web/src/r3f/GameCanvas.tsx` — re-add import and `<TileWall3D wallCount={snapshot.wallCount} ... />`.

**Location:** `3D-BUG-LOG.md`

---

### BUG-022 · Player rejoin fails — tile play blocked after reconnection

**Symptom:** When a player leaves the game mid-hand (without conceding) and reconnects by pressing the rejoin button, they can reach the game screen, but when they attempt to play a tile on their turn, the game does not continue. The player is stuck and unable to participate further.

**Status:** ACTIVE, UNRESOLVED (as of 2026-06-09)

**Expected behavior:** A player who leaves without conceding should be able to rejoin, and the game should continue normally.

**Suspected cause:** Likely related to:

- Seat/user mapping not being properly restored on reconnect
- Connection state (`connected` flag in `GameSession`) not being re-established
- Pending discard not being cleared or recognized after reconnect
- Server-side game state not recognizing the reconnected player as active

**Where to look:**

- `apps/api/src/game/game.service.ts` — reconnection handler, seat verification
- `apps/api/src/game/game.gateway.ts` — `game:join` handler, player state recovery
- `apps/web/src/stores/game.store.ts` — reconnection store state
- `apps/web/src/hooks/use-game.ts` — reconnection flow

**Next steps:** Add logs to track seat mapping and connection state during disconnect/reconnect cycle. Verify that server's `seatMap` correctly identifies the reconnected player.

---

### BUG-023 · Invalid phase error on game completion — continue button fails

**Symptom:** After a game completes and the final score screen is shown, if the host (or any player) clicks the "Continue" or "Play Again" button to start a new game, an error pops up saying "invalid phase." All players must exit and create a new room to play again.

**Status:** ACTIVE, UNRESOLVED (as of 2026-06-09)

**Expected behavior:** Players should be able to start a new game (rematch) without backing out to create a new room.

**Suspected cause:** Likely related to:

- Game session not being properly cleared or archived when `finished` phase is reached
- Rematch handler not resetting the engine to a playable `jing_reveal` phase
- Stale `snapshot.phase` value in store preventing new game start
- Missing or incorrect phase transition logic in `game.service.ts`

**Where to look:**

- `apps/api/src/game/game.service.ts` — rematch initiation, phase reset, new game creation
- `apps/api/src/game/game.gateway.ts` — rematch socket event handler
- `apps/web/src/pages/game/game-page.tsx` — rematch button handler, phase checks
- `packages/shared/src/game.events.ts` — rematch event schema/validation

**Next steps:** Log the actual `snapshot.phase` value when rematch button is clicked. Verify that rematch handler properly initializes a new `GameSession` with `engine.deal()` → `jing_reveal` phase.

---

### BUG-024 · Winning player's hand missing the winning tile

**Symptom:** In the end game summary hand reveal, the winning player's concealed hand does not contain the tile they acquired to win. The hand is missing the drawn, pungged, chowed, or konged tile that completed their winning hand.

**Status:** ACTIVE, UNRESOLVED (as of 2026-06-09)

**Expected behavior:** The winner's hand display should include all 14 tiles, including the winning tile.

**Suspected cause:** The winning tile is consumed somewhere before the hand reveal payload is constructed:

- `engine.declareWin()` may be removing the tile from hand before final state is captured
- `toClientSnapshot()` or hand redaction logic may be filtering the winning tile
- `HandRevealPayload` construction doesn't include the winning tile from the draw/claim

**Where to look:**

- `packages/engine/src/game-engine.ts` — `declareWin()` method, final hand state
- `apps/api/src/game/game.service.ts` — `handleHandEnd()`, hand reveal payload construction
- `apps/api/src/game/snapshot.ts` — hand redaction logic
- `apps/web/src/pages/game/game-page.tsx` — `HandRevealScreen` rendering logic

**Next steps:** Log the full hand state from `engine.state.seats[winnerSeat].hand` at the moment `declareWin()` is called. Verify that the winning tile is still present in the engine's final state before constructing `HandRevealPayload`.

---

## Pending Improvements & Features

### Settlement Tile Phase — Consolidate and expand scoring table

**Status:** Planned improvement

**Current issue:** The settlement tile phase displays two separate tables showing +/- points for the 2× and 1× point tiles. This is visually cluttered.

**Desired improvement:**

1. Consolidate into a single table displaying each player's total settlement points (+ or -)
2. Add a dropdown arrow next to each player's name
3. When expanded, show line-item details:
   - "Paid 2 points to Player 1 [tile image]"
   - "Paid 1 point to Player 2 [tile image]"
   - "Received 2 points from Player 3 [tile image]"
4. Use actual tile textures (via `MahjongTile2D`) instead of text labels
5. Use actual player names from the game session

**Implementation notes:**

- Affects `apps/web/src/pages/game/game-page.tsx` (settlement/pre-game flow)
- May require extending `PreGamePayload` from backend to include settlement transaction details
- Design consideration: Animated expand/collapse for each player's detail section

---

### End Game Animation & Mobile UX — Pop-up winner announcement

**Status:** Planned improvement

**Current issue:** The end game screen is too abrupt, especially on mobile. Players immediately see the final score without visual fanfare. Mobile players lose the landscape context.

**Desired improvements:**

1. **Winner pop-up animation:** When the game ends, display an animated pop-up saying "X Player Wins!" (center-screen, temporary)
2. **Mobile landscape persistence:** Mobile players should remain in full-screen landscape mode during end game (don't snap back to portrait)
3. **Two-step end flow:**
   - Step 1: Show winner pop-up animation (2-3 seconds)
   - Step 2: Add "See Final Results" button that transitions to the current end game score screen
4. **Visual polish:** Animate the pop-up with scale/fade-in; play a winning chime sound

**Implementation notes:**

- Affects `apps/web/src/pages/game/game-page.tsx` (GameEndScreen, JingRevealScreen)
- May affect `apps/web/src/r3f/GameCanvas.tsx` (3D table landscape lock)
- Requires animation library (already have Framer Motion)
- Sound effect already implemented in `useSound` hook (Phase 11)
- Mobile landscape lock: may require CSS transform on game container or explicit viewport handling

---

### Auth UX — Password autofill removal and visibility toggle

**Status:** Planned improvement

**Current issue:** Username and password text boxes autofill with "temp" placeholder text. Users cannot easily verify what they typed/are typing without a password visibility toggle.

**Desired improvements:**

1. **Remove autofill:** Delete "temp" default text from username and password input fields
2. **Password visibility toggle:** Add an eye icon button next to password field to toggle between hidden (•••) and visible text
3. **User verification:** Users can verify their input before submitting, reducing login errors

**Implementation notes:**

- Affects `apps/web/src/pages/auth/` (signup, login screens)
- Add state for `showPassword` boolean in auth form components
- Toggle handler: `onChange={() => setShowPassword(!showPassword)}`
- Eye icon can use existing icon library
- Test on mobile (touch-friendly icon size)

---

### Phase 12B · Push Frontend + A11y — IN PROGRESS

**Status:** Planning/Early implementation

**Features:**

- `public/sw.js` service worker — `push`, `notificationclick`, `pushsubscriptionchange` handlers
- `usePushNotifications` hook — SW registration, VAPID key fetch, permission flow, pushManager subscribe/unsubscribe
- Push notification toggle in Home settings section
- `prefers-reduced-motion` global CSS rule in `index.css`
- A11y tests: `A11y·tile-aria` + `A11y·reduced-motion`

**Notes:** Phase 12A (Push Backend, PR #26) is merged; Phase 12B frontend work is next.

---

### Phase 13 · Production Deploy & Hardening — DEFERRED

**Status:** Deferred (after Phase 12B)

**Scope:**

- CDK deploys S3+CloudFront, App Runner, DynamoDB, Cognito, SES, WAF
- GitHub Actions deploy job on `main`
- Sentry + CloudWatch dashboards
- Backup: DynamoDB point-in-time recovery
- Cost alarm at $50/mo
- Smoke-test playbook (Playwright suite against prod)

---

### Phase 14 · Mobile-First Forced Landscape Overhaul — PLANNING

**Status:** Planning only

**Problem:** Current 2.5D game table (CSS Grid) designed for 800×600 desktop; collapses on portrait phones (375×812).

**Solution:** Forced landscape layout — CSS-rotate game table 90° on portrait mobile, preserving horizontal tile density.

**Activation:** Only when `window.innerWidth < 600px` AND `window.innerWidth < window.innerHeight`.

**Scope:**

- `GameTable2D` dispatcher: routes to `DesktopGameTable2D` or `MobileGameTable2D`
- `MobileGameTable2D` — absolute positioning, no CSS Grid
- `useOrientation` hook for orientation detection
- New mobile-specific layout with StatusBar, badges, discard pool, hand, claim drawer

**Branch convention:** `feat/phase-14A`, `feat/phase-14B`, `feat/phase-14C`

---

### Bot System Implementation — IN PROGRESS

**Status:** Active development

**Scope:**

- Two difficulty levels: Easy (random moves) and Normal (heuristic-driven)
- No WebSocket connections for bots — backend triggers via delay + engine function
- Reserved bot user IDs: `bot-easy-1`, `bot-normal-2`, etc.

**Architecture:**

- Logic isolation: `packages/engine/src/bot/bot-engine.ts`
- Backend integration: `apps/api/src/game/game-session.ts` recognizes bot turns
- Human simulation: 1-3 second random delay on every action
- Difficulty algorithms:
  - **Easy:** Legal mostly-random moves; avoids throwing winning hand
  - **Normal:** Greedy heuristic; discards isolated/useless tiles; claims strategically

**Implementation phases:**

- Phase 1: Shared schema updates (`packages/shared`)
- Phase 2: Engine bot logic (`packages/engine`)
- Phase 3: Backend integration (`apps/api`)
- Phase 4: Frontend UI updates (`apps/web`)

---

### Tournaments / Seasons — SOON

**Status:** Planned for near-term development

**Scope:** Ranked gameplay with seasonal/tournament structure

---

### Emoji System In-Game — FUTURE

**Status:** Planned post-MVP feature

**Scope:** Add emoji reactions/emotes for player communication during gameplay

**Notes:** Alternative to text chat; lower complexity, no moderation overhead
