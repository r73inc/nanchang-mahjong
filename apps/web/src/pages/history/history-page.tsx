import { useNavigate } from 'react-router-dom';
import { ScreenShell } from '../../components/ui/screen-shell';
import { useI18n } from '../../i18n';
import { useGameHistory } from '../../hooks/use-history';
import type { GameHistoryItem } from '../../hooks/use-history';

// ── i18n helpers ──────────────────────────────────────────────────────────────

const RESULT_KEY = {
  win: 'historyResultWin',
  draw: 'historyResultDraw',
  concede: 'historyResultConcede',
  bust: 'historyResultBust',
} as const;

const PLACEMENT_KEY = {
  1: 'historyPlacement1',
  2: 'historyPlacement2',
  3: 'historyPlacement3',
  4: 'historyPlacement4',
} as const;

/** Tile glyph used as a decorative visual in the empty state. */
const TILE_GLYPH = '牌'; // 牌

const RESULT_COLOR: Record<GameHistoryItem['result'], string> = {
  win: '#7fc299',
  draw: 'rgba(var(--felt-ink-rgb),0.5)',
  concede: '#e88080',
  bust: '#e88080',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="rounded-xl px-4 py-3 animate-pulse"
      style={{
        background: 'rgba(var(--felt-ink-rgb),0.04)',
        border: '1px solid rgba(var(--felt-ink-rgb),0.06)',
      }}
      aria-hidden="true"
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div
            className="h-3 w-20 rounded"
            style={{ background: 'rgba(var(--felt-ink-rgb),0.08)' }}
          />
          <div
            className="h-2.5 w-14 rounded"
            style={{ background: 'rgba(var(--felt-ink-rgb),0.05)' }}
          />
        </div>
        <div
          className="h-5 w-12 rounded"
          style={{ background: 'rgba(var(--felt-ink-rgb),0.06)' }}
        />
      </div>
    </div>
  );
}

function GameCard({ item, onReplay }: { item: GameHistoryItem; onReplay: () => void }) {
  const { t } = useI18n();

  const date = new Date(item.endedAt);
  const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const dateLine = `${dateStr} · ${timeStr}`;

  const scoreDisplay = item.finalScore >= 0 ? `+${item.finalScore}` : String(item.finalScore);

  return (
    <button
      onClick={onReplay}
      className="w-full rounded-xl px-4 py-3 text-left"
      style={{
        background: 'rgba(var(--felt-ink-rgb),0.04)',
        border: '1px solid rgba(var(--felt-ink-rgb),0.06)',
      }}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: RESULT_COLOR[item.result] }}>
              {t(RESULT_KEY[item.result])}
            </span>
            <span
              className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
              style={{
                background: 'rgba(201,169,97,0.12)',
                color: item.placement === 1 ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.5)',
              }}
            >
              {t(PLACEMENT_KEY[item.placement])}
            </span>
          </div>
          <p className="text-[11px] text-mj-bone/40 mt-0.5">{dateLine}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-base font-bold font-mono"
            style={{ color: item.finalScore >= 0 ? '#7fc299' : '#e88080' }}
            aria-label={`score ${scoreDisplay}`}
          >
            {scoreDisplay}
          </span>
          <span className="text-[10px] font-bold text-mj-gold/60 tracking-wide">
            {t('historyViewReplay')} →
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function HistoryPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useGameHistory();

  const allGames = data?.pages.flatMap((p) => p.games) ?? [];

  return (
    <ScreenShell title={t('historyTitle')} onBack={() => navigate(-1)}>
      <div className="px-4 pt-4 space-y-2">
        {/* Loading state */}
        {isLoading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {/* Empty state */}
        {!isLoading && allGames.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-5 pt-16 text-center px-4">
            <p className="text-4xl opacity-30" aria-hidden="true">
              {TILE_GLYPH}
            </p>
            <p className="text-sm text-mj-bone/50">{t('historyEmpty')}</p>
            <button
              onClick={() => navigate('/lobby')}
              className="mt-2 px-6 py-2.5 rounded-full text-sm font-bold text-mj-ink"
              style={{
                background: 'linear-gradient(180deg,#c9a961 0%,#a88a45 100%)',
                boxShadow: '0 4px 12px rgba(201,169,97,0.3)',
              }}
            >
              {t('historyPlayMore')}
            </button>
          </div>
        )}

        {/* Game list */}
        {allGames.map((item) => (
          <GameCard
            key={item.gameId}
            item={item}
            onReplay={() => navigate(`/replay/${item.gameId}`)}
          />
        ))}

        {/* Load more */}
        {hasNextPage && (
          <button
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full py-3 text-sm text-mj-bone/50 disabled:opacity-40"
          >
            {isFetchingNextPage ? t('loading') : t('historyLoadMore')}
          </button>
        )}
      </div>
    </ScreenShell>
  );
}
