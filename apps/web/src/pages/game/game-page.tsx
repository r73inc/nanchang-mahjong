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
import { useState, useCallback, useEffect, useRef } from 'react';
import { useGame } from '../../hooks/use-game';
import { MahjongTile } from '../../components/mahjong-tile';
import { useI18n } from '../../i18n';
import { tileAriaLabel, engineToDesignTile } from '@nanchang/shared';
import type { ClientGameState, TileType, SeatWind, GameEndedPayload } from '@nanchang/shared';
import type { ClaimWindowState, GameToast } from '../../stores/game.store';
import { GameCanvas } from '../../r3f/GameCanvas';
import { GameTable2D, MahjongTile2D } from '../../components/2d';
import { MobileLandscapeGate } from '../../components/2d/MobileLandscapeGate';
import { tileTexturePath } from '../../r3f/utils/tile-texture-map';
import { useOrientation } from '../../hooks/use-orientation';

// ── Seat compass helpers ──────────────────────────────────────────────────────

function getCompassSeats(viewerSeat: 0 | 1 | 2 | 3) {
  return {
    right: ((viewerSeat + 1) % 4) as 0 | 1 | 2 | 3,
    across: ((viewerSeat + 2) % 4) as 0 | 1 | 2 | 3,
    left: ((viewerSeat + 3) % 4) as 0 | 1 | 2 | 3,
  };
}

const WIND_CHAR: Record<SeatWind, string> = { east: '東', south: '南', west: '西', north: '北' };

// Module-level icon constants (avoids i18next/no-literal-string on JSX text nodes).
const ICON_HISTORY = '≡' as const;
const ICON_CLOSE = '✕' as const;
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
    <div className="flex flex-col items-center justify-center gap-3 h-dvh bg-mj-bg-page">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-mj-gold/60 animate-pulse"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </div>
      <p className="text-mj-bone/80 text-sm">{t('loading')}</p>
    </div>
  );
}

/**
 * Shown when the server emits an unrecoverable game:error (e.g. the game
 * session no longer exists after a server restart). Gives the user a clear
 * message and a route back to the lobby.
 */
