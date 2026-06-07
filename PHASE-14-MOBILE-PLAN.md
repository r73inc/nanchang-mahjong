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

The forced landscape system activates **only** when both conditions are true:

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

### 2.5 Landscape Entry State Machine (NEW)

CSS rotation is a reliable fallback but leaves the browser address bar visible, wasting
20–40 px of vertical space. The preferred path is the native Web Fullscreen API. Because
both `requestFullscreen()` and `screen.orientation.lock()` require a user gesture, and
because the game must already be on-screen for a gesture to occur, we gate the entire
mobile landscape entry behind a one-time "Tap to Enter" overlay.

```
                ┌─────────────────────────────┐
                │       detect on mount       │
                └──────────────┬──────────────┘
                               │
              ┌────────────────▼─────────────────┐
              │  vw ≥ 600 OR vw ≥ vh ?           │
              └───────┬──────────────────────────┘
                      │ YES                 NO
                      ▼                     ▼
                  'desktop'           'needs-gesture'
                                           │
                               ┌───────────▼────────────┐
                               │  "Tap to Play" overlay  │
                               │  shown on game canvas   │
                               └───────────┬────────────┘
                                           │ user taps
                               ┌───────────▼────────────┐
                               │ requestFullscreen()     │
                               │ + orientation.lock()    │
                               └───────┬────────────────┘
                          success ◄────┤────► failure / unsupported
                               │                   │
                               ▼                   ▼
                      'native-landscape'    'css-landscape'
                        (no rotation)       (CSS rotate)
                               │
                    fullscreenchange ──────────────────► 'needs-gesture'
                    (user pressed ESC)                    (show overlay again)
```

`useOrientation` exposes a `LandscapeMode` enum (`'desktop' | 'needs-gesture' |
'native-landscape' | 'css-landscape'`) and a `requestNativeLandscape()` async function
that drives the state machine on user interaction.

`MobileLandscapeGate` (new component) renders the appropriate wrapper for each mode:

- `'desktop'` → passthrough `div` (no transform)
- `'needs-gesture'` → "Tap to Play" overlay
- `'native-landscape'` → passthrough `div` (browser handles orientation)
- `'css-landscape'` → `ForcedLandscapeWrapper` (CSS rotation)

### 2.6 Mobile Touch Constraint Summary (NEW)

Two browser-native behaviours must be surgically suppressed on the game surface:

| Behaviour                         | Trigger                                     | Suppression                                                                   |
| --------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| Pull-to-refresh (iOS/Android)     | Downward swipe on overscrolled page         | `overscroll-behavior: none` on `body`; `touch-action: none` on game wrapper   |
| Drag coordinate misinterpretation | CSS `rotate(90deg)` swaps physical X/Y axes | Disable `Reorder.Group` drag entirely when `isMobileLandscapeForced === true` |

Both are applied at the `ForcedLandscapeWrapper` / `GameTable` mount lifecycle and
cleaned up on unmount to avoid polluting non-game pages.

---

## 3. PR Breakdown

### PR 14A — Foundation: Orientation Hook + Landscape Gate + Touch Suppression

**Goal:** Wire up the fullscreen/rotation system and block native browser gestures.
Zero visual change for desktop/landscape users.  
**Branch:** `feat/phase-14A`

#### 3.1.1 New file: `apps/web/src/hooks/use-orientation.ts`

```typescript
export const MOBILE_BREAKPOINT_PX = 600;

export type LandscapeMode =
  | 'desktop' // wide viewport or true landscape — no action needed
  | 'needs-gesture' // portrait phone — waiting for user tap to enter game
  | 'native-landscape' // fullscreen + orientation.lock() succeeded
  | 'css-landscape'; // native APIs failed — CSS rotate(90deg) fallback active

export interface OrientationState {
  mode: LandscapeMode;
  /**
   * Shorthand: true only when CSS rotation is active.
   * Use this to branch layout/interaction logic in child components.
   */
  isMobileLandscapeForced: boolean;
  vw: number;
  vh: number;
  /**
   * Call inside a user-gesture handler (click/touchend).
   * Attempts requestFullscreen + screen.orientation.lock('landscape').
   * Sets mode to 'native-landscape' on success, 'css-landscape' on failure.
   */
  requestNativeLandscape: () => Promise<void>;
}

export function useOrientation(): OrientationState;
```

Implementation notes:

- On mount, compute `vw = window.innerWidth`, `vh = window.innerHeight`. If
  `vw < MOBILE_BREAKPOINT_PX && vw < vh` → initial mode is `'needs-gesture'`,
  else `'desktop'`.
- Listen to `resize` and `orientationchange` events (debounced 50 ms). If the device
  rotates to true landscape while in `'css-landscape'` or `'needs-gesture'` mode,
  transition to `'desktop'` so the CSS rotation is removed.
- Listen to the `fullscreenchange` document event. If `document.fullscreenElement`
  becomes `null` (user pressed ESC or the browser exited fullscreen), transition from
  `'native-landscape'` back to `'needs-gesture'` so the overlay reappears.
- SSR-safe: guard all `window`/`document` access with `typeof window !== 'undefined'`.
- `isMobileLandscapeForced` is `mode === 'css-landscape'`.

`requestNativeLandscape` implementation:

```typescript
const requestNativeLandscape = useCallback(async () => {
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    // screen.orientation.lock() is not available on iOS Safari — may throw.
    await screen.orientation.lock('landscape');
    setMode('native-landscape');
  } catch {
    // Either fullscreen was denied, or orientation.lock() is unsupported (iOS Safari).
    // CSS rotation is the reliable cross-platform fallback.
    setMode('css-landscape');
  }
}, []);
```

