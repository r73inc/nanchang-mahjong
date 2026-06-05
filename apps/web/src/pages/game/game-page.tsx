/**
 * GamePage — full real-time game screen.
 *
 * Route: /game/:id
 *
 * Phase E: The DOM compass tile layout has been replaced by a React Three
 * Fiber 3D canvas (GameCanvas). All DOM overlays are preserved as
 * `position: absolute` elements layered on top of the canvas.
 *
 * Sub-screens by snapshot.phase:
 *   jing_reveal       → JingRevealScreen  (pure DOM)
 *   playing / awaiting_claims → GameTable  (3D canvas + DOM overlays)
 *   finished          → GameEndScreen     (pure DOM)
 *   null (loading)    → LoadingScreen     (pure DOM)
 *
 * Accessibility: an sr-only AccessibleHand renders the viewer's tiles as
 * DOM buttons so screen readers and automated tests can interact with them.
 * The 3D canvas itself is aria-hidden (decorative — the DOM layer is the
 * accessible interface).
 */

import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useState, useCallback, useEffect } from 'react';
import { useGame } from '../../hooks/use-game';
import { MahjongTile } from '../../components/mahjong-tile';
import { useI18n } from '../../i18n';
import { tileAriaLabel, engineToDesignTile } from '@nanchang/shared';
import type { ClientGameState, TileType, SeatWind, GameEndedPayload } from '@nanchang/shared';
import type { ClaimWindowState } from '../../stores/game.store';
import { GameCanvas } from '../../r3f/GameCanvas';

// ── Seat compass helpers ──────────────────────────────────────────────────────

function getCompassSeats(viewerSeat: 0 | 1 | 2 | 3) {
  return {
    right: ((viewerSeat + 1) % 4) as 0 | 1 | 2 | 3,
    across: ((viewerSeat + 2) % 4) as 0 | 1 | 2 | 3,
    left: ((viewerSeat + 3) % 4) as 0 | 1 | 2 | 3,
  };
}

const WIND_CHAR: Record<SeatWind, string> = { east: '東', south: '南', west: '西', north: '北' };
const WIND_COLOR: Record<SeatWind, string> = {
  east: '#c9a961',
  south: '#a36d3e',
  west: '#5a7d8c',
  north: '#7d4f4f',
};

// ── Sub-screens ───────────────────────────────────────────────────────────────

function LoadingScreen() {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center h-dvh bg-mj-bg-page">
      <p className="text-mj-bone/50 text-sm">{t('loading')}</p>
    </div>
  );
}

