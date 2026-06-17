---
name: Nanchang Mahjong
description: Private family Nanchang Mahjong — intimate, authoritative, heirloom dark.
colors:
  jade-deep: '#051a13'
  jade-felt: '#0d3b2e'
  gold: '#c9a961'
  gold-deep: '#a88a45'
  bone: '#f5efdf'
  win: '#7fc299'
  win-deep: '#1f7a4d'
  loss: '#c0392b'
  loss-light: '#e88080'
  bg-page: '#0a0a0a'
  bg-card: '#141414'
  bg-elevated: '#1c1c1c'
  seat-east: '#c9a961'
  seat-south: '#a36d3e'
  seat-west: '#5a7d8c'
  seat-north: '#7d4f4f'
typography:
  display:
    fontFamily: '"Noto Serif SC", serif'
    fontSize: '32px'
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 'normal'
  headline:
    fontFamily: '"Inter", -apple-system, system-ui, sans-serif'
    fontSize: '24px'
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: '"Inter", -apple-system, system-ui, sans-serif'
    fontSize: '17px'
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: '"Inter", -apple-system, system-ui, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: '"Inter", -apple-system, system-ui, sans-serif'
    fontSize: '11px'
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: '0.04em'
rounded:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '22px'
  interactive: '14px'
  pill: '9999px'
spacing:
  s1: '4px'
  s2: '8px'
  s3: '12px'
  s4: '16px'
  s5: '20px'
  s6: '24px'
  s7: '32px'
  s8: '48px'
  s9: '64px'
components:
  button-primary:
    backgroundColor: '{colors.gold}'
    textColor: '#1f2937'
    rounded: '14px'
    padding: '14px 20px'
  button-primary-hover:
    backgroundColor: '{colors.gold-deep}'
    textColor: '#1f2937'
    rounded: '14px'
    padding: '14px 20px'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.bone}'
    rounded: '14px'
    padding: '14px 20px'
  surface-card:
    backgroundColor: 'rgba(245,239,223,0.06)'
    rounded: '14px'
    padding: '12px 16px'
  input-field:
    backgroundColor: 'rgba(245,239,223,0.07)'
    textColor: '{colors.bone}'
    rounded: '{rounded.md}'
    padding: '12px 14px'
  input-field-focus:
    backgroundColor: 'rgba(245,239,223,0.07)'
    textColor: '{colors.bone}'
    rounded: '{rounded.md}'
    padding: '12px 14px'
  toggle-active:
    backgroundColor: '{colors.gold}'
    rounded: '{rounded.pill}'
    size: '44px'
    height: '24px'
  toggle-inactive:
    backgroundColor: 'rgba(245,239,223,0.15)'
    rounded: '{rounded.pill}'
    size: '44px'
    height: '24px'
---

# Design System: Nanchang Mahjong

## 1. Overview: The Family Heirloom

**Creative North Star: "The Family Heirloom"**

This is not a product someone shipped. It is something made, used, and passed around among people who know each other and know this game. The interface is built from the same physical vocabulary as the table itself: deep jade felt for surfaces, bone-white tiles for text, gold for the moments that matter. There is no branding, no marketing energy, no attempt to impress strangers. Every screen should feel like it was already here.

The visual register is restrained and dark — not minimal for minimalism's sake, but because the game is the content. Screens exist to get the player to the table; they should not linger or perform. Motion is used only to convey state: a turn starting, a tile being claimed, a hand resolving. The chrome should nearly disappear.

The system is bilingual (EN/ZH) and themeable — jade, crimson, slate, navy, and yellow felts are all first-class. Any new component must work across all felt themes. The CSS custom properties `--felt-top`, `--felt-bottom`, `--felt-ink`, `--felt-ink-rgb`, `--felt-header` are the live-bound layer; Tailwind design tokens are the static reference. Never hardcode a felt color; always reach for `var(--felt-*)` or `rgba(var(--felt-ink-rgb), α)` on surfaces that must adapt.

**Key Characteristics:**