#### 3.1.2 New file: `apps/web/src/components/2d/ForcedLandscapeWrapper.tsx`

```tsx
interface ForcedLandscapeWrapperProps {
  active: boolean; // true only when mode === 'css-landscape'
  children: React.ReactNode;
}
```

When `active === false`: renders children in a plain `div className="w-full h-full"` —
no transform, no dimension change.

When `active === true`:

```tsx
<div
  style={{
    position: 'fixed',
    top: '50%',
    left: '50%',
    width: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
    height: 'calc(100vw  - env(safe-area-inset-left) - env(safe-area-inset-right))',
    transform: 'translate(-50%, -50%) rotate(90deg)',
    transformOrigin: 'center center',
    overflow: 'hidden',
    transition: 'transform 0.25s ease',
    // ── Pull-to-refresh prevention ──────────────────────────────────────────
    // touch-action: none disables all native browser touch handling on the
    // game surface. Prevents iOS momentum scroll, Android pull-to-refresh,
    // and swipe-back navigation from firing during gameplay.
    touchAction: 'none',
  }}
  className="mj-landscape-wrapper"
>
  {children}
</div>
```

Safe-area note: in a 90° clockwise rotation, the physical top-of-device notch appears
on the **visual left** of the landscape canvas. The physical bottom home bar appears on
the **visual right**. CSS custom properties translate physical insets to visual ones:

- `--mj-safe-left:  env(safe-area-inset-top)` — shields left opponent badge from notch
- `--mj-safe-right: env(safe-area-inset-bottom)` — shields right opponent from home bar
- `--mj-safe-top:   env(safe-area-inset-right)` — physical right → visual top
- `--mj-safe-bottom:env(safe-area-inset-left)` — physical left → visual bottom (hand)

These are written as inline CSS custom properties on the wrapper `div` and consumed by
child components via `var(--mj-safe-*)` without any prop-drilling.

Add to `apps/web/src/index.css`:

```css
/* Disable CSS rotation transition for users who prefer reduced motion. */
@media (prefers-reduced-motion: reduce) {
  .mj-landscape-wrapper {
    transition: none !important;
  }
}

/* Disable opponent badge glow pulse animation for reduced motion. */
@media (prefers-reduced-motion: reduce) {
  .mj-opponent-badge-active {
    animation: none !important;
    box-shadow: 0 0 0 2px #c9a961 !important;
  }
}
```

#### 3.1.3 New file: `apps/web/src/components/2d/MobileLandscapeGate.tsx`

This component owns the full entry flow for mobile users. It replaces the direct use of
`ForcedLandscapeWrapper` in `game-page.tsx`.

```tsx
interface MobileLandscapeGateProps {
  mode: LandscapeMode;
  onEnter: () => Promise<void>; // wired to requestNativeLandscape
  children: React.ReactNode;
}

export function MobileLandscapeGate({ mode, onEnter, children }: MobileLandscapeGateProps) {
  if (mode === 'desktop' || mode === 'native-landscape') {
    // No wrapper needed — desktop or native fullscreen is active.
    return <div className="w-full h-full">{children}</div>;
  }

  if (mode === 'needs-gesture') {
    return (
      <>
        {/* Render the game in background (invisible) so it is ready to show instantly */}
        <div style={{ visibility: 'hidden', position: 'fixed', inset: 0 }}>
          <ForcedLandscapeWrapper active={false}>{children}</ForcedLandscapeWrapper>
        </div>
        {/* "Tap to Play" overlay — requests native fullscreen on interaction */}
        <MobileTapToPlayOverlay onEnter={onEnter} />
      </>
    );
  }

  // mode === 'css-landscape': CSS rotation fallback
  return <ForcedLandscapeWrapper active>{children}</ForcedLandscapeWrapper>;
}
```

**`MobileTapToPlayOverlay` (inline in same file):**

```tsx
function MobileTapToPlayOverlay({ onEnter }: { onEnter: () => Promise<void> }) {
  const { t } = useI18n();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('gameMobileEnterTitle')}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(10,10,10,0.92)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
      }}
      // Suppress any scroll/bounce on the overlay itself
      style={{ touchAction: 'none' }}
    >
      {/* Landscape phone icon — SVG, aria-hidden */}
      <svg
        aria-hidden="true"
        width="64"
        height="64"
        viewBox="0 0 64 64"
        fill="none"
        stroke="#c9a961"
        strokeWidth="2.5"
      >
        <rect x="6" y="20" width="52" height="32" rx="4" />
        <circle cx="51" cy="36" r="2.5" fill="#c9a961" />
      </svg>
      <h2 style={{ color: '#f5efdf', fontSize: 18, fontWeight: 700, margin: 0 }}>
        {t('gameMobileEnterTitle')}
      </h2>
      <p
        style={{
          color: 'rgba(245,239,223,0.5)',
          fontSize: 13,
          margin: 0,
          textAlign: 'center',
          maxWidth: 240,
        }}
      >
        {t('gameMobileEnterDesc')}
      </p>
      <button
        onClick={onEnter}
        style={{
          padding: '14px 36px',
          borderRadius: 28,
          background: 'linear-gradient(180deg,#c9a961 0%,#a88a45 100%)',
          color: '#1a1a1a',
          fontWeight: 700,
          fontSize: 16,
          border: 'none',
          boxShadow: '0 6px 20px rgba(201,169,97,0.4)',
          // Minimum 44×44 px tap target (WCAG 2.5.8)
          minWidth: 44,
          minHeight: 44,
          cursor: 'pointer',
        }}
      >
        {t('gameMobileEnterCta')}
      </button>
    </div>
  );
}
```

