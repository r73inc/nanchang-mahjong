# Phase 14 — Mobile-First Forced Landscape Overhaul

**Status:** Planning  
**Scope:** `apps/web` only — engine and API are untouched.  
**Branch convention:** `feat/phase-14A`, `feat/phase-14B`, `feat/phase-14C`

---

## 1. Problem Statement

The current 2.5D game table (`GameTable2D`) uses a rigid CSS Grid (`22% / 1fr / 22%`)
designed around an 800 × 600 desktop canvas. On a portrait phone (375 × 812 px):

- The left/right seat columns are only ~82 px wide. Their tiles are rendered with a
  `rotateZ(±90°)` transform, so their visual width equals the **height** of the center
  row — which collapses to near-zero after the status bar and viewer hand consume most
  of the vertical budget.
- The `CombinedDiscardPool2D` is positioned `top:50%; left:50%` relative to the center
  grid cell. If that cell collapses, the entire pool is clipped to invisible.
- Opponent face-down tiles (13 × `xs` = 28 × 38 px each) cannot meaningfully render in
  a near-zero-height strip.

Mahjong has **14 tiles per player** — extremely high horizontal information density.
A portrait layout is a structural dead end. The chosen solution is a **forced
landscape** approach: CSS-rotate the game table 90° when the device is in portrait mode.
This preserves the desktop layout's horizontal geometry without any server or engine
changes, and without requiring the user to physically rotate their phone.

---

## 2. Architectural Overview

### 2.1 Forced Landscape Strategy

```
Physical portrait screen (375 × 812 px)
┌───────────────────────────┐
│                           │  ← viewport: 375 px wide
│   game table (rotated)    │
│   appears as landscape    │
│                           │  ← viewport: 812 px tall
└───────────────────────────┘

CSS on the game table container when portrait + narrow:
  width:  100dvh   (= 812 px — becomes the landscape "width")
  height: 100vw    (= 375 px — becomes the landscape "height")
  transform: translate(-50%, -50%) rotate(90deg)
  position: fixed; top: 50%; left: 50%;
```

The inner game table "thinks" it is 812 px wide × 375 px tall — classic landscape —
and all existing layout logic continues to work. The outer wrapper corrects for the
rotation so the element covers the full physical screen.

### 2.2 Scope Gating

The forced landscape transform activates **only** when both conditions are true:

1. `window.innerWidth < MOBILE_BREAKPOINT_PX` (600 px threshold)
2. `window.innerWidth < window.innerHeight` (device is in portrait)

Tablets in portrait, portrait browser windows on desktop, and devices in true landscape
all skip the transform and receive the existing layout unchanged.

### 2.3 Layout Branching

`GameTable2D` becomes a thin dispatcher that renders one of two sub-components:

```
GameTable2D
  ├── DesktopGameTable2D   (current implementation, renamed)
  └── MobileGameTable2D    (new — absolute positioning, no CSS Grid)
```

The `isMobileLandscapeForced` boolean comes from the new `useOrientation` hook and is
passed as a prop (not context) to keep the dependency surface explicit and testable.

### 2.4 Mobile Layout Model

Inside `MobileGameTable2D`, all elements are `position: absolute` within a `relative`
container that fills the rotated wrapper (812 × 375 px effective landscape):

```
┌─────────────────────────────────────────────────────┐  ← 812 px "wide"
│  [StatusBar 32px]                                   │
│                                                     │
│              [TopBadge — centered]                  │
│                                                     │
│  [LeftBadge]   [CombinedDiscardPool — flex-wrap]  [RightBadge]
│                 [wind / round watermark beneath]    │
│                                                     │
│  ━━━━━━━━━━━━[PlayerHand2D — full width]━━━━━━━━━  │
│              [ClaimDrawer ↑ above hand]             │
└─────────────────────────────────────────────────────┘  ← 375 px "tall"
```

No CSS Grid. No `rotateZ` on seat containers. No `overflow: hidden` on any layout cell.

---

## 3. PR Breakdown

### PR 14A — Foundation: Orientation Hook + Forced Landscape Wrapper