- Dark jade surfaces; bone text; gold accent used sparingly and always meaningfully
- Components feel warm and tactile — slight weight, responsive to touch — not flat or clinical
- Maximum width 460px; mobile-first column; all screens are phone-shaped
- No animations that don't convey state; every transition serves a purpose
- All text in `t()` — EN and ZH keys in strict parity; no literal strings in JSX

## 2. Colors: The Felt Palette

One accent (gold), one surface family (jade), one ink (bone). Everything else is semantic.

### Primary

- **Heirloom Gold** (#c9a961): The single accent color. Used exclusively on primary CTAs, active/selected states, animated indicators, and gold borders that signal "this is the moment." Its rarity is the point. Never use it for decoration.
- **Deep Gold** (#a88a45): The gradient bottom on primary buttons and hover state. Never used standalone; always paired with Heirloom Gold above it.

### Secondary

- **Jade Felt** (#0d3b2e): All screen shell surfaces — the `ScreenShell` background gradient top, sticky headers. The living room the game is played in.
- **Deep Jade** (#051a13): Gradient bottom of screen surfaces and the outer page background. The table's shadow.

### Neutral

- **Bone** (#f5efdf): All text. Matched against jade surfaces it exceeds 7:1 contrast (AAA). On light felt themes (yellow) the ink is overridden to black via per-theme CSS blocks in `index.css`.
- **Page Black** (#0a0a0a): Root page background, used behind the centered 460px column.
- **Card Surface** (#141414): First card elevation on dark (non-felt) screens.
- **Elevated Surface** (#1c1c1c): Second card elevation on dark screens.

### Semantic

- **Win Green** (#7fc299): Positive outcome states — win badge, positive ELO delta, success messages.
- **Win Deep** (#1f7a4d): Win badge background, deep win highlight.
- **Loss Red** (#c0392b): Negative outcome states — loss badge, error borders.
- **Loss Light** (#e88080): Error text on dark surfaces; meets 4.5:1 against jade.
- **Seat East** (#c9a961): Your seat (bottom). Identical to gold — you are the gold.
- **Seat South** (#a36d3e): Terracotta-brown.
- **Seat West** (#5a7d8c): Slate-blue.
- **Seat North** (#7d4f4f): Dusky rose.

### Named Rules

**The Gold Rarity Rule.** Gold (#c9a961) appears on ≤ one primary action per screen and on active state indicators. No decoration, no gradient text, no accent borders just because. If something is gold, it is important.

**The Felt Adaptation Rule.** Any surface that sits inside a `ScreenShell` must use `rgba(var(--felt-ink-rgb), α)` for backgrounds and borders — never a hardcoded rgba. This ensures correctness across all five felt themes. The only exception is semantic colors (win/loss), which are invariant.

## 3. Typography: Two Voices

**Body/UI Font:** Inter (with -apple-system, BlinkMacSystemFont, system-ui, sans-serif fallback)
**Display/Cultural Font:** Noto Serif SC (with serif fallback)
**Code/Mono Font:** JetBrains Mono (with ui-monospace, monospace fallback)

**Character:** Inter carries all UI chrome — crisp, neutral, invisible at its job. Noto Serif SC appears only for cultural anchors: the brand hanzi (南昌), decorative section moments, and Chinese proper nouns in game copy. The contrast between the two is deliberate: one is the table's surface, one is the character carved into the tile.

### Hierarchy

- **Display** (Noto Serif SC, 600, 32px, 1.2): Cultural anchors only — brand hanzi, section hero moments. Never for UI labels.
- **Headline** (Inter, 700, 24px, 1.2): User-facing names, welcome header. Rare.
- **Title** (Inter, 700, 17px, 1.3): Screen headers in `ScreenShell` — the page name. One per screen.
- **Body** (Inter, 400, 14px, 1.5): Settings descriptions, help text, game state copy. Line length ≤ 65ch.
- **Label** (Inter, 600, 11px, 1.2, 0.04em, uppercase): Section category labels inside list items (e.g. "AUTO · SAVED"), stat labels, timestamp metadata. Not decorative eyebrows — used only when the uppercase signals a content type within a data row.

### Named Rules

**The One Culture Voice Rule.** Noto Serif SC is the cultural voice. It should appear in at most one place per screen. Using it for UI chrome or body copy will make the interface feel costumed, not authentic.

**The Fixed Scale Rule.** No `clamp()` or `vw` font sizes. This is a phone-first product at a fixed 460px column. Fluid type adds complexity with no benefit.

## 4. Elevation: Felt Shadow

This system is dark by nature; elevation is expressed through a combination of tonal layering (surfaces getting slightly lighter as they rise) and targeted gold glow for primary actions. No heavy drop shadows for decoration.

### Shadow Vocabulary

- **CTA Glow** (`0 6px 18px rgba(201, 169, 97, 0.3)`): Applied to primary gold buttons only. Communicates that the gold button is elevated and interactive. Never used on secondary surfaces.
- **Overlay Shadow** (`0 12px 40px rgba(0, 0, 0, 0.55)`): Bottom sheets, modals, overlays. Grounds them above the game surface.
- **Viewport Frame** (`0 30px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(201, 169, 97, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.04)`): Game canvas only — this three-layer shadow is the frame of the table.

### Tonal Layering (non-felt screens)

Dark screens not inside a `ScreenShell` use explicit bg tokens: page `#0a0a0a` → card `#141414` → elevated `#1c1c1c`. Each step is clearly distinguishable; no guessing required.

### Named Rules

**The Flat-By-Default Rule.** Surfaces inside `ScreenShell` are flat; they rely on the felt gradient, not shadows, to feel grounded. Shadows appear only on primary CTAs (gold glow), modals/sheets (overlay shadow), and the game canvas (viewport frame).

## 5. Components

### Buttons

**Character:** Heavy, warm, and responsive. The gold primary button should feel like pressing a physical object.

- **Shape:** Generously rounded (14px — between `rounded-md` and `rounded-lg`, this specific value is a system constant)
- **Primary:** Gold gradient (top: #c9a961, bottom: #a88a45), dark slate text (#1f2937), **Title tier** typography (Inter, 700, 17px — the only Inter/700 tier in the scale), 14px vertical / 20px horizontal padding, CTA glow shadow. Full-width on mobile. On disabled: 70% opacity, `cursor-wait`.
- **Primary Hover:** Shift gradient to gold-deep (#a88a45) solid; glow shadow persists.
- **Ghost/Secondary:** Transparent background, bone/15 border, `var(--felt-ink)` text (live-bound — adapts across all five felt themes). Same radius and padding as primary. No shadow.
- **Destructive text link:** `text-mj-bone/70`, no background, no border. Used only for sign-out / low-importance non-destructive actions.

### Surface Cards / Containers

**Character:** Barely-there surfaces. They should feel like slight recesses in the felt, not raised panels.

- **Corner Style:** 14px radius (interactive surfaces); 12px for non-interactive containers.
- **Background:** `rgba(var(--felt-ink-rgb), 0.06)` — adapts to felt theme.
- **Border:** `1px solid rgba(var(--felt-ink-rgb), 0.08–0.12)` — slightly more opaque on interactive cards.
- **Shadow:** None. Flat by default.
- **Internal Padding:** 12px vertical / 16px horizontal (s3/s4).

### Inputs / Fields

**Character:** Understated and open. They invite typing without announcing themselves.

- **Style:** `rgba(bone, 0.07)` background, `1px solid rgba(bone, 0.15)` border, 12px radius, 12px vertical / 14px horizontal padding.
- **Focus:** Border shifts to `rgba(gold, 0.50)` — gold signals interaction, consistent with the system accent.
- **Error:** Border shifts to `rgba(loss, 0.55)`. Error message below at 11px `text-mj-loss-light`.
- **Label above:** 11px, semibold, `rgba(var(--felt-ink-rgb), 0.7)`, uppercase, 0.5px tracking. Input text uses `var(--felt-ink)` directly — both live-bind across felt themes.
- **Disabled:** Not yet defined — inherit 50% opacity until specified.

### Toggle Switch

- **Active:** #c9a961 pill background, white 20px thumb shifted right (translateX 20px).
- **Inactive:** `rgba(bone, 0.15)` pill background, `1px solid rgba(bone, 0.20)`, white thumb at left.
- **Size:** 44px × 24px. Thumb 20px diameter.
- **Transition:** 150ms on background and transform.

### Screen Shell Header

- **Background:** `var(--felt-header, rgba(8,30,23,0.6))` with `backdrop-filter: blur(12px)`.
- **Bottom border:** `1px solid rgba(201,169,97,0.15)` — a whisper of gold.
- **Title:** 17px bold, `text-mj-bone`. One per shell. Left-aligned.
- **Back button:** 32px square, `rgba(gold, 0.12)` background, gold arrow icon.
- **Safe area:** `padding-top: calc(env(safe-area-inset-top, 0px) + 12px)` — always.

### Mahjong Tile (Signature Component)

The `MahjongTile2D` component renders SVG textures from `public/textures/Tiles/Regular/`. It is the visual heart of the system. Every tile — in any screen — must use this component. Never use the legacy text-glyph tile component for new work.

- **Shape:** `rounded-xs` (4px) — tiles have tight corners, not soft ones.
- **Face:** SVG texture stamp on a white/off-white tile body.
- **Selected state:** Gold outline or emissive glow (in 3D: three-layer jing treatment).
- **Interactive:** Only tile hit-boxes participate in raycasting; body and face meshes use `NOOP_RAYCAST`.

## 6. Do's and Don'ts

### Do:

- **Do** use `rgba(var(--felt-ink-rgb), α)` for all backgrounds and borders inside `ScreenShell`. Never hardcode a rgba that won't adapt to felt themes.
- **Do** use gold (#c9a961) only on primary CTAs, active/selected states, and state-signaling indicators. One gold element per screen at most.
- **Do** keep all animations ≤ 400ms except ambient loops (turn pulse: 1600ms). State changes and reveals at 200–250ms.
- **Do** provide a `@media (prefers-reduced-motion: reduce)` fallback for every animation — crossfade or instant, never just "remove motion and leave a blank state."
- **Do** use `MahjongTile2D` for every mahjong tile rendered on screen, including in new features and refactors. The legacy text-glyph component is deprecated.
- **Do** write every visible string through `t()` with EN and ZH keys in parity. Zero literal strings in JSX.
- **Do** keep the phone column (max 460px) centered on wide viewports. No breakpoint-driven layout changes; the design is intentionally phone-shaped.
- **Do** target WCAG AAA contrast (7:1) for body text on jade surfaces. Bone (#f5efdf) on jade (#0d3b2e) is 8.9:1 — the floor, not the ceiling.

### Don't:

- **Don't** build anything that reads as a cold SaaS dashboard: no blue-and-gray color schemes, no B2B information density cues, no corporate-neutral surfaces. This is a family game room, not an admin tool.
- **Don't** build anything with generic mobile game UI energy: no oversized cartoon icons, no XP explosion animations, no jackpot-style number popups, no aggressive color saturation on non-primary surfaces.
- **Don't** use gold (#c9a961) as a decorative color — no gold section borders, no gold icon backgrounds, no gold gradient text. If something is gold, it is a primary action or active state.
- **Don't** use Noto Serif SC for UI labels, button text, or body copy. It is a cultural accent, not a display stack.
- **Don't** add animation to elements that aren't changing state. No entrance animations on static screens, no parallax, no scroll-driven sequences.
- **Don't** nest cards. A card inside a card is always wrong here. If a surface needs internal grouping, use spacing and opacity, not nesting.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe on any component. Rewrite with full borders, tinted backgrounds, or leading icons.
- **Don't** use gradient text (`background-clip: text`). Gold is solid; bone is solid. The palette works because it's restrained.
- **Don't** hardcode felt colors (e.g. `#0d3b2e` or `#051a13`) on surfaces inside `ScreenShell`. Those surfaces must adapt to all five felt themes via `var(--felt-*)`.
- **Don't** use modals as a first-choice pattern. Sheets, inline reveals, and progressive disclosure are preferred. Modals for destructive confirmations only.