function JingRevealScreen({
  snapshot,
  isHost,
  onReveal,
}: {
  snapshot: ClientGameState;
  isHost: boolean;
  onReveal: () => void;
}) {
  const { t } = useI18n();
  const indicatorTile = snapshot.jingIndicator;

  return (
    <div
      className="flex flex-col items-center justify-center gap-8 min-h-dvh px-8 text-center bg-mj-bg-page"
      aria-label={t('gameSpiritTiles')}
    >
      <div>
        <p className="text-[11px] font-bold tracking-widest text-mj-gold/70 uppercase mb-1">
          {t('gameSpirit')}
        </p>
        <h1 className="text-2xl font-serif font-bold text-mj-bone">{t('gameSpiritTiles')}</h1>
      </div>

      {indicatorTile && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-xs text-mj-bone/50">{t('gameSpirit')}</p>
          <MahjongTile tile={indicatorTile} size="lg" isJing />
        </div>
      )}

      <p className="text-sm text-mj-bone/60 max-w-[260px]">
        {isHost ? t('gameRevealSpirit') : t('gameWaitingReveal')}
      </p>

      {isHost ? (
        <button
          onClick={onReveal}
          className="px-8 py-3.5 rounded-full font-bold text-sm text-mj-ink"
          style={{
            background: 'linear-gradient(180deg,#c9a961 0%,#a88a45 100%)',
            boxShadow: '0 6px 18px rgba(201,169,97,0.35)',
          }}
        >
          {t('gameRevealSpirit')} →
        </button>
      ) : (
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-mj-gold/40 animate-pulse"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const PLACEMENT_KEY = {
  1: 'endGamePlacement1',
  2: 'endGamePlacement2',
  3: 'endGamePlacement3',
  4: 'endGamePlacement4',
} as const;

function GameEndScreen({
  snapshot,
  ended,
  viewerSeat,
  onHome,
  onRematch,
}: {
  snapshot: ClientGameState;
  ended: GameEndedPayload | null;
  viewerSeat: 0 | 1 | 2 | 3 | null;
  onHome: () => void;
  onRematch: () => void;
}) {
  const { t } = useI18n();
  const scores = snapshot.seats.map((s) => s.score);
  const sorted = [...scores].sort((a, b) => b - a);
  const myScore = viewerSeat !== null ? scores[viewerSeat] : null;
  const iWon = myScore !== null && myScore === sorted[0];
  const myPlacement = viewerSeat !== null && ended ? ended.placement[viewerSeat] : null;
  const myRatingDelta =
    viewerSeat !== null && ended?.ratingDeltas ? ended.ratingDeltas[viewerSeat] : null;

  return (
    <div className="flex flex-col items-center justify-center gap-6 min-h-dvh px-8 text-center bg-mj-bg-page">
      {myPlacement && (
        <p
          className="text-[13px] font-bold tracking-widest uppercase"
          style={{ color: myPlacement === 1 ? '#c9a961' : 'rgba(245,239,223,0.4)' }}
        >
          {t(PLACEMENT_KEY[myPlacement])}
        </p>
      )}

      <h1 className="text-3xl font-serif font-bold" style={{ color: iWon ? '#7fc299' : '#f5efdf' }}>
        {iWon ? t('gameYouWin') : t('gameSessionEnd')}
      </h1>

      {myRatingDelta !== null && (
        <p
          className="text-sm font-mono font-bold"
          style={{ color: myRatingDelta >= 0 ? '#7fc299' : '#e88080' }}
          aria-label={t('endGameRatingDelta')}
        >
          {myRatingDelta >= 0 ? '+' : ''}
          {myRatingDelta} {t('endGameRatingDelta')}
        </p>
      )}

      <div
        className="w-full max-w-[300px] rounded-xl p-4 space-y-2"
        style={{ background: 'rgba(245,239,223,0.05)', border: '1px solid rgba(245,239,223,0.1)' }}
      >
        <p className="text-xs font-bold tracking-widest text-mj-gold/70 uppercase mb-3">
          {t('gameFinalScores')}
        </p>
        {snapshot.seats.map((seat, i) => {
          const seatPlacement = ended ? ended.placement[i] : null;
          return (
            <div key={i} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: WIND_COLOR[seat.wind] }}
                />
                <span className="text-mj-bone/70">{WIND_CHAR[seat.wind]}</span>
                {seatPlacement && (
                  <span
                    className="text-[10px] font-bold"
                    style={{ color: seatPlacement === 1 ? '#c9a961' : 'rgba(245,239,223,0.3)' }}
                  >
                    #{seatPlacement}
                  </span>
                )}
                {i === viewerSeat && (
                  <span className="text-[10px] text-mj-gold/60">{t('youSuffix')}</span>
                )}
              </div>
              <span
                className="font-bold font-mono"
                style={{ color: seat.score >= 0 ? '#7fc299' : '#e88080' }}
              >
                {seat.score >= 0 ? '+' : ''}
                {seat.score}
              </span>
            </div>
          );
        })}
      </div>

      {ended && (
        <p className="text-xs text-mj-bone/40">
          {t('endGameHandsPlayed').replace('{{0}}', String(ended.handsPlayed))}
        </p>
      )}

      <div className="flex flex-col gap-3 w-full max-w-[280px]">
        {viewerSeat === 0 && (
          <button
            onClick={onRematch}
            className="px-8 py-3.5 rounded-full font-bold text-sm text-mj-ink"
            style={{
              background: 'linear-gradient(180deg,#c9a961 0%,#a88a45 100%)',
              boxShadow: '0 6px 18px rgba(201,169,97,0.35)',
            }}
          >
            {t('endGameRematch')}
          </button>
        )}
        <button
          onClick={onHome}
          className="px-8 py-3 rounded-full text-sm font-bold text-mj-bone/80"
          style={{ border: '1px solid rgba(245,239,223,0.2)' }}
        >
          {t('gamePlayAgain')}
        </button>
      </div>
    </div>
  );
}

// ── DOM overlays ──────────────────────────────────────────────────────────────