New i18n keys (add to `en.json` / `zh.json`):

```json
"gameMobileEnterTitle": "Rotate to Play",
"gameMobileEnterDesc":  "We'll switch to landscape mode for the best experience.",
"gameMobileEnterCta":   "Enter Game"
```

```json
"gameMobileEnterTitle": "横屏游戏",
"gameMobileEnterDesc":  "我们将切换到横屏模式以获得最佳体验。",
"gameMobileEnterCta":   "进入游戏"
```

#### 3.1.4 Pull-to-Refresh Prevention (CRITICAL)

Rapidly tapping tiles or swiping during gameplay can trigger iOS Safari's
pull-to-refresh, Android's overscroll bounce, and swipe-back navigation gestures. These
disconnect the player or cause a full-page reload — catastrophic during an active hand.

**Two-layer suppression strategy:**

**Layer 1 — CSS (static, applied globally when the game mounts):**

`ForcedLandscapeWrapper` already applies `touchAction: 'none'` on the rotated container.
This handles the CSS rotation case.

For the native fullscreen case (`mode === 'native-landscape'`), suppression must still
be applied to the `body`. Add a `useEffect` in the `GameTable` component in
`game-page.tsx`:

```tsx
// In GameTable component, alongside the existing isMobile detection:
useEffect(() => {
  const isMobileGame = mode !== 'desktop';
  if (!isMobileGame) return;

  // Prevent pull-to-refresh and overscroll bounce on the game body.
  const prev = document.body.style.overscrollBehavior;
  document.body.style.overscrollBehavior = 'none';

  return () => {
    // Restore on unmount so lobby/home pages retain normal scroll behaviour.
    document.body.style.overscrollBehavior = prev;
  };
}, [mode]);
```

**Layer 2 — Inline style (defensive fallback, applied to the game table root div):**

```tsx
// On the outermost game table div in GameTable (game-page.tsx):
style={{
  touchAction: mode !== 'desktop' ? 'none' : 'auto',
  overscrollBehavior: mode !== 'desktop' ? 'none' : 'auto',
}}
```

The `touchAction: 'none'` is a well-supported inline property. It is safe to apply on
the game surface because all touch events within the game are handled explicitly by
React's synthetic event system (`onClick`, Framer Motion gesture handlers). The one
exception is `PlayerHand2D`'s `Reorder.Group`, which internally uses Pointer Events for
drag — but on mobile drag is disabled entirely (see Constraint 1 in PR 14B), so no
conflict exists.

**Cleanup contract:** Both suppressions must be removed on unmount. The `body`
override is cleaned up by the `useEffect` return function above. The inline style is
removed automatically when the `GameTable` component unmounts. Non-game pages (lobby,
home, history) are never affected.

#### 3.1.5 Wire into `game-page.tsx`

Replace the earlier simpler wire-up with the full `MobileLandscapeGate` integration:

```tsx
// In GameTable component:
const { mode, isMobileLandscapeForced, requestNativeLandscape } = useOrientation();

return (
  <div
    className="relative w-full h-dvh overflow-hidden bg-black"
    style={{
      touchAction: mode !== 'desktop' ? 'none' : 'auto',
      overscrollBehavior: mode !== 'desktop' ? 'none' : 'auto',
    }}
  >
    <div className="absolute inset-0" aria-hidden="true">
      <MobileLandscapeGate mode={mode} onEnter={requestNativeLandscape}>
        {snapshot.viewMode === '2D' ? (
          <GameTable2D onDiscard={onDiscard} isMobile={isMobileLandscapeForced} />
        ) : (
          <GameCanvas />
        )}
      </MobileLandscapeGate>
    </div>
    {/* All DOM overlays unchanged; isMobile passed down for SideRail, status bar */}
    ...
  </div>
);
```

Add `isMobile: boolean` to `GameTable2DProps`.

> **Desktop preservation:** When `mode === 'desktop'`, `MobileLandscapeGate` renders a
> plain passthrough div. `isMobile={false}` routes `GameTable2D` to the existing
> `DesktopGameTable2D` implementation. All existing tests continue to pass without
> modification.

#### 3.1.6 Tests

**`use-orientation.test.ts`**

| Test ID                           | Assertion                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `Orientation·portrait-narrow`     | vw=375, vh=812 → `mode: 'needs-gesture'`                                          |
| `Orientation·landscape-phone`     | vw=812, vh=375 → `mode: 'desktop'`                                                |
| `Orientation·portrait-tablet`     | vw=768, vh=1024 → `mode: 'desktop'` (≥ breakpoint)                                |
| `Orientation·resize-to-landscape` | resize event with vw > vh → transitions away from `'needs-gesture'`               |
| `Orientation·native-success`      | `requestNativeLandscape()` resolves → `mode: 'native-landscape'`                  |
| `Orientation·native-failure`      | `requestFullscreen()` rejects → `mode: 'css-landscape'`                           |
| `Orientation·fullscreen-exit`     | `fullscreenchange` event with `fullscreenElement: null` → `mode: 'needs-gesture'` |

**`MobileLandscapeGate.test.tsx`**