**Goal:** Wire up the rotation transform. Zero visual change for desktop/landscape users.  
**Branch:** `feat/phase-14A`

#### 3.1.1 New file: `apps/web/src/hooks/use-orientation.ts`

```typescript
export const MOBILE_BREAKPOINT_PX = 600;

export interface OrientationState {
  /** True when viewport is narrow portrait and the game table should be CSS-rotated. */
  isMobileLandscapeForced: boolean;
  /** Raw viewport dimensions (updated on resize). */
  vw: number;
  vh: number;
}

export function useOrientation(): OrientationState;
```

Implementation notes:

- Uses `window.innerWidth` / `window.innerHeight` on mount; listens to `resize` and
  `orientationchange` events.
- Debounce resize with a 50 ms `setTimeout` (prevents thrash during swipe-to-resize).
- Returns `{ isMobileLandscapeForced: vw < MOBILE_BREAKPOINT_PX && vw < vh, vw, vh }`.
- SSR-safe: guard with `typeof window !== 'undefined'`.

#### 3.1.2 New file: `apps/web/src/components/2d/ForcedLandscapeWrapper.tsx`

```tsx
interface ForcedLandscapeWrapperProps {
  active: boolean; // from useOrientation().isMobileLandscapeForced
  children: React.ReactNode;
}
```

When `active === false` (desktop / true landscape): renders children in a plain
`div className="w-full h-full"` — no transform, no dimension change.

When `active === true` (portrait phone):

```tsx
<div
  style={{
    position: 'fixed',
    top: '50%',
    left: '50%',
    // Swap viewport units: landscape width = portrait height; landscape height = portrait width.
    width: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
    height: 'calc(100vw  - env(safe-area-inset-left) - env(safe-area-inset-right))',
    // Centre and rotate 90° clockwise.
    transform: 'translate(-50%, -50%) rotate(90deg)',
    transformOrigin: 'center center',
    overflow: 'hidden',
    // Smooth orientation change (respects prefers-reduced-motion via CSS).
    transition: 'transform 0.25s ease',
  }}
>
  {children}
</div>
```

Safe-area note: in a 90° clockwise rotation, the physical top-of-device notch appears
on the **visual left** of the landscape canvas. The physical bottom home bar appears on
the **visual right**. We therefore apply:

- `paddingLeft:  env(safe-area-inset-top)` — shields melds/nameplates from notch
- `paddingRight: env(safe-area-inset-bottom)` — shields the right opponent from home bar

These are CSS custom property overrides written to `:root` by the wrapper and consumed
as `var(--mj-safe-left)` / `var(--mj-safe-right)` by child layout components.

Add the `prefers-reduced-motion` override in `apps/web/src/index.css`:

```css
@media (prefers-reduced-motion: reduce) {
  .mj-landscape-wrapper {
    transition: none !important;
  }
}
```

#### 3.1.3 Wire into `game-page.tsx`

In the `GameTable` component, call `useOrientation()` and wrap the table renderer:

```tsx
const { isMobileLandscapeForced, vw, vh } = useOrientation();

return (
  <div className="relative w-full h-dvh overflow-hidden bg-black">
    <div className="absolute inset-0" aria-hidden="true">
      <ForcedLandscapeWrapper active={isMobileLandscapeForced}>
        {snapshot.viewMode === '2D' ? (
          <GameTable2D onDiscard={onDiscard} isMobile={isMobileLandscapeForced} />
        ) : (
          <GameCanvas />
        )}
      </ForcedLandscapeWrapper>
    </div>
    {/* All DOM overlays (SeatHUD, SideRail, etc.) remain unchanged */}
    ...
  </div>
);
```

Add `isMobile: boolean` to `GameTable2DProps` so the branching is explicit (no hidden
context coupling).

> **Desktop preservation:** `ForcedLandscapeWrapper active={false}` is a no-op div.
> The `isMobile={false}` prop path in `GameTable2D` renders the existing
> `DesktopGameTable2D` (renamed from current `GameTable2D`). All existing desktop
> tests continue to pass without modification.

#### 3.1.4 Tests (new file: `use-orientation.test.ts`)

