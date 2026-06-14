/**
 * CustomizePage — theme, tile-face palette, sound, tile size, and auto-sort preferences.
 *
 * Route: /customize
 *
 * Changes take effect immediately via CSS custom properties written to :root.
 * Preferences are persisted to localStorage ('nanchang-theme') via Zustand persist.
 */

import { useNavigate } from 'react-router-dom';
import { ScreenShell } from '../../components/ui/screen-shell';
import { MahjongTile2D } from '../../components/2d/MahjongTile2D';
import { useI18n } from '../../i18n';
import type { StringKey } from '../../i18n/strings';
import { useThemeStore } from '../../stores/theme.store';
import type { FeltTheme, TilePalette, TileSize } from '../../stores/theme.store';
import { FELT_CONFIGS, TILE_CONFIGS } from '../../lib/theme.utils';
import type { TileType } from '@nanchang/shared';

// ── Constants (outside JSX for no-literal-string rule) ────────────────────────

const FELT_OPTIONS: { id: FeltTheme; key: StringKey }[] = [
  { id: 'jade', key: 'customizeFeltJade' },
  { id: 'crimson', key: 'customizeFeltCrimson' },
  { id: 'slate', key: 'customizeFeltSlate' },
  { id: 'navy', key: 'customizeFeltNavy' },
  { id: 'yellow', key: 'customizeFeltYellow' },
];

const PALETTE_OPTIONS: { id: TilePalette; key: StringKey }[] = [
  { id: 'classic', key: 'customizePaletteClassic' },
  { id: 'sepia', key: 'customizePaletteSepia' },
  { id: 'dark', key: 'customizePaletteDark' },
];

const TILE_SIZE_OPTIONS: { id: TileSize; key: StringKey }[] = [
  { id: 'xs', key: 'customizeTileSizeXs' },
  { id: 'sm', key: 'customizeTileSizeSm' },
  { id: 'md', key: 'customizeTileSizeMd' },
  { id: 'lg', key: 'customizeTileSizeLg' },
  { id: 'xl', key: 'customizeTileSizeXl' },
];

// A small set of tiles to show in the palette preview
const PREVIEW_TILES: TileType[] = ['1m', '5p', '9s', 'east', 'zhong'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold tracking-widest uppercase text-mj-bone/50 mb-3">
      {children as string}
    </p>
  );
}

// ── Felt swatches ─────────────────────────────────────────────────────────────

function FeltSwatch({
  id,
  label,
  selected,
  onSelect,
}: {
  id: FeltTheme;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const cfg = FELT_CONFIGS[id];
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={label}
      className="flex flex-col items-center gap-2"
    >
      {/* Colour circle */}
      <div
        className="w-14 h-14 rounded-2xl relative overflow-hidden"
        style={{
          background: `linear-gradient(160deg, ${cfg.top} 0%, ${cfg.bottom} 100%)`,
          boxShadow: selected
            ? '0 0 0 3px #c9a961, 0 0 0 5px rgba(201,169,97,0.3)'
            : '0 0 0 1.5px rgba(var(--felt-ink-rgb),0.15)',
        }}
      >
        {selected && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-mj-gold text-xl font-bold">✓</span>
          </div>
        )}
      </div>
      {/* Label */}
      <span
        className="text-[11px] font-semibold"
        style={{ color: selected ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.55)' }}
      >
        {label}
      </span>
    </button>
  );
}

// ── Palette cards ─────────────────────────────────────────────────────────────