function GameErrorScreen({ errorCode, onHome }: { errorCode: string; onHome: () => void }) {
  const { t } = useI18n();

  const errorMessage =
    errorCode === 'GAME_NOT_FOUND'
      ? t('gameErrorNotFound')
      : errorCode === 'NOT_IN_GAME'
        ? t('gameErrorNotInGame')
        : errorCode === 'TIMEOUT'
          ? t('gameErrorTimeout')
          : t('gameErrorGeneric');

  return (
    <div className="flex flex-col items-center justify-center gap-6 min-h-dvh px-8 text-center bg-mj-bg-page">
      <h1 className="text-2xl font-bold text-mj-bone">{t('gameErrorTitle')}</h1>
      <p className="text-sm text-mj-bone/60 max-w-[280px]">{errorMessage}</p>
      <p className="text-[10px] text-mj-bone/30 font-mono">{errorCode}</p>
      <button
        onClick={onHome}
        className="px-8 py-3.5 rounded-full font-bold text-sm text-mj-ink"
        style={{
          background: 'linear-gradient(180deg,#c9a961 0%,#a88a45 100%)',
          boxShadow: '0 6px 18px rgba(201,169,97,0.35)',
        }}
      >
        {t('gameErrorBackToLobby')}
      </button>
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
      {/* Viewer — above the hand HUD (which is ~90px tall at bottom-0) */}
      <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
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

  // ── Opening Spirit Flip settlement toast (special layout) ─────────────────
  if (toast.kind === 'opening_settlement') {
    const tile = toast.settlementTile;
    const delta = toast.settlementDelta ?? 0;
    const deltaLabel =
      delta > 0
        ? t('toastOpeningSettlementYouWin', String(delta))
        : delta < 0
          ? t('toastOpeningSettlementYouPay', String(Math.abs(delta)))
          : t('toastOpeningSettlementPush');
    const deltaColor = delta > 0 ? '#7fc299' : delta < 0 ? '#e07070' : 'rgba(245,239,223,0.5)';
    return (
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none"
        aria-live="assertive"
        aria-atomic="true"
      >
        <div
          className="flex flex-col items-center gap-1 px-6 py-3 rounded-2xl animate-call-prompt-enter"
          style={{
            background: 'rgba(10,10,10,0.90)',
            border: '1px solid rgba(201,169,97,0.5)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 24px rgba(201,169,97,0.2)',
          }}
        >
          <span className="text-[10px] font-bold tracking-widest uppercase text-mj-gold">
            {t('toastOpeningSettlement', tile ?? '')}
          </span>
          <span className="font-bold text-lg" style={{ color: deltaColor }}>
            {deltaLabel}
          </span>
        </div>
      </div>
    );
  }

  // ── Standard action toast ──────────────────────────────────────────────────
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
  isMobile = false,
}: {
  claimWindow: ClaimWindowState;
  onClaim: (kind: 'win' | 'pung' | 'kong' | 'chow', seq?: [TileType, TileType, TileType]) => void;
  onPass: () => void;
  isMobile?: boolean;
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
      className="absolute left-0 right-0 flex flex-col items-center gap-3 p-4 max-w-viewport mx-auto animate-call-prompt-enter z-20"
      style={{
        bottom: isMobile ? 'var(--mj-hand-height, 90px)' : 0,
        background: 'rgba(10,10,10,0.92)',
        backdropFilter: 'blur(12px)',
      }}
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

// ── History types ─────────────────────────────────────────────────────────────

interface HistoryEntry {
  id: number;
  kind: 'discard' | 'pung' | 'chow' | 'kong' | 'win' | 'concede';
  seatWind: SeatWind;
  /** Absolute seat index (0–3) — used to derive compass position relative to viewer. */
  seatIdx: number;
  tile?: TileType;
}

// ── SVG hand tile ─────────────────────────────────────────────────────────────

/**
 * Single tile rendered as an SVG image in the viewer's hand HUD.
 * Uses the same Regular SVG textures as the 3D tile face stamps, displayed
 * on an ivory background that matches the 3D tile body colour.
 */
function SvgHandTile({
  tile,
  isJing = false,
  isSelected = false,
  isDrawn = false,
}: {
  tile: TileType;
  isJing?: boolean;
  isSelected?: boolean;
  isDrawn?: boolean;
}) {
  return (
    <div
      style={{
        position: 'relative',
        width: 46,
        height: 62,
        borderRadius: 5,
        background: '#f5efe0',
        border: isJing || isSelected ? '2px solid #c9a961' : '1.5px solid rgba(201,169,97,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        boxShadow: isJing ? '0 0 8px rgba(201,169,97,0.5)' : '0 2px 6px rgba(0,0,0,0.4)',
      }}
    >
      <img
        src={tileTexturePath(tile, 'Regular')}
        style={{ width: '85%', height: '85%', objectFit: 'contain' }}
        draggable={false}
        alt=""
      />
      {isDrawn && (
        <span
          style={{
            position: 'absolute',
            top: 3,
            right: 3,
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: '#c9a961',
          }}
        />
      )}
    </div>
  );
}

// ── Viewer hand HUD ───────────────────────────────────────────────────────────

/**
 * DOM overlay at the bottom of the screen showing the viewer's tiles at a
 * larger scale than the 3D scene would allow. Tiles are draggable to reorder.
 *
 * Interaction:
 *   - Tap once  → select (tile lifts with CSS transform)
 *   - Tap again → discard (confirmed with the server)
 *   - Drag      → reorder display order (local only, no server effect)
 *
 * The `displayOrder` array maps display-position → hand-index. It is reset
 * to natural order whenever the hand length changes (discard+draw cycle).
 */
function ViewerHandHUD({
  hand,
  selectedTileIdx,
  onSelect,
  onDiscard,
  isMyTurn,
  jingTypes,
  pendingMove,
}: {
  hand: TileType[];
  selectedTileIdx: number | null;
  onSelect: (idx: number) => void;
  onDiscard: (tile: TileType) => void;
  isMyTurn: boolean;
  jingTypes: Set<string>;
  pendingMove: boolean;
}) {
  // displayOrder[displayIdx] = handIdx
  const [displayOrder, setDisplayOrder] = useState<number[]>(() => hand.map((_, i) => i));
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const prevLenRef = useRef(hand.length);

  // Sync displayOrder when hand length changes (new draw or discard confirmation).
  useEffect(() => {
    const prev = prevLenRef.current;
    prevLenRef.current = hand.length;

    if (hand.length === prev) return;

    if (hand.length > prev) {
      // A tile was drawn — append its index (hand.length - 1) at the end of
      // the display so the newly drawn tile appears on the right.
      setDisplayOrder((order) => [...order, hand.length - 1]);
    } else {
      // A tile was discarded — we can't cheaply determine which index was
      // removed, so reset to natural order for the new hand.
      setDisplayOrder(hand.map((_, i) => i));
    }
  }, [hand.length]);

  const handleDragStart = (displayIdx: number) => {
    setDragFrom(displayIdx);
  };

  const handleDragOver = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (dragFrom === null || dragFrom === targetIdx) return;
    // Live reorder: move the dragged tile to the hovered slot immediately.
    setDisplayOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragFrom, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
    setDragFrom(targetIdx);
  };

  const handleDragEnd = () => setDragFrom(null);

  const handleTileClick = (displayIdx: number) => {
    if (!isMyTurn || pendingMove) return;
    const handIdx = displayOrder[displayIdx];
    if (selectedTileIdx === handIdx) {
      onDiscard(hand[handIdx]);
    } else {
      onSelect(handIdx);
    }
  };

  const drawnHandIdx = hand.length > 1 ? hand.length - 1 : -1;

  return (
    <div
      className="absolute bottom-0 left-0 right-0 flex flex-col items-center pointer-events-auto"
      style={{ zIndex: 15 }}
      aria-hidden="true" // accessible version is the sr-only AccessibleHand
    >
      {/* Gradient fade so the HUD blends into the 3D canvas above it */}
      <div
        className="w-full flex justify-center px-2 pt-4 pb-2"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.88) 60%, transparent 100%)',
        }}
      >
        <div
          className="flex gap-[3px] items-end"
          style={{ overflowX: 'auto', scrollbarWidth: 'none', maxWidth: '100%' }}
        >
          {displayOrder.map((handIdx, displayIdx) => {
            const tile = hand[handIdx];
            if (tile === undefined) return null;
            const isSelected = !pendingMove && selectedTileIdx === handIdx;
            const isDrawn = handIdx === drawnHandIdx;
            const isDragging = dragFrom === displayIdx;

            return (
              <div
                key={`hud-${handIdx}`}
                draggable
                onDragStart={() => handleDragStart(displayIdx)}
                onDragOver={(e) => handleDragOver(e, displayIdx)}
                onDragEnd={handleDragEnd}
                onClick={() => handleTileClick(displayIdx)}
                style={{
                  transition: 'transform 0.12s ease, opacity 0.12s ease',
                  transform: isSelected ? 'translateY(-10px) scale(1.08)' : 'none',
                  opacity: isDragging ? 0.45 : 1,
                  cursor: isMyTurn && !pendingMove ? 'pointer' : 'default',
                  flexShrink: 0,
                }}
              >
                <SvgHandTile
                  tile={tile}
                  isJing={jingTypes.has(tile)}
                  isSelected={isSelected}
                  isDrawn={isDrawn}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Game history panel ────────────────────────────────────────────────────────

/**
 * Collapsible right-side panel showing a chronological event log for the
 * current hand: discards, pungs, chows, kongs, wins, concedes.
 *
 * The panel slides in from the right edge. A thin tab button toggles it.
 * When collapsed the tab sticks out on the right, always accessible.
 * z-index 15: above the 3D canvas (z-0) and corner nameplates (z-10),
 * below the claim rail (z-20) and overlays (z-30+).
 */
function GameHistoryPanel({
  entries,
  isOpen,
  onToggle,
  snapshot,
  isMobile = false,
}: {
  entries: HistoryEntry[];
  isOpen: boolean;
  onToggle: () => void;
  snapshot: ClientGameState;
  isMobile?: boolean;
}) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newest entry (bottom) when entries grow.
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length, isOpen]);

  const PANEL_W = 210;

  const ACTION_LABEL: Partial<Record<HistoryEntry['kind'], string>> = {
    pung: t('gameActionPung'),
    chow: t('gameActionChow'),
    kong: t('gameActionKong'),
    win: t('gameActionWin'),
    concede: t('gameActionConcede'),
  };

  // Compass position label for each seat relative to the viewer.
  const viewerSeat = (snapshot.viewerSeat ?? 0) as 0 | 1 | 2 | 3;
  const POSITION_LABEL = [
    t('gamePositionYou'),
    t('gamePositionRight'),
    t('gamePositionAcross'),
    t('gamePositionLeft'),
  ];

  if (isMobile) {
    // ── Mobile: full-width bottom sheet, toggle is in the status bar ──────────
    return (
      <div
        data-testid="history-bottom-sheet"
        className="absolute left-0 right-0 overflow-hidden"
        style={{
          bottom: isOpen ? 'var(--mj-hand-height, 90px)' : '-40%',
          height: '40%',
          zIndex: 16,
          background: 'rgba(8,8,8,0.95)',
          borderTop: '1px solid rgba(245,239,223,0.1)',
          backdropFilter: 'blur(12px)',
          transition: 'bottom 0.22s ease',
        }}
      >
        {/* Header */}
        <div
          className="px-3 py-2 flex items-center justify-between shrink-0"
          style={{ borderBottom: '1px solid rgba(245,239,223,0.07)' }}
        >
          <span className="text-[10px] font-bold tracking-widest text-mj-gold/60 uppercase">
            {t('gameHistoryTitle')}
          </span>
          <span className="text-[10px] text-mj-bone/30">{entries.length}</span>
        </div>

        {/* Scrollable event list */}
        <div
          ref={scrollRef}
          className="overflow-y-auto h-full pb-4"
          style={{ scrollbarWidth: 'none' }}
        >
          {entries.length === 0 ? (
            <p className="text-[10px] text-mj-bone/20 text-center mt-6 px-3">—</p>
          ) : (
            <div className="flex flex-col py-1">
              {entries.map((entry) => {
                const offset = (entry.seatIdx - viewerSeat + 4) % 4;
                const posLabel = POSITION_LABEL[offset];
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-1 px-2 py-[5px]"
                    style={{ borderBottom: '1px solid rgba(245,239,223,0.04)' }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: WIND_COLOR[entry.seatWind] }}
                    />
                    <span
                      className="text-[10px] font-bold shrink-0"
                      style={{ color: WIND_COLOR[entry.seatWind] }}
                    >
                      {posLabel}
                    </span>
                    <span
                      className="text-[9px] shrink-0"
                      style={{ color: WIND_COLOR[entry.seatWind], opacity: 0.7 }}
                    >
                      {WIND_CHAR[entry.seatWind]}
                    </span>
                    <span className="text-[10px] text-mj-bone/50 shrink-0">
                      {entry.kind === 'discard'
                        ? t('gameHistoryDiscard')
                        : ACTION_LABEL[entry.kind]}
                    </span>
                    {entry.tile && (
                      <MahjongTile
                        tile={entry.tile}
                        size="xs"
                        isJing={
                          entry.tile === snapshot.jingPrimary ||
                          entry.tile === snapshot.jingSecondary
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Toggle tab — slides left when panel is open */}
      <button
        onClick={onToggle}
        className="absolute top-1/2 -translate-y-1/2 flex items-center justify-center"
        style={{
          right: isOpen ? PANEL_W : 0,
          zIndex: 15,
          width: 28,
          height: 56,
          background: 'rgba(14,14,14,0.92)',
          border: '1px solid rgba(245,239,223,0.12)',
          borderRight: 'none',
          borderRadius: '6px 0 0 6px',
          color: 'rgba(245,239,223,0.5)',
          fontSize: 14,
          transition: 'right 0.22s ease',
          cursor: 'pointer',
        }}
        aria-label={t('gameHistoryTitle')}
      >
        {isOpen ? t('gameHistoryClose') : t('gameHistoryOpen')}
      </button>

      {/* Sliding panel */}
      <div
        className="absolute top-10 bottom-0 overflow-hidden"
        style={{
          right: isOpen ? 0 : -PANEL_W,
          width: PANEL_W,
          zIndex: 15,
          background: 'rgba(8,8,8,0.93)',
          borderLeft: '1px solid rgba(245,239,223,0.07)',
          backdropFilter: 'blur(12px)',
          transition: 'right 0.22s ease',
        }}
      >
        {/* Header */}
        <div
          className="px-3 py-2 flex items-center justify-between shrink-0"
          style={{ borderBottom: '1px solid rgba(245,239,223,0.07)' }}
        >
          <span className="text-[10px] font-bold tracking-widest text-mj-gold/60 uppercase">
            {t('gameHistoryTitle')}
          </span>
          <span className="text-[10px] text-mj-bone/30">{entries.length}</span>
        </div>

        {/* Scrollable event list */}
        <div
          ref={scrollRef}
          className="overflow-y-auto h-full pb-4"
          style={{ scrollbarWidth: 'none' }}
        >
          {entries.length === 0 ? (
            <p className="text-[10px] text-mj-bone/20 text-center mt-6 px-3">—</p>
          ) : (
            <div className="flex flex-col py-1">
              {entries.map((entry) => {
                // Compass offset from viewer's seat → position label.
                const offset = (entry.seatIdx - viewerSeat + 4) % 4;
                const posLabel = POSITION_LABEL[offset];
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-1 px-2 py-[5px]"
                    style={{ borderBottom: '1px solid rgba(245,239,223,0.04)' }}
                  >
                    {/* Wind dot */}
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: WIND_COLOR[entry.seatWind] }}
                    />
                    {/* Position + wind — e.g. "You 南" or "Right 東" */}
                    <span
                      className="text-[10px] font-bold shrink-0"
                      style={{ color: WIND_COLOR[entry.seatWind] }}
                    >
                      {posLabel}
                    </span>
                    <span
                      className="text-[9px] shrink-0"
                      style={{ color: WIND_COLOR[entry.seatWind], opacity: 0.7 }}
                    >
                      {WIND_CHAR[entry.seatWind]}
                    </span>
                    {/* Action label */}
                    <span className="text-[10px] text-mj-bone/50 shrink-0">
                      {entry.kind === 'discard'
                        ? t('gameHistoryDiscard')
                        : ACTION_LABEL[entry.kind]}
                    </span>
                    {/* Tile (if any) */}
                    {entry.tile && (
                      <MahjongTile
                        tile={entry.tile}
                        size="xs"
                        isJing={
                          entry.tile === snapshot.jingPrimary ||
                          entry.tile === snapshot.jingSecondary
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Jing tile chip (status bar) ───────────────────────────────────────────────

// Module-level strings to satisfy i18next/no-literal-string.
const JING_CHIP_ARIA = 'Spirit tile – tap to enlarge' as const;

/**
 * Spirit tile chip shown in the top status bar.
 *
 * Uses MahjongTile2D (SVG textures) instead of the old text-glyph MahjongTile.
 * Tapping the chip opens a centred overlay with the tile scaled up 3× for easy
 * reference. Tapping anywhere on the overlay closes it.
 */
function JingTileChip({ tile }: { tile: TileType }) {
  const [enlarged, setEnlarged] = useState(false);

  return (
    <>
      <button
        onClick={() => setEnlarged(true)}
        aria-label={JING_CHIP_ARIA}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 0 }}
      >
        <MahjongTile2D tile={tile} size="xs" role="bottom" isJing interactive={false} />
      </button>

      {enlarged && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 70, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)' }}
          onClick={() => setEnlarged(false)}
        >
          <div style={{ transform: 'scale(3)', transformOrigin: 'center' }}>
            <MahjongTile2D tile={tile} size="lg" role="bottom" isJing interactive={false} />
          </div>
        </div>
      )}
    </>
  );
}

// ── Game Table ────────────────────────────────────────────────────────────────

/**
 * Full game screen — table canvas fills the viewport; DOM overlays layer on top.
 * viewMode === '3D' → GameCanvas (React Three Fiber)
 * viewMode === '2D' → GameTable2D (Framer Motion DOM)
 *
 * Layer order (z-index):
 *   0   GameCanvas / GameTable2D (fills inset-0, no z-index)
 *   10  Status bar, SeatHUD, TurnIndicator
 *   15  ViewerHandHUD, GameHistoryPanel (above canvas, below claim rail)
 *   20  SideRail (claim window) — slides up from bottom, covers HUD
 *   30  ActionToast
 *   40  ConcedeSheet
 *   50  ReconnectingOverlay
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
  toast: GameToast | null;
  pendingMove: boolean;
  onSelect: (idx: number) => void;
  onDiscard: (tile: TileType) => void;
  onClaim: (kind: 'win' | 'pung' | 'kong' | 'chow', seq?: [TileType, TileType, TileType]) => void;
  onPass: () => void;
  onConcede: () => void;
}) {
  const { t } = useI18n();
  const [showConcedeSheet, setShowConcedeSheet] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const nextHistoryId = useRef(0);
  const prevSnapshotRef = useRef<ClientGameState | null>(null);

  // ── Mobile landscape mode ───────────────────────────────────────────────────
  const { mode: landscapeMode, requestNativeLandscape } = useOrientation();
  /** True for any non-desktop mode (native-landscape OR css-landscape). */
  const isMobile = landscapeMode !== 'desktop';

  // Suppress pull-to-refresh on the document body while the game is mounted.
  useEffect(() => {
    const prev = document.body.style.overscrollBehavior;
    if (landscapeMode !== 'desktop') {
      document.body.style.overscrollBehavior = 'none';
    }
    return () => {
      document.body.style.overscrollBehavior = prev;
    };
  }, [landscapeMode]);

  // Exit fullscreen cleanly when the component unmounts (e.g. game ends).
  useEffect(() => {
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {
          // Ignore — browser may already be exiting fullscreen.
        });
      }
    };
  }, []);

  const viewerSeat = (snapshot.viewerSeat ?? 0) as 0 | 1 | 2 | 3;
  const isMyTurn = snapshot.currentSeat === viewerSeat && snapshot.phase === 'playing';
  const viewerHand = snapshot.seats[viewerSeat].hand ?? [];

  // Derive jing set for the viewer hand HUD tile highlighting.
  const jingTypes = new Set<string>();
  if (snapshot.jingPrimary) jingTypes.add(snapshot.jingPrimary);
  if (snapshot.jingSecondary) jingTypes.add(snapshot.jingSecondary);

  // ── History tracking ────────────────────────────────────────────────────────

  const addHistory = useCallback((entry: Omit<HistoryEntry, 'id'>) => {
    setHistoryEntries((prev) => [...prev, { ...entry, id: nextHistoryId.current++ }]);
  }, []);

  // Detect discards and new open melds by diffing snapshots.
  useEffect(() => {
    const prev = prevSnapshotRef.current;
    prevSnapshotRef.current = snapshot;
    if (!prev) return;

    snapshot.seats.forEach((seat, i) => {
      const prevSeat = prev.seats[i];
      if (!prevSeat) return;

      // New discard (last tile in discards array is the new one).
      if (seat.discards.length > prevSeat.discards.length) {
        const tile = seat.discards[seat.discards.length - 1];
        addHistory({ kind: 'discard', seatWind: seat.wind, seatIdx: i, tile });
      }

      // New open meld (pung / chow / kong / kong_added).
      if (seat.openMelds.length > prevSeat.openMelds.length) {
        const newMeld = seat.openMelds[seat.openMelds.length - 1];
        const kind: HistoryEntry['kind'] =
          newMeld.kind === 'pung' ? 'pung' : newMeld.kind === 'chow' ? 'chow' : 'kong';
        addHistory({ kind, seatWind: seat.wind, seatIdx: i, tile: newMeld.tiles[0] });
      }
    });
  }, [snapshot, addHistory]);

  // Detect wins and concedes via toast.
  useEffect(() => {
    if (!toast) return;
    if (toast.kind === 'win' || toast.kind === 'concede') {
      const wind = snapshot.seats[toast.seat]?.wind;
      if (wind) {
        addHistory({
          kind: toast.kind === 'win' ? 'win' : 'concede',
          seatWind: wind,
          seatIdx: toast.seat,
        });
      }
    }
  }, [toast, snapshot, addHistory]);

  const handleConcede = () => {
    setShowConcedeSheet(false);
    onConcede();
  };

  return (
    <div className="mj-game-surface relative w-full h-dvh overflow-hidden bg-black">
      {/* ── Table renderer — fills entire screen ──────────────────────────── */}
      {/* Branched on snapshot.viewMode set by the host before game start.    */}
      {/* All overlays (z-10+) are identical in both modes.                   */}
      <div className="absolute inset-0" aria-hidden="true">
        {snapshot.viewMode === '2D' || isMobile ? (
          // 2D mode or any mobile device (phones always use the touch-optimised 2D layout
          // regardless of the host's viewMode setting — the 3D canvas has no mobile handling).
          <MobileLandscapeGate mode={landscapeMode} onRequestNative={requestNativeLandscape}>
            <GameTable2D onDiscard={onDiscard} isMobile={isMobile} />
          </MobileLandscapeGate>
        ) : (
          <GameCanvas />
        )}
      </div>

      {/* ── Status bar ─────────────────────────────────────────────────────── */}
      <div
        className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between"
        style={{
          background: 'rgba(10,10,10,0.7)',
          borderBottom: '1px solid rgba(245,239,223,0.08)',
          height: isMobile ? 32 : undefined,
          padding: isMobile ? 'var(--mj-safe-top, 0px) 8px 0' : undefined,
          paddingLeft: isMobile ? 8 : undefined,
          paddingRight: isMobile ? 8 : undefined,
          paddingTop: isMobile ? 'var(--mj-safe-top, 0px)' : undefined,
          paddingBottom: isMobile ? 0 : undefined,
          // Desktop padding via className below — here we only override for mobile.
          ...(!isMobile && { padding: '8px 16px' }),
        }}
      >
        {/* Round wind + Jing indicator */}
        <div className="flex items-center gap-2">
          <span
            className="font-bold font-serif"
            style={{ color: WIND_COLOR[snapshot.roundWind], fontSize: isMobile ? 13 : 12 }}
          >
            {WIND_CHAR[snapshot.roundWind]}
            {!isMobile && <> {t('gameRound')}</>}
          </span>
          {!isMobile && snapshot.jingPrimary && (
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-mj-gold/50">{t('gameSpirit')}</span>
              <JingTileChip tile={snapshot.jingPrimary} />
              {snapshot.jingSecondary && <JingTileChip tile={snapshot.jingSecondary} />}
            </div>
          )}
        </div>

        {/* Wall count */}
        <span className="text-mj-bone/50" style={{ fontSize: isMobile ? 10 : 10 }}>
          {isMobile ? snapshot.wallCount : `${t('gameWallLeft')} ${snapshot.wallCount}`}
        </span>

        {/* Right-side controls */}
        <div className="flex items-center gap-1">
          {/* History icon — mobile only (desktop uses the right-edge panel toggle) */}
          {isMobile && (
            <button
              onClick={() => setHistoryOpen((o) => !o)}
              className="flex items-center justify-center"
              style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                border: '1px solid rgba(245,239,223,0.1)',
                color: historyOpen ? '#c9a961' : 'rgba(245,239,223,0.4)',
                fontSize: 12,
                background: 'transparent',
              }}
              aria-label={t('gameHistoryTitle')}
              aria-pressed={historyOpen}
            >
              {ICON_HISTORY}
            </button>
          )}

          {/* Concede button */}
          {isMobile ? (
            <button
              onClick={() => setShowConcedeSheet(true)}
              className="flex items-center justify-center"
              style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                border: '1px solid rgba(245,239,223,0.1)',
                color: 'rgba(245,239,223,0.4)',
                fontSize: 12,
                background: 'transparent',
              }}
              aria-label={t('gameConcede')}
            >
              {ICON_CLOSE}
            </button>
          ) : (
            <button
              onClick={() => setShowConcedeSheet(true)}
              className="text-[10px] text-mj-bone/40 px-2 py-1 rounded"
              style={{ border: '1px solid rgba(245,239,223,0.1)' }}
            >
              {t('gameConcede')}
            </button>
          )}
        </div>
      </div>

      {/* ── Seat HUD — corner nameplates ───────────────────────────────────── */}
      <SeatHUD snapshot={snapshot} />

      {/* ── Turn indicator ────────────────────────────────────────────────── */}
      {/* 3D: bottom-40 sits above the ViewerHandHUD (~80 px gradient).      */}
      {/* 2D: bottom-2 sits inside the board's own bottom zone.              */}
      <div
        className={`absolute ${snapshot.viewMode === '2D' ? 'bottom-2' : 'bottom-40'} left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-0.5 pointer-events-none`}
      >
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

      {/* ── Viewer hand HUD — large draggable tiles at the bottom ─────────── */}
      {/* In 2D mode GameTable2D renders PlayerHand2D as the interactive hand. */}
      {/* ViewerHandHUD is only needed in 3D mode (it overlays the R3F canvas). */}
      {!showConcedeSheet && snapshot.viewMode !== '2D' && (
        <ViewerHandHUD
          hand={viewerHand}
          selectedTileIdx={selectedTileIdx}
          onSelect={onSelect}
          onDiscard={onDiscard}
          isMyTurn={isMyTurn}
          jingTypes={jingTypes}
          pendingMove={pendingMove}
        />
      )}

      {/* ── Accessible hand — sr-only DOM buttons for a11y + tests ─────────── */}
      <AccessibleHand
        hand={viewerHand}
        selectedTileIdx={pendingMove ? null : selectedTileIdx}
        onSelect={onSelect}
        onDiscard={onDiscard}
        isMyTurn={isMyTurn && !pendingMove}
      />

      {/* ── Collapsible history panel ──────────────────────────────────────── */}
      {!showConcedeSheet && (
        <GameHistoryPanel
          entries={historyEntries}
          isOpen={historyOpen}
          onToggle={() => setHistoryOpen((o) => !o)}
          snapshot={snapshot}
          isMobile={isMobile}
        />
      )}

      {/* ── Action toast ───────────────────────────────────────────────────── */}
      {toast && !showConcedeSheet && <ActionToast toast={toast} snapshot={snapshot} />}

      {/* ── Claim window rail ──────────────────────────────────────────────── */}
      {claimWindow && !showConcedeSheet && (
        <SideRail claimWindow={claimWindow} onClaim={onClaim} onPass={onPass} isMobile={isMobile} />
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

/** localStorage key that persists the active gameId across page navigations. */
const ACTIVE_GAME_KEY = 'mj:active-game';

/** How long to wait for game:snapshot before giving up and showing an error. */
const GAME_JOIN_TIMEOUT_MS = 12_000;

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
    gameError,
    selectTile,
    discard,
    claim,
    pass,
    concede,
    revealJing,
    requestRematch,
  } = useGame(gameId ?? '', spectate);

  // ── Loading timeout ───────────────────────────────────────────────────────────
  // If we haven't received a game:snapshot within GAME_JOIN_TIMEOUT_MS, the
  // connection is broken or the server rejected us silently. Surface a TIMEOUT
  // error so the user gets a clear message and a Back to Lobby button rather than
  // staring at an infinite loading screen.
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (snapshot || gameError || timedOut) return; // already have state — no timer needed
    const id = setTimeout(() => setTimedOut(true), GAME_JOIN_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [snapshot, gameError, timedOut]);

  const handleHome = useCallback(() => navigate('/lobby'), [navigate]);

  useEffect(() => {
    if (rematchRoomCode) {
      navigate(`/room/${rematchRoomCode}`);
    }
  }, [rematchRoomCode, navigate]);

  // ── Active-game localStorage tracking ──────────────────────────────────────
  // Store the gameId so LobbyPage can show a "Rejoin" card if the player
  // navigates away mid-game. Clear it once the session ends normally.

  useEffect(() => {
    if (gameId) localStorage.setItem(ACTIVE_GAME_KEY, gameId);
  }, [gameId]);

  useEffect(() => {
    if (snapshot?.phase === 'finished') localStorage.removeItem(ACTIVE_GAME_KEY);
  }, [snapshot?.phase]);

  // ── Back-button / navigation intercept ─────────────────────────────────────
  // Block any navigation attempt while the game is actively in progress.
  // On mobile the OS back gesture fires the same popstate event that
  // useBlocker intercepts via React Router's history listener.

  const isActiveGame = snapshot?.phase === 'playing' || snapshot?.phase === 'awaiting_claims';

  // Warn before the browser tab is closed / refreshed during an active hand.
  // Note: useBlocker (React Router's in-app navigation blocker) requires a
  // data router (createBrowserRouter) which this app does not use. Replacing
  // it with a beforeunload handler covers the page-close case; in-app back
  // navigation during a game is allowed to proceed without a confirmation
  // dialog until we migrate to a data router.
  useEffect(() => {
    if (!isActiveGame) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isActiveGame]);

  if (!gameId) {
    return <LoadingScreen />;
  }

  // Server emitted an unrecoverable error (e.g. game session lost after restart).
  if (gameError) {
    return <GameErrorScreen errorCode={gameError} onHome={handleHome} />;
  }

  // Client-side timeout: if game:snapshot hasn't arrived after GAME_JOIN_TIMEOUT_MS,
  // show an error rather than leaving the user on an infinite loading screen.
  if (timedOut) {
    return <GameErrorScreen errorCode="TIMEOUT" onHome={handleHome} />;
  }

  if (!snapshot) {
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