/** Single-seat nameplate chip — wind dot, dealer badge, score, AFK/disconnect. */
function Nameplate({
  seat,
  seatIdx,
  snapshot,
  compact = false,
}: {
  seat: (typeof snapshot.seats)[0];
  seatIdx: number;
  snapshot: ClientGameState;
  compact?: boolean;
}) {
  const isActive = snapshot.currentSeat === seatIdx;
  const isDealer = snapshot.dealerSeat === seatIdx;
  const { t } = useI18n();

  return (
    <div
      className={[
        'flex items-center gap-1.5 px-2 py-1 rounded-md',
        compact ? 'text-[10px]' : 'text-xs',
      ].join(' ')}
      style={{
        background: isActive ? 'rgba(201,169,97,0.18)' : 'rgba(245,239,223,0.05)',
        border: `1px solid ${isActive ? 'rgba(201,169,97,0.5)' : 'rgba(245,239,223,0.1)'}`,
        boxShadow: isActive ? '0 0 8px rgba(201,169,97,0.2)' : 'none',
      }}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: WIND_COLOR[seat.wind] }}
      />
      {isDealer && (
        <span
          className="text-[9px] font-bold px-1 rounded shrink-0"
          style={{ background: 'rgba(201,169,97,0.3)', color: '#c9a961' }}
        >
          {t('gameDealerBadge')}
        </span>
      )}
      <span className="text-mj-bone/60 font-mono tabular-nums">{seat.score}</span>
      {seat.afk && (
        <span className="text-mj-loss-light text-[9px] ml-1">{t('gameWaitingTurn')}</span>
      )}
      {!seat.connected && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-mj-loss shrink-0"
          title={t('gameReconnecting')}
        />
      )}
    </div>
  );
}

/**
 * Four corner HUD nameplates — replaces the DOM compass nameplate chips that
 * lived inside the old tile layout.
 */