| Test ID                        | Assertion                                                       |
| ------------------------------ | --------------------------------------------------------------- |
| `Gate·needs-gesture`           | Shows "Enter Game" button; game content is `visibility: hidden` |
| `Gate·native`                  | Renders children directly; no `ForcedLandscapeWrapper`          |
| `Gate·css-fallback`            | Renders `ForcedLandscapeWrapper active={true}`                  |
| `Gate·desktop`                 | Renders children directly; no overlay                           |
| `Gate·enter-cta-calls-onEnter` | Clicking the CTA button calls `onEnter`                         |

**`ForcedLandscapeWrapper.test.tsx`**

| Test ID                  | Assertion                                              |
| ------------------------ | ------------------------------------------------------ |
| `Landscape·inactive`     | `active=false` → plain div, no transform style         |
| `Landscape·active`       | `active=true` → has `rotate(90deg)` in transform       |
| `Landscape·touch-action` | `active=true` → `touch-action: none` in style          |
| `SafeArea·props-set`     | `active=true` → CSS custom props `--mj-safe-*` present |
| `SafeArea·inactive`      | `active=false` → no `--mj-safe-*` props                |

**`game-page.test.tsx` additions**

| Test ID                             | Assertion                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `Mobile·body-overscroll-suppressed` | `document.body.style.overscrollBehavior === 'none'` when mode is not `'desktop'` |
| `Mobile·body-overscroll-restored`   | `overscrollBehavior` restored to original value on unmount                       |

**PR 14A touches:** `use-orientation.ts` (new), `ForcedLandscapeWrapper.tsx` (new),
`MobileLandscapeGate.tsx` (new), `game-page.tsx` (wire-up + body overscroll effect),
`GameTable2D.tsx` (add `isMobile` prop + rename internals), `en.json` + `zh.json`
(3 new keys), `index.css` (2 media rules). **No existing test regressions.**

---

### PR 14B — Mobile Layout: Opponent Badges + Absolute Positioning

**Goal:** Replace the CSS Grid with an absolute-positioned mobile layout, replace
per-seat opponent tile rows with compact info badges, and neutralise the two most
dangerous mobile-specific interaction traps: coordinate misinterpretation from CSS
rotation, and tile overflow on small devices.  
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
- Active-seat highlight: gold `box-shadow` ring with pulse animation
  (`class="mj-opponent-badge-active"` so `prefers-reduced-motion` can suppress the pulse)
- AFK indicator: amber dot
- Disconnect indicator: red dot
- Open melds (if any): `<OpenMelds2D>` with `compact` prop (forces `xs` size,
  ignores `tileScale`) so meld tiles are always readable regardless of scale

```tsx
interface OpponentBadge2DProps {
  seatIdx: 0 | 1 | 2 | 3;
  position: 'top' | 'left' | 'right';
}
```

The badge reads from `useGameStore` directly (same pattern as `SeatLabel2D`).

#### 3.2.3 Constraint 1 — Drag Coordinate Trap: Disable Drag on Mobile (CRITICAL)

**Root cause:** CSS `rotate(90deg)` transforms the DOM's internal coordinate plane.
Framer Motion's `Reorder` drag tracking operates in DOM-space coordinates. A finger
swiping physically upward (which is "left" in the rotated game canvas) registers as a
leftward drag vector to the Pointer Events API — the opposite direction. The result
is tiles flying in the wrong direction, getting stuck at bounds, or reordering
unpredictably. This is unfixable within Framer Motion without patching its internal
pointer delta calculations.

**Solution:** Completely disable drag on `PlayerHand2D` when in mobile mode.
The two-tap Select → Discard flow is the sole interaction pattern for mobile players.

Add `disableDrag: boolean` prop to `PlayerHand2D`:

```tsx
export interface PlayerHand2DProps {
  onDiscard: (tile: TileType) => void;
  disableDrag?: boolean; // NEW — set true when isMobileLandscapeForced
}
```

Inside `PlayerHand2D`, change the `draggable` derivation:

```tsx
// Before:
const draggable = interactive;

// After:
const draggable = interactive && !disableDrag;
```

`Reorder.Item` already uses `drag={draggable ? HORIZONTAL_AXIS : false}` and the group
already uses `onReorder={draggable ? setLocalOrder : () => undefined}` — both gates
automatically propagate from the updated `draggable` flag. No further changes to
`PlayerHand2D` are needed for constraint 1.

`MobileGameTable2D` passes `disableDrag={true}` to `PlayerHand2D`.
`DesktopGameTable2D` passes no `disableDrag` prop (default `false`).

#### 3.2.4 New file: `apps/web/src/components/2d/MobileGameTable2D.tsx`

Full mobile layout. All child positions are `position: absolute`.