| Test ID                       | Assertion                                                         |
| ----------------------------- | ----------------------------------------------------------------- |
| `Orientation·portrait-narrow` | vw=375, vh=812 → `isMobileLandscapeForced: true`                  |
| `Orientation·landscape-phone` | vw=812, vh=375 → `isMobileLandscapeForced: false`                 |
| `Orientation·portrait-tablet` | vw=768, vh=1024 → `isMobileLandscapeForced: false` (≥ breakpoint) |
| `Orientation·resize-updates`  | firing resize event updates state                                 |
| `ForcedLandscape·inactive`    | `active=false` → plain div wrapper, no transform style            |
| `ForcedLandscape·active`      | `active=true` → container has `rotate(90deg)` in transform        |

**PR 14A touches:** `use-orientation.ts` (new), `ForcedLandscapeWrapper.tsx` (new),
`game-page.tsx` (minor wire-up), `index.css` (one media rule), `GameTable2D.tsx`
(add `isMobile` prop + rename internals). **No existing test regressions.**

---

### PR 14B — Mobile Layout: Opponent Badges + Absolute Positioning

**Goal:** Replace the CSS Grid with an absolute-positioned mobile layout and replace
per-seat opponent tile rows with compact info badges.  
**Branch:** `feat/phase-14B`  
**Depends on:** PR 14A merged.

#### 3.2.1 `GameTable2D.tsx` — dispatcher

```tsx
export function GameTable2D({ onDiscard, isMobile }: GameTable2DProps) {
  return isMobile ? (
    <MobileGameTable2D onDiscard={onDiscard} />
  ) : (
    <DesktopGameTable2D onDiscard={onDiscard} />
  );
}
```

`DesktopGameTable2D` is the current `GameTable2D` body, verbatim (just renamed).
`MobileGameTable2D` is the new component detailed below.

#### 3.2.2 New file: `apps/web/src/components/2d/OpponentBadge2D.tsx`

Replaces per-seat `OpponentHand2D` (face-down tile rows) on mobile. Shows:

- Wind-coloured dot + score (from existing `SeatLabel2D` / `Nameplate` patterns)
- Tile count: `🀫 ×N` using a Unicode back tile glyph + count number
- Active-seat highlight: gold `box-shadow: 0 0 0 2px #c9a961` ring when
  `snapshot.currentSeat === seatIdx`
- AFK indicator: amber dot
- Disconnect indicator: red dot
- Open melds (if any): a compact horizontal strip of `xs` tiles directly below the badge

```tsx
interface OpponentBadge2DProps {
  seatIdx: 0 | 1 | 2 | 3;
  position: 'top' | 'left' | 'right';
}
```

Layout per position:

- `top`: horizontal card, melds row beneath it. `minWidth: 120px`, centred.
- `left` / `right`: vertical card (name + count stacked), melds in a vertical strip
  beside it (rotated 90° — melds face the table centre). Max badge width: 52 px.

The badge reads from `useGameStore` directly (same pattern as `SeatLabel2D`).

```
┌──────────────────┐  Top badge example (horizontal):
│ ● 東  📇 ×12    │
│ [meld1] [meld2]  │
└──────────────────┘

┌────┐  Left/Right badge example (vertical):
│ ●  │
│ 南  │
│ ×12│
│[m1]│
│[m2]│
└────┘
```

**Open melds on the badge:** Use `OpenMelds2D` with a new `compact` prop that forces
tile size to `xs` regardless of `tileScale`. The badge's open melds must be visible
and readable — they carry strategic information (a pung, chow, or kong changes how
players assess the board). The `compact` flag bypasses `Table2DScaleContext`.

#### 3.2.3 New file: `apps/web/src/components/2d/MobileGameTable2D.tsx`

Full mobile layout. All child positions are `position: absolute`.

