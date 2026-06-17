# Product

## Register

product

## Users

A private family group — four players, Chinese-heritage, bilingual EN/ZH. They know Nanchang Mahjong well; this is their game, not a stranger's. They play on phones, often in the same room or on a family chat. Older family members may have reduced vision or be less comfortable with dense interfaces. The primary task on any screen is either "get into a game" or "see how the game is going."

## Product Purpose

A private multiplayer Nanchang Mahjong app — server-authoritative, rules-locked to Nanchang Mahjong only. Players connect to private rooms, play full sessions (East or East+South rounds, or bust mode), and accumulate ELO ratings over time. Success looks like: a family sitting down to play, the app disappearing into the experience, and the game feeling like it always has — just digital.

## Brand Personality

Intimate · familiar · nostalgic. This is a family heirloom in software form. The interface should feel like the table itself — worn, trustworthy, theirs. Not a product someone shipped. Not a game you downloaded. Something they made for themselves.

## Anti-references

- **No cold SaaS dashboards**: no blue-and-gray product aesthetic, no B2B density cues, no corporate neutrals. This is not a tool, it is a place.
- **No generic mobile game UIs**: no Clash-of-Clans energy — no oversized cartoon icons, no XP explosion animations, no aggressive CTAs, no dark-pattern dopamine loops.

## Design Principles

1. **The table disappears.** Every screen that isn't the game table should feel like a clean path to the game. Navigation overhead is waste.
2. **Earn trust before delight.** Consistent, predictable components first. Moments of warmth only after the interface is reliable.
3. **The game is the brand.** Jade felt, gold tiles, bone ink — the visual language comes from the physical game, not from software conventions. When in doubt, ask what the table would do.
4. **Respect the players.** This is a skilled game played by people who know it. The interface should not explain, instruct, or animate past its welcome. Show the game; let the game speak.
5. **Inclusive by default.** AAA contrast where feasible, reduced-motion at the OS level, bilingual EN/ZH parity. Family members of every age should be able to play comfortably.

## Accessibility & Inclusion

Target WCAG 2.1 AAA where feasible (AAA contrast on body text, enlarged focus states, no time-gated content without override). Hard requirements already in place: `prefers-reduced-motion` in `index.css`, `aria-label` on interactive tiles, EN/ZH i18n parity. Older users may have reduced vision — prioritize generous text sizes and contrast over density.