```tsx
export function MobileGameTable2D({ onDiscard }: { onDiscard: (tile: TileType) => void }) {
  const snapshot = useGameStore((s) => s.snapshot);
  if (!snapshot) return null;

  const viewerSeat = (snapshot.viewerSeat ?? 0) as 0 | 1 | 2 | 3;
  const { right: rightSeat, across: acrossSeat, left: leftSeat } = getCompassSeats(viewerSeat);

  // Layout constants (px) — consumed by child absolute positions.
  // These match --mj-safe-* fallbacks; actual safe-area values applied via CSS vars.
  const BADGE_W = 52; // left/right badge width (including compact melds strip)
  const HAND_H = 90; // viewer hand strip height (overridden by --mj-hand-height)
  const STATUS_H = 32; // compact status bar height (rendered by game-page.tsx overlay)

  return (
    <div
      data-testid="mobile-game-table-2d"
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      {/* ── Background ──────────────────────────────────────────────────── */}
      <FeltSurface2D />

      {/* ── Round watermark — centred beneath discard pool ──────────────── */}
      <RoundWatermark />

      {/* ── Top opponent badge ───────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: STATUS_H + 8,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 2,
        }}
      >
        <OpponentBadge2D seatIdx={acrossSeat} position="top" />
      </div>

      {/* ── Left opponent badge ───────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          left: 'var(--mj-safe-left, 0px)',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 2,
        }}
      >
        <OpponentBadge2D seatIdx={leftSeat} position="left" />
      </div>

      {/* ── Right opponent badge ─────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          right: 'var(--mj-safe-right, 0px)',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 2,
        }}
      >
        <OpponentBadge2D seatIdx={rightSeat} position="right" />
      </div>

      {/* ── Combined discard pool — fills available centre felt ──────────── */}
      <div
        style={{
          position: 'absolute',
          top: STATUS_H + 8,
          bottom: HAND_H,
          left: `calc(${BADGE_W}px + var(--mj-safe-left, 0px))`,
          right: `calc(${BADGE_W}px + var(--mj-safe-right, 0px))`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
        }}
      >
        <MobileDiscardPool2D />
      </div>

      {/* ── Viewer open melds — thin strip just above the hand ──────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: `var(--mj-hand-height, ${HAND_H}px)`,
          left: `calc(${BADGE_W}px + var(--mj-safe-left, 0px))`,
          right: `calc(${BADGE_W}px + var(--mj-safe-right, 0px))`,
          display: 'flex',
          justifyContent: 'center',
          zIndex: 2,
        }}
      >
        <OpenMelds2D seatIdx={viewerSeat} role="bottom" compact />
      </div>

      {/* ── Viewer hand — full width, pins to bottom ─────────────────────── */}
      {/* disableDrag={true}: CSS rotation makes drag coordinates incorrect.  */}
      {/* Players use tap-to-select → tap-to-discard exclusively on mobile.  */}
      <div
        style={{
          position: 'absolute',
          bottom: 'var(--mj-safe-bottom, 0px)',
          left: 0,
          right: 0,
          zIndex: 3,
        }}
      >
        <PlayerHand2D onDiscard={onDiscard} disableDrag />
      </div>
    </div>
  );
}
```

#### 3.2.5 Constraint 4 — Player Hand Flex-Shrink Safety (CRITICAL for small devices)

**Root cause:** On an iPhone SE (375 × 667 px, some models 320 px wide), 14 tiles at
the default `lg` size (56 px each) total 784 px + 52 px gaps = 836 px — wider than the
rotated canvas height of 375 px. Without `flex-shrink`, tiles overflow the container
and break the layout.

**Solution:** Apply `flex-shrink: 1; min-width: 0` at two levels in `PlayerHand2D`:

**Level 1 — The `Reorder.Group` container:**

```tsx
<Reorder.Group
  style={{
    display: 'flex',
    flexWrap: 'nowrap',      // tiles squeeze; they do not wrap to a second row
    gap: 4,
    // flex-shrink allows the GROUP itself to shrink inside its parent strip
    flexShrink: 1,
    minWidth: 0,             // prevents the group from insisting on its intrinsic width
    // overflow: visible intentionally — selected tiles lift upward via translateY
    // and must remain visible. The strip height (not width) clips nothing here.
  }}
>
```

**Level 2 — Each `Reorder.Item`:**

```tsx
<Reorder.Item
  style={{
    listStyle: 'none',
    touchAction: 'none',
    // Allow each tile to shrink proportionally below its natural size.
    flexShrink: 1,
    minWidth: 0,
  }}
>
```

**Level 3 — `MahjongTile2D` itself (defensive):**
Ensure `MahjongTile2D` does not apply `flex-shrink: 0` or `min-width` that would fight
the parent. The current implementation uses explicit pixel `width` via `TILE_DIMS` and
`tileScale` — this is fine because the tile's `width` style will simply be overridden
by the flex container's shrink algorithm when total width exceeds the container.

**Why `flex-shrink: 1` without `flex-basis` is correct here:** The tiles have explicit
`width` set (e.g., 56 px at lg scale). `flex-shrink: 1` with no `flex-basis` means the
flex algorithm treats the explicit `width` as the base, then distributes any deficit
proportionally across all tiles. At 14 tiles in a 375 px container: each tile shrinks to
approximately `(375 − 52 px gaps) / 14 ≈ 23 px`. This is narrow but still interactive —
the tap target remains the tile height (62 px) which is finger-accessible.

**`min-width: 0` is mandatory.** Without it, each `Reorder.Item` (a flex child)
enforces its intrinsic minimum width — the content size — preventing shrinkage. This is
the single most common cause of flex overflow in React component libraries.

#### 3.2.6 New file: `apps/web/src/components/2d/MobileDiscardPool2D.tsx`

Same interleave logic as `CombinedDiscardPool2D` (`buildInterleavedDiscards`) — only
the container layout changes.

```tsx
<div
  data-testid="mobile-discard-pool"
  style={{
    display: 'flex',
    flexWrap: 'wrap',
    gap: 2,
    alignContent: 'flex-start',
    justifyContent: 'center',
    // Pool is bounded by the available centre area — tiles wrap, not overflow.
    maxWidth: '100%',
    maxHeight: '100%',
    overflowY: 'auto',           // late-game: scroll rather than clip
    scrollbarWidth: 'none',
    // The pool itself must not intercept touch events intended for the game.
    // Scrolling within the pool is intentional but should not propagate to body.
    overscrollBehavior: 'contain',
  }}
>
```