```tsx
export function MobileGameTable2D({ onDiscard }: { onDiscard: (tile: TileType) => void }) {
  // Constants (px) — derive from CSS custom props set by ForcedLandscapeWrapper
  const BADGE_W = 52; // left/right badge width (incl. melds)
  const HAND_H = 90; // viewer hand strip height
  const STATUS_H = 32; // compact status bar height

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <FeltSurface2D />

      {/* Top opponent badge — centred horizontally */}
      <div
        style={{
          position: 'absolute',
          top: STATUS_H + 8,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      >
        <OpponentBadge2D seatIdx={acrossSeat} position="top" />
      </div>

      {/* Left opponent badge */}
      <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)' }}>
        <OpponentBadge2D seatIdx={leftSeat} position="left" />
      </div>

      {/* Right opponent badge */}
      <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' }}>
        <OpponentBadge2D seatIdx={rightSeat} position="right" />
      </div>

      {/* Combined discard pool — fills the centre felt */}
      <div
        style={{
          position: 'absolute',
          top: STATUS_H + 8,
          bottom: HAND_H,
          left: BADGE_W,
          right: BADGE_W,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MobileDiscardPool2D />
      </div>

      {/* Round/wind watermark beneath the discard pool */}
      <RoundWatermark />

      {/* Viewer's interactive hand — pins to bottom edge */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: HAND_H,
          display: 'flex',
          alignItems: 'flex-end',
        }}
      >
        <PlayerHand2D onDiscard={onDiscard} />
      </div>

      {/* Viewer open melds — thin strip just above the hand */}
      <div style={{ position: 'absolute', bottom: HAND_H, left: BADGE_W, right: BADGE_W }}>
        <OpenMelds2D seatIdx={viewerSeat} role="bottom" />
      </div>
    </div>
  );
}
```

#### 3.2.4 New file: `apps/web/src/components/2d/MobileDiscardPool2D.tsx`

Replaces `CombinedDiscardPool2D`'s rigid 8-column grid with flex-wrap for mobile.
Same interleave logic (`buildInterleavedDiscards`) — only the container changes.

```tsx
<div
  data-testid="mobile-discard-pool"
  style={{
    display: 'flex',
    flexWrap: 'wrap',
    gap: 2,
    alignContent: 'flex-start',
    justifyContent: 'center',
    // Pool is bounded by the available centre area — no overflow into badge space.
    maxWidth: '100%',
    maxHeight: '100%',
    overflowY: 'auto', // scrollable if discards pile up late-game
    scrollbarWidth: 'none',
  }}
>
  {/* ...same AnimatePresence/motion.div tile map as CombinedDiscardPool2D... */}
</div>
```

Tile size for mobile discard pool: `'xs'` (28 × 38 px) — smaller than the desktop
`'sm'` (36 × 48 px) since the pool area is tighter. With 8 × 28 = 224 px + 7 × 2 px
gap = 238 px, a row of 8 tiles fits comfortably inside a `~700 px` available width
(812 px total − 52 px × 2 badges − 4 px padding).

#### 3.2.5 `RoundWatermark` component (inline in `MobileGameTable2D.tsx`)

Replaces the compass rose / round indicator:

```tsx
function RoundWatermark() {
  const snapshot = useGameStore((s) => s.snapshot);
  if (!snapshot) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 0,
        fontFamily: 'serif',
        fontWeight: 700,
        fontSize: 72,
        opacity: 0.06,
        color: '#c9a961',
        userSelect: 'none',
      }}
    >
      {WIND_CHAR[snapshot.roundWind]}
    </div>
  );
}
```

The large serif wind character sits beneath the discard tiles as a subtle watermark —
communicates the round at a glance without consuming any layout space.

#### 3.2.6 Tests (new files)

**`OpponentBadge2D.test.tsx`**

| Test ID                     | Assertion                                                    |
| --------------------------- | ------------------------------------------------------------ |
| `OpponentBadge·tile-count`  | Renders `×13` when `handCount: 13`                           |
| `OpponentBadge·active-glow` | Container has gold ring style when `currentSeat === seatIdx` |
| `OpponentBadge·afk`         | AFK indicator present when `seat.afk: true`                  |
| `OpponentBadge·open-melds`  | `open-melds-{n}` testid present when melds exist             |
| `OpponentBadge·no-melds`    | No meld strip rendered when `openMelds: []`                  |

**`MobileGameTable2D.test.tsx`**

