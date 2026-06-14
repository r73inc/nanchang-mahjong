/**
 * LearnPage — Nanchang Mahjong rules reference.
 *
 * Route: /learn
 *
 * Six tabs: Overview · Tiles · Spirit · Gameplay · Hands · Scoring.
 * Each section uses MahjongTile examples to illustrate concepts visually.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScreenShell } from '../../components/ui/screen-shell';
import { MahjongTile2D } from '../../components/2d/MahjongTile2D';
import { useI18n } from '../../i18n';
import type { StringKey } from '../../i18n/strings';
import type { TileType } from '@nanchang/shared';

// ── Tab definitions ───────────────────────────────────────────────────────────

type Tab = 'overview' | 'tiles' | 'spirit' | 'gameplay' | 'hands' | 'scoring';

const TABS: { id: Tab; key: StringKey }[] = [
  { id: 'overview', key: 'learnTabOverview' },
  { id: 'tiles', key: 'learnTabTiles' },
  { id: 'spirit', key: 'learnTabSpirit' },
  { id: 'gameplay', key: 'learnTabGameplay' },
  { id: 'hands', key: 'learnTabHands' },
  { id: 'scoring', key: 'learnTabScoring' },
];

// ── Tile example data (outside JSX so no-literal-string rule is satisfied) ───

const CHARS: TileType[] = ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m'];
const DOTS: TileType[] = ['1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p'];
const BAMB: TileType[] = ['1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s'];
const WINDS: TileType[] = ['east', 'south', 'west', 'north'];
const DRAGS: TileType[] = ['zhong', 'fa', 'bai'];

const OVERVIEW_EXAMPLE: TileType[][] = [
  ['1m', '2m', '3m'],
  ['7p', '7p', '7p'],
  ['zhong', 'zhong'],
];

const STANDARD_HAND: TileType[][] = [
  ['1m', '2m', '3m'],
  ['7p', '7p', '7p'],
  ['5s', '6s', '7s'],
  ['east', 'east', 'east'],
  ['zhong', 'zhong'],
];

const SEVEN_PAIRS_HAND: TileType[] = [
  '1m',
  '1m',
  '5p',
  '5p',
  '9s',
  '9s',
  'east',
  'east',
  'south',
  'south',
  'zhong',
  'zhong',
  'fa',
  'fa',
];

const ALL_TRIPLETS_HAND: TileType[][] = [
  ['2m', '2m', '2m'],
  ['6p', '6p', '6p'],
  ['4s', '4s', '4s'],
  ['north', 'north', 'north'],
  ['bai', 'bai'],
];

const THIRTEEN_HAND: TileType[] = [
  '1m',
  '4m',
  '7m',
  '1p',
  '4p',
  '7p',
  '1s',
  '4s',
  '7s',
  'east',
  'south',
  'west',
  'zhong',
  'fa',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-bold text-mj-bone mb-1">{children as string}</h2>;
}

function BodyText({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-mj-bone/70 leading-relaxed">{children as string}</p>;
}

function TileRow({
  tiles,
  label,
  highlight,
}: {
  tiles: TileType[];
  label?: string;
  highlight?: Set<number>;
}) {
  return (
    <div className="mt-2">
      {label && (
        <p className="text-[10px] font-bold tracking-widest uppercase text-mj-bone/40 mb-1">
          {label}
        </p>
      )}
      <div className="flex flex-wrap gap-0.5">
        {tiles.map((tile, i) => (
          <div
            key={i}
            style={
              highlight?.has(i) ? { boxShadow: '0 0 0 2px #c9a961', borderRadius: 5 } : undefined
            }
          >
            <MahjongTile2D tile={tile} size="xs" />
          </div>
        ))}
      </div>
    </div>
  );
}

function MeldRow({ melds, label }: { melds: TileType[][]; label?: string }) {
  return (
    <div className="mt-2">
      {label && (
        <p className="text-[10px] font-bold tracking-widest uppercase text-mj-bone/40 mb-1">
          {label}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {melds.map((meld, mi) => (
          <div key={mi} className="flex gap-0.5">
            {meld.map((tile, ti) => (
              <MahjongTile2D key={ti} tile={tile} size="xs" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-3 mb-3"
      style={{
        background: 'rgba(var(--felt-ink-rgb),0.04)',
        border: '1px solid rgba(var(--felt-ink-rgb),0.08)',
      }}
    >
      {children}
    </div>
  );
}

function StatPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-block px-3 py-1.5 rounded-xl text-xs font-bold text-mj-gold"
      style={{
        background: 'rgba(201,169,97,0.12)',
        border: '1px solid rgba(201,169,97,0.25)',
      }}
    >
      {children as string}
    </span>
  );
}

// ── Section: Overview ─────────────────────────────────────────────────────────

function OverviewSection() {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div>
        <SectionTitle>{t('learnOverviewTitle')}</SectionTitle>
        <BodyText>{t('learnOverviewBody')}</BodyText>
      </div>
      <div className="flex gap-2 flex-wrap">
        <StatPill>{t('learnOverviewPlayers')}</StatPill>
        <StatPill>{t('learnOverviewTileCount')}</StatPill>
        <StatPill>{t('learnOverviewRounds')}</StatPill>
      </div>
      <MeldRow melds={OVERVIEW_EXAMPLE} />
    </div>
  );
}

// ── Section: Tiles ────────────────────────────────────────────────────────────

function TilesSection() {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <Card>
        <SectionTitle>{t('learnTilesSuitsTitle')}</SectionTitle>
        <BodyText>{t('learnTilesSuitsDesc')}</BodyText>
        <TileRow tiles={CHARS.slice(0, 5)} />
        <TileRow tiles={DOTS.slice(0, 5)} />
        <TileRow tiles={BAMB.slice(0, 5)} />
      </Card>
      <Card>
        <SectionTitle>{t('learnTilesHonorsTitle')}</SectionTitle>
        <BodyText>{t('learnTilesHonorsDesc')}</BodyText>
        <TileRow tiles={[...WINDS, ...DRAGS]} />
      </Card>
      <p className="text-[11px] text-mj-bone/40 italic">{t('learnTilesNoFlowers')}</p>
    </div>
  );
}

// ── Section: Spirit ───────────────────────────────────────────────────────────

const SPIRIT_PRIMARY: TileType = '5m';
const SPIRIT_SECONDARY: TileType = '6m';

function SpiritSection() {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <BodyText>{t('learnSpiritBody')}</BodyText>
      <Card>
        <div className="flex gap-6 items-start">
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-mj-gold/70 mb-1.5">
              {t('learnSpiritPrimaryLabel')}
            </p>
            <div
              style={{
                boxShadow: '0 0 0 2px #c9a961, 0 4px 10px rgba(201,169,97,0.4)',
                borderRadius: 6,
              }}
            >
              <MahjongTile2D tile={SPIRIT_PRIMARY} size="sm" />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-mj-bone/40 mb-1.5">
              {t('learnSpiritSecondaryLabel')}
            </p>
            <div
              style={{ boxShadow: '0 0 0 1.5px rgba(var(--felt-ink-rgb),0.4)', borderRadius: 6 }}
            >
              <MahjongTile2D tile={SPIRIT_SECONDARY} size="sm" />
            </div>
          </div>
        </div>
      </Card>
      <Card>
        <BodyText>{t('learnSpiritWildcard')}</BodyText>
      </Card>
      <Card>
        <BodyText>{t('learnSpiritPayouts')}</BodyText>
        <div className="mt-2 pt-2 border-t border-mj-bone/8">
          <p className="text-xs font-bold text-mj-gold">{t('learnSpiritExplosiveLabel')}</p>
          <p className="text-xs text-mj-bone/60 mt-0.5">{t('learnSpiritExplosiveDesc')}</p>
        </div>
      </Card>
    </div>
  );
}

// ── Section: Gameplay ─────────────────────────────────────────────────────────

const CHOW_EXAMPLE: TileType[] = ['3s', '4s', '5s'];
const PUNG_EXAMPLE: TileType[] = ['east', 'east', 'east'];
const KONG_EXAMPLE: TileType[] = ['zhong', 'zhong', 'zhong', 'zhong'];
const HONOR_CHOW: TileType[] = ['east', 'south', 'west'];

function MeldCard({ title, desc, tiles }: { title: string; desc: string; tiles: TileType[] }) {
  return (
    <Card>
      <p className="text-sm font-bold text-mj-bone mb-1">{title}</p>
      <BodyText>{desc}</BodyText>
      <div className="flex gap-0.5 mt-2">
        {tiles.map((t, i) => (
          <MahjongTile2D key={i} tile={t} size="xs" />
        ))}
      </div>
    </Card>
  );
}

function GameplaySection() {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <BodyText>{t('learnGameplayBody')}</BodyText>
      <div
        className="rounded-xl px-3 py-2 text-xs font-bold text-mj-gold"
        style={{ background: 'rgba(201,169,97,0.1)', border: '1px solid rgba(201,169,97,0.3)' }}
      >
        {t('learnGameplayPriority')}
      </div>
      <MeldCard
        title={t('learnGameplayChowTitle')}
        desc={t('learnGameplayChowDesc')}
        tiles={CHOW_EXAMPLE}
      />
      <Card>
        <p className="text-sm font-bold text-mj-bone mb-1">{t('learnGameplayChowTitle')}</p>
        <p className="text-[11px] text-mj-bone/50 mb-1.5">{t('learnGameplayHonorChowNote')}</p>
        <div className="flex gap-0.5">
          {HONOR_CHOW.map((tile, i) => (
            <MahjongTile2D key={i} tile={tile} size="xs" />
          ))}
        </div>
      </Card>
      <MeldCard
        title={t('learnGameplayPungTitle')}
        desc={t('learnGameplayPungDesc')}
        tiles={PUNG_EXAMPLE}
      />
      <MeldCard
        title={t('learnGameplayKongTitle')}
        desc={t('learnGameplayKongDesc')}
        tiles={KONG_EXAMPLE}
      />
    </div>
  );
}

// ── Section: Hands ────────────────────────────────────────────────────────────

function HandCard({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <p className="text-sm font-bold text-mj-bone">{title}</p>
      <BodyText>{desc}</BodyText>
      {children}
    </Card>
  );
}

function HandsSection() {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <HandCard title={t('learnHandsStandardTitle')} desc={t('learnHandsStandardDesc')}>
        <MeldRow melds={STANDARD_HAND} />
      </HandCard>
      <HandCard title={t('learnHandsSevenPairsTitle')} desc={t('learnHandsSevenPairsDesc')}>
        <TileRow tiles={SEVEN_PAIRS_HAND.slice(0, 7)} />
      </HandCard>
      <HandCard title={t('learnHandsBigSevenPairsTitle')} desc={t('learnHandsBigSevenPairsDesc')}>
        <MeldRow melds={ALL_TRIPLETS_HAND} />
      </HandCard>
      <HandCard title={t('learnHandsThirteenTitle')} desc={t('learnHandsThirteenDesc')}>
        <TileRow tiles={THIRTEEN_HAND.slice(0, 9)} />
        <div
          className="mt-2 rounded-lg px-2.5 py-2 text-xs text-mj-gold/80 leading-snug"
          style={{ background: 'rgba(201,169,97,0.08)', border: '1px solid rgba(201,169,97,0.2)' }}
        >
          {t('learnHandsThirteenTip')}
        </div>
      </HandCard>
      <HandCard title={t('learnHandsSevenStarTitle')} desc={t('learnHandsSevenStarDesc')}>
        <TileRow tiles={[...WINDS, ...DRAGS]} />
      </HandCard>
    </div>
  );
}

// ── Section: Scoring ──────────────────────────────────────────────────────────

function ScoreRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-mj-bone/5 last:border-0">
      {children}
    </div>
  );
}

function ScoringSection() {
  const { t } = useI18n();
  const rows: { label: string; icon: string }[] = [
    { label: t('learnScoringDiscard'), icon: '→' },
    { label: t('learnScoringSelfdraw'), icon: '↺' },
    { label: t('learnScoringDealer'), icon: '★' },
    { label: t('learnScoringKong'), icon: '杠' },
    { label: t('learnScoringGerman'), icon: '德' },
  ];
  return (
    <div className="space-y-3">
      <div
        className="rounded-xl px-3 py-2 text-sm font-bold text-mj-gold"
        style={{ background: 'rgba(201,169,97,0.1)', border: '1px solid rgba(201,169,97,0.3)' }}
      >
        {t('learnScoringBase')}
      </div>
      <Card>
        {rows.map(({ label, icon }) => (
          <ScoreRow key={label}>
            <span
              className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center font-serif text-xs font-bold"
              style={{ background: 'rgba(201,169,97,0.15)', color: '#c9a961' }}
            >
              {icon}
            </span>
            <p className="text-sm text-mj-bone/75 leading-snug">{label}</p>
          </ScoreRow>
        ))}
      </Card>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function LearnPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const renderSection = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewSection />;
      case 'tiles':
        return <TilesSection />;
      case 'spirit':
        return <SpiritSection />;
      case 'gameplay':
        return <GameplaySection />;
      case 'hands':
        return <HandsSection />;
      case 'scoring':
        return <ScoringSection />;
    }
  };

  return (
    <ScreenShell title={t('learnTitle')} onBack={() => navigate(-1)}>
      {/* Tab bar */}
      <div
        className="flex overflow-x-auto gap-1 px-4 pt-3 pb-2 shrink-0"
        style={{ scrollbarWidth: 'none' }}
        role="tablist"
        aria-label={t('learnTitle')}
      >
        {TABS.map(({ id, key }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(id)}
              className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors"
              style={{
                background: isActive ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.07)',
                color: isActive ? '#1f2937' : 'rgba(var(--felt-ink-rgb),0.55)',
                border: isActive ? 'none' : '1px solid rgba(var(--felt-ink-rgb),0.1)',
              }}
            >
              {t(key)}
            </button>
          );
        })}
      </div>

      {/* Section content */}
      <div
        className="flex-1 overflow-y-auto px-4 pb-10 pt-3"
        role="tabpanel"
        aria-label={t(TABS.find((tab) => tab.id === activeTab)!.key)}
      >
        {renderSection()}
      </div>
    </ScreenShell>
  );
}