Tile size: `'xs'` (28 × 38 px). At 8 tiles per row: `8 × 28 + 7 × 2 = 238 px` —
fits well inside a centre area of `812 − 2 × 52 − 4 = 704 px` effective width.

Note `overscrollBehavior: 'contain'` on the pool specifically: this allows the pool to
scroll internally (if tiles accumulate) without propagating overscroll to the body,
complementing the global `overscrollBehavior: 'none'` on the body set in PR 14A.

#### 3.2.7 `RoundWatermark` component (inline in `MobileGameTable2D.tsx`)

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

#### 3.2.8 Tests

**`OpponentBadge2D.test.tsx`**

| Test ID                     | Assertion                                                                     |
| --------------------------- | ----------------------------------------------------------------------------- |
| `OpponentBadge·tile-count`  | Renders `×13` when `handCount: 13`                                            |
| `OpponentBadge·active-glow` | Container has `mj-opponent-badge-active` class when `currentSeat === seatIdx` |
| `OpponentBadge·afk`         | AFK indicator present when `seat.afk: true`                                   |
| `OpponentBadge·open-melds`  | `open-melds-{n}` testid present when melds exist                              |
| `OpponentBadge·no-melds`    | No meld strip rendered when `openMelds: []`                                   |

**`MobileGameTable2D.test.tsx`**

| Test ID                            | Assertion                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `MobileTable·renders-three-badges` | All three `OpponentBadge2D` instances in document                                   |
| `MobileTable·discard-pool-visible` | `mobile-discard-pool` testid in document                                            |
| `MobileTable·player-hand-present`  | `player-hand-2d` testid present                                                     |
| `MobileTable·no-css-grid`          | Container does NOT have `display: grid`                                             |
| `MobileTable·drag-disabled`        | `PlayerHand2D` receives `disableDrag={true}` (check testid attr or prop reflection) |

**`PlayerHand2D.test.tsx` additions**

| Test ID                   | Assertion                                                             |
| ------------------------- | --------------------------------------------------------------------- |
| `Hand·drag-disabled-prop` | When `disableDrag={true}`, `Reorder.Item` has `drag={false}`          |
| `Hand·flex-shrink-group`  | `Reorder.Group` container has `flex-shrink: 1; min-width: 0` in style |
| `Hand·flex-shrink-items`  | Each `Reorder.Item` has `flex-shrink: 1; min-width: 0` in style       |

**PR 14B touches:** `GameTable2D.tsx` (dispatcher only), `DesktopGameTable2D.tsx`
(renamed, zero functional change), `MobileGameTable2D.tsx` (new), `OpponentBadge2D.tsx`
(new), `MobileDiscardPool2D.tsx` (new), `PlayerHand2D.tsx` (add `disableDrag` prop +
`flex-shrink` styles), `OpenMelds2D.tsx` (add `compact` prop).

---

### PR 14C — Touch Polish: Claim Drawer, Status Bar, Safe Areas, History

**Goal:** Refine the mobile experience — claim buttons above the hand, compact status
bar, safe-area inset wiring, history panel adapted for rotated layout.  
**Branch:** `feat/phase-14C`  
**Depends on:** PR 14B merged.

#### 3.3.1 Claim Drawer: `SideRail` repositioning

**Current behaviour:** `SideRail` renders at `bottom: 0`, covering the viewer's hand.  
**Mobile target:** Buttons slide up from just above the hand so tiles remain partially
visible (helping the player see which tile was discarded while choosing a claim action).

`PlayerHand2D` sets a `--mj-hand-height` CSS custom property via a `ResizeObserver`
on its container ref:

```tsx
useEffect(() => {
  const el = containerRef.current;
  if (!el) return;
  const ro = new ResizeObserver(([entry]) => {
    document.documentElement.style.setProperty('--mj-hand-height', `${entry.contentRect.height}px`);
  });
  ro.observe(el);
  return () => {
    ro.disconnect();
    document.documentElement.style.removeProperty('--mj-hand-height');
  };
}, []);
```

`SideRail` on mobile:

```tsx
style={{
  bottom: isMobile ? 'var(--mj-hand-height, 90px)' : 0,
  borderRadius: isMobile ? '12px 12px 0 0' : 0,
  // Claim buttons maintain 44 px minimum tap height (WCAG 2.5.8)
  // already satisfied by `py-3` (12 px padding × 2 + ~20 px text ≈ 44 px)
}}
```

Pass `isMobile` into `SideRail` from `GameTable` in `game-page.tsx`.

#### 3.3.2 Status Bar: compact mode

When `isMobileLandscapeForced`:

- Total bar height target: **32 px** (down from the current ~56 px)
- `JingTileChip`: render at `size="2xs"` (new entry in `TILE_DIMS`: 18 × 24 px)
- Wall count: number only — no label text
- Round wind: wind character only (no `{t('gameRound')}` label)
- Concede: icon-only button (SVG flag, `aria-label` preserved)

New i18n keys:

```json
"gameWallIcon":   "Wall",
"gameWallIconZh": "牌墙"
```

#### 3.3.3 Safe-area inset wiring

`ForcedLandscapeWrapper` (PR 14A) already writes `--mj-safe-*` properties. Consumers
in PR 14C:

- `PlayerHand2D` strip: `paddingBottom: var(--mj-safe-bottom, 0px)` — stops hand from
  being clipped by the home indicator bar