function PaletteCard({
  id,
  label,
  selected,
  onSelect,
}: {
  id: TilePalette;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const cfg = TILE_CONFIGS[id];
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={label}
      className="flex-1 flex flex-col items-center gap-2 py-3 px-2 rounded-xl"
      style={{
        background: selected ? 'rgba(201,169,97,0.12)' : 'rgba(var(--felt-ink-rgb),0.04)',
        border: selected ? '1.5px solid #c9a961' : '1.5px solid rgba(var(--felt-ink-rgb),0.08)',
      }}
    >
      {/* Tile preview scoped to this palette's own CSS vars so each card shows its own look */}
      <div
        className="flex gap-1 items-center"
        style={
          {
            '--tile-face-top': cfg.faceTop,
            '--tile-face-bottom': cfg.faceBottom,
          } as React.CSSProperties
        }
      >
        {PREVIEW_TILES.slice(0, 3).map((tile) => (
          <MahjongTile2D key={tile} tile={tile} size="xs" />
        ))}
      </div>
      <span
        className="text-[11px] font-semibold"
        style={{ color: selected ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.55)' }}
      >
        {label}
      </span>
    </button>
  );
}

// ── Tile size chips ───────────────────────────────────────────────────────────

function TileSizeChip({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={label}
      className="flex-1 flex flex-col items-center gap-2 py-3 px-1 rounded-xl"
      style={{
        background: selected ? 'rgba(201,169,97,0.12)' : 'rgba(var(--felt-ink-rgb),0.04)',
        border: selected ? '1.5px solid #c9a961' : '1.5px solid rgba(var(--felt-ink-rgb),0.08)',
      }}
    >
      <span
        className="text-[11px] font-semibold"
        style={{ color: selected ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.55)' }}
      >
        {label}
      </span>
    </button>
  );
}

// ── Toggle pill ───────────────────────────────────────────────────────────────

function TogglePill({
  enabled,
  onToggle,
  ariaLabel,
}: {
  enabled: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      onClick={onToggle}
      className="relative w-12 h-6 rounded-full transition-colors shrink-0"
      style={{
        background: enabled ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.12)',
        border: enabled ? 'none' : '1px solid rgba(var(--felt-ink-rgb),0.2)',
      }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
        style={{
          transform: enabled ? 'translateX(24px)' : 'translateX(0)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  );
}

// ── Preference row ────────────────────────────────────────────────────────────

function PrefRow({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-4 flex items-center justify-between"
      style={{
        background: 'rgba(var(--felt-ink-rgb),0.04)',
        border: '1px solid rgba(var(--felt-ink-rgb),0.08)',
      }}
    >
      <div>
        <p className="text-sm font-semibold text-mj-bone">{title}</p>
        <p className="text-xs text-mj-bone/45 mt-0.5">{desc}</p>
      </div>
      {children}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function CustomizePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const {
    felt,
    tilePalette,
    soundEnabled,
    tileSize,
    autoSortDrawnTile,
    setFelt,
    setTilePalette,
    setSoundEnabled,
    setTileSize,
    setAutoSortDrawnTile,
  } = useThemeStore();

  return (
    <ScreenShell title={t('customize')} onBack={() => navigate('/home')}>
      <div className="px-4 pt-4 pb-10 space-y-8">
        {/* ── Section 1: Table felt ─────────────────────────────────────────── */}
        <section aria-labelledby="felt-heading">
          <SectionLabel>{t('customizeFeltTitle')}</SectionLabel>
          <div className="grid grid-cols-5 gap-3">
            {FELT_OPTIONS.map(({ id, key }) => (
              <FeltSwatch
                key={id}
                id={id}
                label={t(key)}
                selected={felt === id}
                onSelect={() => setFelt(id)}
              />
            ))}
          </div>
        </section>

        {/* ── Section 2: Tile face palette ──────────────────────────────────── */}
        <section aria-labelledby="palette-heading">
          <SectionLabel>{t('customizePaletteTitle')}</SectionLabel>
          <div className="flex gap-2">
            {PALETTE_OPTIONS.map(({ id, key }) => (
              <PaletteCard
                key={id}
                id={id}
                label={t(key)}
                selected={tilePalette === id}
                onSelect={() => setTilePalette(id)}
              />
            ))}
          </div>

          {/* Live tile preview using SVG textures */}
          <div
            className="mt-3 rounded-xl p-3 flex gap-1.5 justify-center flex-wrap"
            style={{
              background: 'rgba(var(--felt-ink-rgb),0.04)',
              border: '1px solid rgba(var(--felt-ink-rgb),0.07)',
            }}
          >
            {PREVIEW_TILES.map((tile) => (
              <MahjongTile2D key={tile} tile={tile} size="sm" />
            ))}
          </div>
        </section>

        {/* ── Section 3: Hand tile size ─────────────────────────────────────── */}
        <section aria-labelledby="tile-size-heading">
          <SectionLabel>{t('customizeTileSizeTitle')}</SectionLabel>
          <div className="flex gap-2">
            {TILE_SIZE_OPTIONS.map(({ id, key }) => (
              <TileSizeChip
                key={id}
                label={t(key)}
                selected={tileSize === id}
                onSelect={() => setTileSize(id)}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-center text-mj-bone/40">
            {t('customizeTileSizeDesc')}
          </p>
        </section>

        {/* ── Section 4: Sound ─────────────────────────────────────────────── */}
        <section aria-labelledby="sound-heading">
          <SectionLabel>{t('customizeSoundTitle')}</SectionLabel>
          <PrefRow title={t('customizeSoundTitle')} desc={t('customizeSoundDesc')}>
            <TogglePill
              enabled={soundEnabled}
              onToggle={() => setSoundEnabled(!soundEnabled)}
              ariaLabel={t('customizeSoundTitle')}
            />
          </PrefRow>
          <p
            className="mt-2 text-[11px] text-center"
            style={{ color: soundEnabled ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.3)' }}
          >
            {soundEnabled ? t('customizeSoundOn') : t('customizeSoundOff')}
          </p>
        </section>

        {/* ── Section 5: Auto-sort drawn tile ───────────────────────────────── */}
        <section aria-labelledby="autosort-heading">
          <SectionLabel>{t('customizeAutoSortTitle')}</SectionLabel>
          <PrefRow title={t('customizeAutoSortTitle')} desc={t('customizeAutoSortDesc')}>
            <TogglePill
              enabled={autoSortDrawnTile}
              onToggle={() => setAutoSortDrawnTile(!autoSortDrawnTile)}
              ariaLabel={t('customizeAutoSortTitle')}
            />
          </PrefRow>
        </section>
      </div>
    </ScreenShell>
  );
}