| Test ID                            | Assertion                                     |
| ---------------------------------- | --------------------------------------------- |
| `MobileTable·renders-three-badges` | All three `OpponentBadge2D` instances present |
| `MobileTable·discard-pool-visible` | `mobile-discard-pool` testid in document      |
| `MobileTable·player-hand-present`  | `player-hand-2d` testid at absolute bottom    |
| `MobileTable·no-css-grid`          | Container does NOT have `display: grid`       |
| `MobileTable·felt-surface`         | `felt-surface` testid present as background   |

**PR 14B touches:** `GameTable2D.tsx` (dispatcher only), `DesktopGameTable2D.tsx`
(renamed, zero functional change), `MobileGameTable2D.tsx` (new), `OpponentBadge2D.tsx`
(new), `MobileDiscardPool2D.tsx` (new), `OpenMelds2D.tsx` (add `compact` prop).

---

### PR 14C — Touch Polish: Claim Drawer, Status Bar, Safe Areas, History

**Goal:** Refine the mobile experience — claim buttons above the hand, compact status
bar, safe-area inset wiring, history panel adapted for rotated layout.  
**Branch:** `feat/phase-14C`  
**Depends on:** PR 14B merged.

#### 3.3.1 Claim Drawer: `SideRail` repositioning

**Current behaviour:** `SideRail` renders at `bottom: 0`, covering the viewer's hand.  
**Mobile target:** Buttons slide up from just above the hand so tiles remain visible
(partial visibility aids decision-making — the player can still see which tile was
discarded by the opponent, displayed at the bottom of the discard pool).

Add CSS custom property `--mj-hand-height` (default `90px`) written by `PlayerHand2D`
via a `ResizeObserver` on its container:

```tsx
// Inside PlayerHand2D:
useEffect(() => {
  const el = containerRef.current;
  if (!el) return;
  const ro = new ResizeObserver(([entry]) => {
    document.documentElement.style.setProperty('--mj-hand-height', `${entry.contentRect.height}px`);
  });
  ro.observe(el);
  return () => ro.disconnect();
}, []);
```

`SideRail` on mobile uses:

```tsx
style={{
  bottom: isMobile ? 'var(--mj-hand-height, 90px)' : 0,
  // Rounded top corners only (bottom corners are flush with the hand strip)
  borderRadius: isMobile ? '12px 12px 0 0' : 0,
}}
```

The claim buttons are rendered at a comfortable 44 px minimum tap height
(`min-height: 44px` on each button — WCAG 2.5.8 target size guideline).

Pass `isMobile` into `SideRail` from `GameTable` in `game-page.tsx`.

#### 3.3.2 Status Bar: compact mode

When `isMobileLandscapeForced`:

- Total bar height target: **32 px** (down from the current ~56 px)
- `JingTileChip`: render at `size="2xs"` (new size: 18 × 24 px, implemented by adding
  a `'2xs'` entry to `TILE_DIMS` in `MahjongTile2D.tsx`)
- Wall count: number only — `{snapshot.wallCount}` with a wall icon glyph, no label text
- Round wind: wind character only (no "Round" i18n label)
- Concede: icon-only button (⚑ or similar SVG, `aria-label` preserved)

These are all conditional on `isMobile` passed into the `GameTable` status bar section
in `game-page.tsx`.

Add 2 new i18n keys (wall icon tooltip):

```json
"gameWallIcon":  "Wall",
"gameWallIconZh": "牌墙"
```

#### 3.3.3 Safe-area inset wiring

In `ForcedLandscapeWrapper.tsx`, set CSS custom properties on the wrapper element when
`active === true`:

```tsx
style={{
  '--mj-safe-left':  'env(safe-area-inset-top)',    // notch on visual left after 90° CW
  '--mj-safe-right': 'env(safe-area-inset-bottom)', // home bar on visual right
  '--mj-safe-top':   'env(safe-area-inset-right)',  // physical right → visual top
  '--mj-safe-bottom':'env(safe-area-inset-left)',   // physical left → visual bottom
} as React.CSSProperties
```

Consume in `MobileGameTable2D`:

- `PlayerHand2D` strip: `paddingBottom: var(--mj-safe-bottom, 0px)` — stops hand from
  being clipped by the home indicator bar
- Left opponent badge: `paddingLeft: var(--mj-safe-left, 0px)` — stops notch overlap
- Status bar: `paddingTop: var(--mj-safe-top, 0px)` — top edge (physical right edge)

#### 3.3.4 History panel on mobile

The `GameHistoryPanel` toggle tab sits at `right: 0, top: 50%`. In the rotated
landscape view this is visually at the physical bottom of the device — directly on top
of where the player's hand lives.

**Mobile strategy:**

- Hide the history panel toggle entirely on mobile (`isMobile && display: none`)
- Add a small history button to the compact status bar (an icon button, `aria-label`
  from existing i18n key `gameHistoryTitle`)
- The panel itself, when opened on mobile, appears as a full-width bottom sheet (not a
  right-side slide panel) with `height: 40%` and slide-up animation

Add `isMobile` prop to `GameHistoryPanel` in `game-page.tsx`.

#### 3.3.5 `prefers-reduced-motion` audit

Verify all motion in the new mobile components respects the OS setting:

- `ForcedLandscapeWrapper` transition is already gated via the CSS media rule added
  in PR 14A
- `MobileDiscardPool2D` tile enter animation: `TILE_TRANSITION.duration = 0` when
  `window.matchMedia('(prefers-reduced-motion: reduce)').matches` — use the existing
  `MotionConfig reducedMotion="user"` wrapper from `GameTable2D` (propagated)
- Opponent badge active-glow pulse: use `animation: none` via `@media` rule in CSS

#### 3.3.6 A11y: orientation announcement

Add `aria-label` to the `ForcedLandscapeWrapper` when active:

```tsx
aria-label={isMobile ? t('gameLandscapeMode') : undefined}
```

New i18n key: `gameLandscapeMode` / `游戏横屏模式` — announced once by screen readers
when the wrapper mounts in rotated mode.

#### 3.3.7 Tests

**`game-page.test.tsx` additions**

| Test ID                        | Assertion                                                            |
| ------------------------------ | -------------------------------------------------------------------- |
| `Mobile·siderail-above-hand`   | `SideRail` has `bottom: var(--mj-hand-height, 90px)` when `isMobile` |
| `Mobile·status-bar-compact`    | Wall count shows number only (no label text) when `isMobile`         |
| `Mobile·history-toggle-hidden` | History toggle tab not in document when `isMobile`                   |

**`ForcedLandscapeWrapper.test.tsx` additions**

| Test ID              | Assertion                                                    |
| -------------------- | ------------------------------------------------------------ |
| `SafeArea·props-set` | CSS custom props `--mj-safe-left` etc. present when `active` |
| `SafeArea·inactive`  | No `--mj-safe-*` props when `active=false`                   |

**PR 14C touches:** `game-page.tsx` (status bar, SideRail, GameHistoryPanel),
`ForcedLandscapeWrapper.tsx` (safe-area props), `MahjongTile2D.tsx` (`'2xs'` size),
`en.json` + `zh.json` (2 new keys), `index.css` (reduced-motion rule for badge glow).

---

## 4. File Map

| File                                       | Action                                                  | PR        |
| ------------------------------------------ | ------------------------------------------------------- | --------- |
| `hooks/use-orientation.ts`                 | **New**                                                 | 14A       |
| `components/2d/ForcedLandscapeWrapper.tsx` | **New**                                                 | 14A       |
| `pages/game/game-page.tsx`                 | Modify (wire-up, status bar compact, SideRail, history) | 14A, 14C  |
| `components/2d/GameTable2D.tsx`            | Modify (dispatcher + add `isMobile` prop)               | 14A, 14B  |
| `components/2d/DesktopGameTable2D.tsx`     | **Rename** from `GameTable2D.tsx` body                  | 14B       |
| `components/2d/MobileGameTable2D.tsx`      | **New**                                                 | 14B       |
| `components/2d/OpponentBadge2D.tsx`        | **New**                                                 | 14B       |
| `components/2d/MobileDiscardPool2D.tsx`    | **New**                                                 | 14B       |
| `components/2d/OpenMelds2D.tsx`            | Modify (add `compact` prop)                             | 14B       |
| `components/2d/MahjongTile2D.tsx`          | Modify (add `'2xs'` to `TILE_DIMS`)                     | 14C       |
| `i18n/en.json` + `zh.json`                 | Add 3 new keys                                          | 14A + 14C |
| `index.css`                                | Add `prefers-reduced-motion` + landscape wrapper rules  | 14A, 14C  |