- Status bar: `paddingTop: var(--mj-safe-top, 0px)` — top edge (physical right edge)
- Left badge: already uses `left: var(--mj-safe-left, 0px)` (wired in PR 14B)

#### 3.3.4 History panel on mobile

The `GameHistoryPanel` toggle tab sits at `right: 0, top: 50%`. After 90° clockwise
rotation, this is physically at the device bottom — on top of the player's hand.

**Mobile strategy:**

- Hide the right-edge toggle (`display: none` when `isMobile`)
- Add a small history icon button to the compact status bar
- Panel opens as a full-width bottom sheet (`height: 40%`, slide-up animation, `z-index: 16`)

Pass `isMobile` to `GameHistoryPanel`.

#### 3.3.5 `prefers-reduced-motion` audit

- `ForcedLandscapeWrapper` transition: already gated in PR 14A
- `MobileDiscardPool2D` tile enter: `MotionConfig reducedMotion="user"` propagates from
  `DesktopGameTable2D`'s root — ensure `MobileGameTable2D` also wraps in `<MotionConfig
reducedMotion="user">` (add in this PR)
- Opponent badge glow pulse: `.mj-opponent-badge-active` rule already added in PR 14A

#### 3.3.6 A11y: orientation announcement

```tsx
// On ForcedLandscapeWrapper when active:
aria-label={t('gameLandscapeMode')}
```

New i18n key: `"gameLandscapeMode": "Game table rotated to landscape"` /
`"游戏界面已旋转为横屏"`. Announced once by screen readers when the wrapper mounts.

#### 3.3.7 Tests

**`game-page.test.tsx` additions**

| Test ID                           | Assertion                                                                 |
| --------------------------------- | ------------------------------------------------------------------------- |
| `Mobile·siderail-above-hand`      | `SideRail` bottom is `var(--mj-hand-height, 90px)` when `isMobile`        |
| `Mobile·status-bar-compact`       | Wall count shows number only (no label text) when `isMobile`              |
| `Mobile·history-toggle-hidden`    | History toggle tab not in document when `isMobile`                        |
| `Mobile·hand-height-prop-set`     | `--mj-hand-height` CSS var present on `documentElement` after hand mounts |
| `Mobile·hand-height-prop-cleanup` | `--mj-hand-height` removed from `documentElement` when hand unmounts      |

**`ForcedLandscapeWrapper.test.tsx` additions**

| Test ID              | Assertion                                            |
| -------------------- | ---------------------------------------------------- |
| `A11y·aria-label`    | `active=true` → container has `aria-label` attribute |
| `A11y·no-aria-label` | `active=false` → no `aria-label` on passthrough div  |

**PR 14C touches:** `game-page.tsx` (status bar, SideRail, GameHistoryPanel),
`ForcedLandscapeWrapper.tsx` (aria-label), `MobileGameTable2D.tsx` (MotionConfig wrap),
`PlayerHand2D.tsx` (ResizeObserver for `--mj-hand-height`), `MahjongTile2D.tsx`
(`'2xs'` entry in `TILE_DIMS`), `en.json` + `zh.json` (3 new keys), `index.css`
(no additional changes needed).

---

## 4. File Map

| File                                       | Action                                                           | PR        |
| ------------------------------------------ | ---------------------------------------------------------------- | --------- |
| `hooks/use-orientation.ts`                 | **New**                                                          | 14A       |
| `components/2d/ForcedLandscapeWrapper.tsx` | **New**                                                          | 14A       |
| `components/2d/MobileLandscapeGate.tsx`    | **New**                                                          | 14A       |
| `pages/game/game-page.tsx`                 | Modify (wire-up, body overscroll, status bar, SideRail, history) | 14A, 14C  |
| `components/2d/GameTable2D.tsx`            | Modify (dispatcher + `isMobile` prop)                            | 14A, 14B  |
| `components/2d/DesktopGameTable2D.tsx`     | **Rename** from `GameTable2D.tsx` body                           | 14B       |
| `components/2d/MobileGameTable2D.tsx`      | **New**                                                          | 14B       |
| `components/2d/OpponentBadge2D.tsx`        | **New**                                                          | 14B       |
| `components/2d/MobileDiscardPool2D.tsx`    | **New**                                                          | 14B       |
| `components/2d/PlayerHand2D.tsx`           | Modify (`disableDrag` prop, flex-shrink styles, ResizeObserver)  | 14B, 14C  |
| `components/2d/OpenMelds2D.tsx`            | Modify (add `compact` prop)                                      | 14B       |
| `components/2d/MahjongTile2D.tsx`          | Modify (add `'2xs'` to `TILE_DIMS`)                              | 14C       |
| `i18n/en.json` + `zh.json`                 | Add 7 new keys total                                             | 14A + 14C |
| `index.css`                                | Add reduced-motion rules (2 blocks)                              | 14A       |

**Not touched:** `DesktopGameTable2D` (renamed, not modified), `CombinedDiscardPool2D`
(desktop-only now), `DiscardPool2D`, `Table2DContext`, `layout-2d.ts`, `SeatLabel2D`,
`FeltSurface2D`, all engine/API/shared packages.

---

## 5. Desktop Preservation Checklist

Before merging each PR, run the full web test suite and verify the following manually
on a desktop browser window ≥ 600 px wide:

- [ ] `GameTable2D` in 2D mode: CSS Grid layout unchanged, tiles visible in all 4 zones
- [ ] `OpponentHand2D` still renders xs tile rows for desktop opponents
- [ ] `CombinedDiscardPool2D` 8-column centred grid still renders
- [ ] `PlayerHand2D` drag-to-sort still works (drag is only disabled when `disableDrag={true}`)
- [ ] `GameHistoryPanel` right-side slide-panel still opens
- [ ] Status bar full-height with wall label text still renders
- [ ] `SideRail` claim drawer still covers bottom edge (not raised above hand)
- [ ] `ForcedLandscapeWrapper active={false}`: no transform, no `touch-action: none`
- [ ] `body.style.overscrollBehavior` is NOT `'none'` after navigating from game to lobby
- [ ] `MobileLandscapeGate mode="desktop"` renders passthrough div (no overlay)

---

## 6. Test Count Target

| Suite  | Current | Target post-Phase 14                     |
| ------ | ------- | ---------------------------------------- |
| Engine | 248     | 248 (untouched)                          |
| API    | 220     | 220 (untouched)                          |
| Web    | 301     | ≥ 340 (39+ new tests across 14A/14B/14C) |

---

## 7. Key Risks & Mitigations

| Risk                                                                                  | Mitigation                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `100dvh` / `100vw` units differ in older WebKits                                      | Use `100vh` fallback first, then `100dvh` via `@supports (height: 100dvh)`                                                                                                                                                                                                           |
| `env(safe-area-inset-*)` not available in jsdom test environment                      | Guard with `?? '0px'` fallback; test safe-area paths via CSS custom property presence, not computed pixel values                                                                                                                                                                     |
| Framer Motion `layoutId` shared-element animation re-anchors inside rotated container | `layoutId` animates within the nearest `LayoutGroup`. Add `<LayoutGroup id="game-table">` at the `MobileLandscapeGate` level if the discard flight animation misfires after rotation; validate manually on device                                                                    |
| `ResizeObserver` for `--mj-hand-height` fires after first paint                       | Debounce 16 ms (one frame); the CSS variable fallback `var(--mj-hand-height, 90px)` ensures `SideRail` is not mispositioned on first render                                                                                                                                          |
| `screen.orientation.lock()` rejects silently on iOS Safari                            | Entire `requestNativeLandscape` is wrapped in try/catch; any rejection (including `NotSupportedError`) routes to `'css-landscape'` mode                                                                                                                                              |
| Native fullscreen exits unexpectedly (e.g., incoming phone call)                      | `fullscreenchange` listener transitions back to `'needs-gesture'`; overlay reappears. Player sees "Tap to Enter Game" and can re-enter with one tap                                                                                                                                  |
| **[NEW] Drag coordinate inversion under CSS rotation**                                | `disableDrag={true}` passed to `PlayerHand2D` from `MobileGameTable2D`; `Reorder.Item drag={false}` removes all pointer event capture from Framer Motion's drag system. Two-tap flow is the sole mobile interaction path — no drag tracking occurs                                   |
| **[NEW] Pull-to-refresh fires during rapid tile tapping**                             | Two-layer suppression: `touch-action: none` on the rotated wrapper and the game table root div; `overscrollBehavior: none` on `body` via `useEffect` (with cleanup on unmount). `overscrollBehavior: contain` on the discard pool allows internal scroll without propagating to body |
| **[NEW] Native fullscreen blocked by browser policy**                                 | Fullscreen requires a user gesture; the `MobileTapToPlayOverlay` CTA button is the gesture. If `requestFullscreen()` is blocked (e.g., some Android WebViews), catch routes to CSS fallback. The game is always playable via CSS rotation                                            |
| **[NEW] 14 tiles overflow on iPhone SE (320/375 px)**                                 | `flex-shrink: 1; min-width: 0` on both `Reorder.Group` and each `Reorder.Item`; tiles squeeze proportionally rather than overflowing. Minimum tile tap target is the tile height (62 px), not width, so usability is preserved even at maximum shrink                                |
| TypeScript: `React.CSSProperties` does not accept CSS custom properties               | Cast the style object `as React.CSSProperties` — standard pattern throughout the codebase for `--felt-*` and `--tile-*` vars                                                                                                                                                         |
| History bottom sheet z-index conflict with `PlayerHand2D`                             | Bottom sheet at z-16 uses a click-away backdrop at z-15; tapping outside the sheet closes it. `PlayerHand2D` at z-3 is below both layers                                                                                                                                             |

---

## 8. Implementation Order

```
main
  └─ feat/phase-14A  ← use-orientation hook, MobileLandscapeGate, ForcedLandscapeWrapper,
  │                     pull-to-refresh suppression, "Tap to Play" overlay
  │                     (no visual change on desktop; mobile shows overlay then rotates)
       └─ PR 14A → merge → main
            └─ feat/phase-14B  ← MobileGameTable2D, OpponentBadge2D, MobileDiscardPool2D,
            │                     drag disabled on mobile, flex-shrink safety on PlayerHand2D
                 └─ PR 14B → merge → main
                      └─ feat/phase-14C  ← claim drawer above hand, compact status bar,
                      │                    safe-area wiring, history bottom sheet, a11y
                           └─ PR 14C → merge → main
```

Each PR is independently mergeable and reviewable. PRs 14B and 14C are never visible
to desktop users. End-to-end mobile testing should use Chrome DevTools portrait
simulation (375 × 812 px, device pixel ratio 2) for CSS rotation path, and a physical
iOS/Android device for the native fullscreen + `screen.orientation.lock()` path.