function SeatHUD({ snapshot }: { snapshot: ClientGameState }) {
  const viewerSeat = (snapshot.viewerSeat ?? 0) as 0 | 1 | 2 | 3;
  const { right: rightSeat, across: acrossSeat, left: leftSeat } = getCompassSeats(viewerSeat);

  return (
    <>
      {/* Across — top center (below the status bar) */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <Nameplate
          seat={snapshot.seats[acrossSeat]}
          seatIdx={acrossSeat}
          snapshot={snapshot}
          compact
        />
      </div>
      {/* Right — right edge, vertically centered */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
        <Nameplate
          seat={snapshot.seats[rightSeat]}
          seatIdx={rightSeat}
          snapshot={snapshot}
          compact
        />
      </div>
      {/* Left — left edge, vertically centered */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
        <Nameplate seat={snapshot.seats[leftSeat]} seatIdx={leftSeat} snapshot={snapshot} compact />
      </div>
      {/* Viewer — bottom, just above the claim rail area */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <Nameplate
          seat={snapshot.seats[viewerSeat]}
          seatIdx={viewerSeat}
          snapshot={snapshot}
          compact
        />
      </div>
    </>
  );
}

/**
 * Visually hidden hand buttons — provides an accessible DOM interface for the
 * viewer's tiles so screen readers and automated tests can interact.
 * The 3D canvas tile meshes are the visual representation; these are the
 * accessible one.
 */
function AccessibleHand({
  hand,
  selectedTileIdx,
  onSelect,
  onDiscard,
  isMyTurn,
}: {
  hand: TileType[];
  selectedTileIdx: number | null;
  onSelect: (idx: number) => void;
  onDiscard: (tile: TileType) => void;
  isMyTurn: boolean;
}) {
  const { lang } = useI18n();

  return (
    <div className="sr-only" role="group" aria-label="Your hand">
      {hand.map((tile, idx) => (
        <button
          key={`accessible-${tile}-${idx}`}
          aria-label={tileAriaLabel(tile, lang)}
          aria-pressed={selectedTileIdx === idx}
          data-tile={engineToDesignTile(tile)}
          onClick={() => {
            if (!isMyTurn) return;
            if (selectedTileIdx === idx) {
              onDiscard(tile);
            } else {
              onSelect(idx);
            }
          }}
        >
          {tileAriaLabel(tile, lang)}
        </button>
      ))}
    </div>
  );
}

/** Floating action toast — pung, chow, kong, win, concede announcements. */
function ActionToast({
  toast,
  snapshot,
}: {
  toast: import('../../stores/game.store').GameToast;
  snapshot: ClientGameState;
}) {
  const { t } = useI18n();

  const ACTION_LABEL: Record<string, string> = {
    pung: t('gameActionPung'),
    chow: t('gameActionChow'),
    kong_open: t('gameActionKong'),
    kong_concealed: t('gameActionKong'),
    kong_added: t('gameActionKong'),
    win: t('gameActionWin'),
    concede: t('gameActionConcede'),
    contested: '✗',
  };

  const seat = snapshot.seats[toast.seat];
  const label = ACTION_LABEL[toast.kind] ?? toast.kind;
  const isContested = toast.kind === 'contested';

  return (
    <div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div
        className="flex flex-col items-center gap-1 px-6 py-3 rounded-2xl animate-call-prompt-enter"
        style={{
          background: isContested ? 'rgba(10,10,10,0.8)' : 'rgba(10,10,10,0.88)',
          border: `1px solid ${isContested ? 'rgba(245,239,223,0.1)' : WIND_COLOR[seat.wind] + '66'}`,
          backdropFilter: 'blur(10px)',
          boxShadow: isContested ? 'none' : `0 8px 24px ${WIND_COLOR[seat.wind]}33`,
        }}
      >
        {!isContested && (
          <span
            className="text-[10px] font-bold tracking-widest uppercase"
            style={{ color: WIND_COLOR[seat.wind] }}
          >
            {WIND_CHAR[seat.wind]}
          </span>
        )}
        <span
          className="font-bold text-lg"
          style={{ color: isContested ? 'rgba(245,239,223,0.3)' : '#f5efdf' }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

/** Side rail claim-window overlay. */
function SideRail({
  claimWindow,
  onClaim,
  onPass,
}: {
  claimWindow: ClaimWindowState;
  onClaim: (kind: 'win' | 'pung' | 'kong' | 'chow', seq?: [TileType, TileType, TileType]) => void;
  onPass: () => void;
}) {
  const { t } = useI18n();
  const secLeft = Math.max(0, Math.ceil((claimWindow.deadline - Date.now()) / 1000));

  const CLAIM_LABELS: Record<string, string> = {
    win: t('gameWin'),
    pung: t('gamePung'),
    kong: t('gameKong'),
    chow: t('gameChow'),
  };

  const CLAIM_COLORS: Record<string, string> = {
    win: '#7fc299',
    pung: '#c9a961',
    kong: '#a36d3e',
    chow: '#5a7d8c',
  };

  return (
    <div
      className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-3 p-4 max-w-viewport mx-auto animate-call-prompt-enter z-20"
      style={{ background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(12px)' }}
      role="dialog"
      aria-label={t('gameClaimWindow')}
    >
      <p className="text-[10px] text-mj-bone/40">{t('gameClaimWindowDesc', String(secLeft))}</p>

      <div className="flex gap-3 w-full justify-center">
        {claimWindow.actions.map((action) => (
          <button
            key={action.kind}
            onClick={() => {
              const seq = action.sequences?.[0];
              onClaim(action.kind, seq);
            }}
            className="flex-1 max-w-[80px] py-3 rounded-xl font-bold text-sm text-mj-ink"
            style={{
              background: CLAIM_COLORS[action.kind],
              boxShadow: `0 4px 12px ${CLAIM_COLORS[action.kind]}44`,
            }}
          >
            {CLAIM_LABELS[action.kind]}
          </button>
        ))}

        <button
          onClick={onPass}
          className="flex-1 max-w-[80px] py-3 rounded-xl font-bold text-sm text-mj-bone/60"
          style={{ border: '1px solid rgba(245,239,223,0.15)' }}
        >
          {t('gamePass')}
        </button>
      </div>
    </div>
  );
}

/** Reconnecting overlay. */
function ReconnectingOverlay() {
  const { t } = useI18n();
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center z-50"
      style={{ background: 'rgba(10,10,10,0.75)', backdropFilter: 'blur(8px)' }}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex gap-1.5 mb-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-mj-gold animate-pulse"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </div>
      <p className="font-bold text-mj-bone text-sm">{t('gameReconnecting')}</p>
      <p className="text-xs text-mj-bone/50 mt-1">{t('gameReconnectingDesc')}</p>
    </div>
  );
}

/** Concede confirmation sheet. */
function ConcedeSheet({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  return (
    <div
      className="absolute inset-0 z-40 flex items-end justify-center"
      style={{ background: 'rgba(10,10,10,0.6)' }}
    >
      <div
        className="w-full max-w-viewport rounded-t-xl p-6 pb-8 flex flex-col gap-4"
        style={{ background: '#1c1c1c', border: '1px solid rgba(245,239,223,0.1)' }}
        role="dialog"
        aria-label={t('gameConcedeTitle')}
      >
        <h2 className="font-bold text-lg text-mj-bone">{t('gameConcedeTitle')}</h2>
        <p className="text-sm text-mj-bone/60">{t('gameConcedeDesc')}</p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl font-bold text-sm text-mj-bone/70"
            style={{ border: '1px solid rgba(245,239,223,0.15)' }}
          >
            {t('gameConcedeCancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl font-bold text-sm"
            style={{ background: '#c0392b', color: '#f5efdf' }}
          >
            {t('gameConcedeConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Game Table ────────────────────────────────────────────────────────────────

/**
 * Full game screen — 3D canvas fills the viewport; DOM overlays layer on top.
 *
 * Layer order (z-index):
 *   0  GameCanvas (fills inset-0, no z-index)
 *   10 Status bar, SeatHUD, TurnIndicator
 *   20 SideRail (claim window)
 *   30 ActionToast
 *   40 ConcedeSheet
 *   50 ReconnectingOverlay
 */
function GameTable({
  snapshot,
  selectedTileIdx,
  claimWindow,
  toast,
  pendingMove,
  onSelect,
  onDiscard,
  onClaim,
  onPass,
  onConcede,
}: {
  snapshot: ClientGameState;
  selectedTileIdx: number | null;
  claimWindow: ClaimWindowState | null;
  toast: import('../../stores/game.store').GameToast | null;
  pendingMove: boolean;
  onSelect: (idx: number) => void;
  onDiscard: (tile: TileType) => void;
  onClaim: (kind: 'win' | 'pung' | 'kong' | 'chow', seq?: [TileType, TileType, TileType]) => void;
  onPass: () => void;
  onConcede: () => void;
}) {
  const { t } = useI18n();
  const [showConcedeSheet, setShowConcedeSheet] = useState(false);

  const viewerSeat = (snapshot.viewerSeat ?? 0) as 0 | 1 | 2 | 3;
  const isMyTurn = snapshot.currentSeat === viewerSeat && snapshot.phase === 'playing';
  const viewerHand = snapshot.seats[viewerSeat].hand ?? [];

  const handleConcede = () => {
    setShowConcedeSheet(false);
    onConcede();
  };

  return (
    <div className="relative w-full h-dvh overflow-hidden bg-black">
      {/* ── 3D canvas — fills entire screen ───────────────────────────────── */}
      <div className="absolute inset-0" aria-hidden="true">
        <GameCanvas
          snapshot={snapshot}
          selectedTileIdx={selectedTileIdx}
          onSelectTile={onSelect}
          onDiscard={onDiscard}
        />
      </div>

      {/* ── Status bar ─────────────────────────────────────────────────────── */}
      <div
        className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2"
        style={{
          background: 'rgba(10,10,10,0.7)',
          borderBottom: '1px solid rgba(245,239,223,0.08)',
        }}
      >
        {/* Round wind + Jing indicator */}
        <div className="flex items-center gap-3">
          <span
            className="text-xs font-bold font-serif"
            style={{ color: WIND_COLOR[snapshot.roundWind] }}
          >
            {WIND_CHAR[snapshot.roundWind]} {t('gameRound')}
          </span>
          {snapshot.jingPrimary && (
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-mj-gold/50">{t('gameSpirit')}</span>
              <MahjongTile tile={snapshot.jingPrimary} size="xs" isJing />
              {snapshot.jingSecondary && (
                <MahjongTile tile={snapshot.jingSecondary} size="xs" isJing />
              )}
            </div>
          )}
        </div>

        {/* Wall count */}
        <span className="text-[10px] text-mj-bone/50">
          {t('gameWallLeft')} {snapshot.wallCount}
        </span>

        {/* Concede button */}
        <button
          onClick={() => setShowConcedeSheet(true)}
          className="text-[10px] text-mj-bone/40 px-2 py-1 rounded"
          style={{ border: '1px solid rgba(245,239,223,0.1)' }}
        >
          {t('gameConcede')}
        </button>
      </div>

      {/* ── Seat HUD — corner nameplates ───────────────────────────────────── */}
      <SeatHUD snapshot={snapshot} />

      {/* ── Turn indicator ─────────────────────────────────────────────────── */}
      <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-0.5 pointer-events-none">
        <span
          className="text-[11px] font-bold px-3 py-1 rounded-full"
          style={{
            background: isMyTurn ? 'rgba(201,169,97,0.25)' : 'rgba(245,239,223,0.07)',
            color: isMyTurn ? '#c9a961' : 'rgba(245,239,223,0.6)',
            border: isMyTurn ? '1px solid rgba(201,169,97,0.4)' : '1px solid rgba(245,239,223,0.1)',
          }}
        >
          {isMyTurn
            ? t('gameYourTurn')
            : `${WIND_CHAR[snapshot.seats[snapshot.currentSeat].wind]} ${t('gameWaitingTurn')}`}
        </span>
        {!isMyTurn && snapshot.viewerSeat !== null && (
          <span className="text-[9px] text-mj-bone/30">
            {t('gameTurnsAway', String((snapshot.viewerSeat - snapshot.currentSeat + 4) % 4))}
          </span>
        )}
      </div>

      {/* ── Accessible hand — sr-only DOM buttons for a11y + tests ─────────── */}
      <AccessibleHand
        hand={viewerHand}
        selectedTileIdx={pendingMove ? null : selectedTileIdx}
        onSelect={onSelect}
        onDiscard={onDiscard}
        isMyTurn={isMyTurn && !pendingMove}
      />

      {/* ── Action toast ───────────────────────────────────────────────────── */}
      {toast && !showConcedeSheet && <ActionToast toast={toast} snapshot={snapshot} />}

      {/* ── Claim window rail ──────────────────────────────────────────────── */}
      {claimWindow && !showConcedeSheet && (
        <SideRail claimWindow={claimWindow} onClaim={onClaim} onPass={onPass} />
      )}

      {/* ── Concede sheet ──────────────────────────────────────────────────── */}
      {showConcedeSheet && (
        <ConcedeSheet onConfirm={handleConcede} onCancel={() => setShowConcedeSheet(false)} />
      )}

      {/* ── A11y live region ───────────────────────────────────────────────── */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" id="game-live-region">
        {isMyTurn ? t('gameYourTurn') : ''}
      </div>
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

export function GamePage() {
  const { id: gameId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const spectate = searchParams.get('spectate') === '1';

  const {
    snapshot,
    ended,
    rematchRoomCode,
    connection,
    selectedTileIdx,
    claimWindow,
    toast,
    pendingMove,
    selectTile,
    discard,
    claim,
    pass,
    concede,
    revealJing,
    requestRematch,
  } = useGame(gameId ?? '', spectate);

  const handleHome = useCallback(() => navigate('/lobby'), [navigate]);

  useEffect(() => {
    if (rematchRoomCode) {
      navigate(`/room/${rematchRoomCode}`);
    }
  }, [rematchRoomCode, navigate]);

  if (!gameId || !snapshot) {
    return <LoadingScreen />;
  }

  const viewerSeat = snapshot.viewerSeat;
  const isDealer = viewerSeat !== null && viewerSeat === snapshot.dealerSeat;

  return (
    <>
      {snapshot.phase === 'jing_reveal' && (
        <JingRevealScreen snapshot={snapshot} isHost={isDealer} onReveal={revealJing} />
      )}

      {(snapshot.phase === 'playing' || snapshot.phase === 'awaiting_claims') && (
        <GameTable
          snapshot={snapshot}
          selectedTileIdx={selectedTileIdx}
          claimWindow={claimWindow}
          toast={toast}
          pendingMove={pendingMove}
          onSelect={selectTile}
          onDiscard={discard}
          onClaim={claim}
          onPass={pass}
          onConcede={concede}
        />
      )}

      {snapshot.phase === 'finished' && (
        <GameEndScreen
          snapshot={snapshot}
          ended={ended}
          viewerSeat={viewerSeat}
          onHome={handleHome}
          onRematch={requestRematch}
        />
      )}

      {(snapshot.phase === 'dealing' ||
        !['jing_reveal', 'playing', 'awaiting_claims', 'finished'].includes(snapshot.phase)) && (
        <LoadingScreen />
      )}

      {connection === 'reconnecting' && <ReconnectingOverlay />}
    </>
  );
}