**Not touched:** `DesktopGameTable2D` (renamed, not modified), `CombinedDiscardPool2D`
(desktop-only now), `PlayerHand2D`, `DiscardPool2D`, `Table2DContext`, `layout-2d.ts`,
`SeatLabel2D`, `FeltSurface2D`, all engine/API/shared packages.

---

## 5. Desktop Preservation Checklist

Before merging each PR, run the full web test suite and verify the following manually
on a desktop browser window ≥ 600 px wide:

- [ ] `GameTable2D` in 2D mode: CSS Grid layout unchanged, tiles visible in all 4 zones
- [ ] `OpponentHand2D` still renders xs tile rows for desktop opponents
- [ ] `CombinedDiscardPool2D` 8-column centred grid still renders
- [ ] `PlayerHand2D` drag-to-sort and two-tap discard still work
- [ ] `GameHistoryPanel` right-side slide-panel still opens
- [ ] Status bar full-height with wall label text still renders
- [ ] `SideRail` claim drawer still covers bottom (not raised above hand)
- [ ] `ForcedLandscapeWrapper active={false}`: no transform in the DOM

---

## 6. Test Count Target

| Suite  | Current | Target post-Phase 14                     |
| ------ | ------- | ---------------------------------------- |
| Engine | 248     | 248 (untouched)                          |
| API    | 220     | 220 (untouched)                          |
| Web    | 301     | ≥ 325 (24+ new tests across 14A/14B/14C) |

---

## 7. Key Risks & Mitigations

| Risk                                                                    | Mitigation                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `100dvh` / `100vw` units differ in older WebKits                        | Use `100vh` fallback first, then `100dvh` via `@supports`                                                                                                                                                                                                                       |
| `env(safe-area-inset-*)` not available in test environment              | Guard with `??` fallback to `0px`; test safe-area paths via CSS prop existence checks not computed values                                                                                                                                                                       |
| Discard flight animation (`layoutId`) breaks in rotated container       | Framer Motion `layoutId` animates within the nearest `LayoutGroup`. The `ForcedLandscapeWrapper` may need `<LayoutGroup>` wrapping if the shared-element animation re-anchors incorrectly after the rotate; validate manually and add `<LayoutGroup id="game-table">` if needed |
| `ResizeObserver` for `--mj-hand-height` fires after layout paint        | Debounce 16 ms (one frame) to avoid layout thrash; existing `ResizeObserver` in `GameTable2D` uses no debounce and is stable — apply same pattern                                                                                                                               |
| History panel bottom-sheet conflicts with `PlayerHand2D` swipe          | The bottom sheet has `z-index: 20`; `PlayerHand2D` is `z-index: 15`. Close the sheet on any pointer event outside it using a click-away handler                                                                                                                                 |
| TypeScript: `React.CSSProperties` does not accept CSS custom properties | Cast the style object `as React.CSSProperties` (standard pattern already used throughout the codebase for `--felt-*` vars)                                                                                                                                                      |

---

## 8. Implementation Order

```
main
  └─ feat/phase-14A  ← orientation hook + rotation wrapper (no visual change on desktop)
       └─ PR 14A → merge → main
            └─ feat/phase-14B  ← mobile layout + opponent badges (gate behind isMobile)
                 └─ PR 14B → merge → main
                      └─ feat/phase-14C  ← claim drawer, status bar, safe areas, history
                           └─ PR 14C → merge → main
```

Each PR is independently mergeable and reviewable. PRs 14B and 14C are never visible
to desktop users until tested end-to-end on a physical device or browser devtools
portrait simulation (375 × 812 px, device pixel ratio 2).
