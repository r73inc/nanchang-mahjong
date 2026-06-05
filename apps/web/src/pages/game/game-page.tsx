/**
 * GamePage — full real-time game screen.
 *
 * Route: /game/:id
 * Replaces JingRevealStubPage from Phase 6.
 *
 * Renders different sub-screens based on the snapshot phase:
 *   jing_reveal  → JingRevealScreen (host taps to reveal spirit tiles)
 *   playing      → GameTable
 *   awaiting_claims → GameTable (with side rail showing claim actions)
 *   finished     → GameEndScreen
 *   null (loading) → LoadingScreen
 *
 * The reconnecting overlay is shown on top of whatever screen is active.
 */

import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useState, useCallback, useEffect } from 'react';
import { useGame } from '../../hooks/use-game';
import { MahjongTile, FaceDownTile } from '../../components/mahjong-tile';
import { useI18n } from '../../i18n';
import type { ClientGameState, TileType, SeatWind, GameEndedPayload } from '@nanchang/shared';
import type { ClaimWindowState } from '../../stores/game.store';

// ── Seat compass helpers ──────────────────────────────────────────────────────

/** Given the viewer's seat, compute the compass positions for the other seats. */
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

/** Loading / connecting screen. */
function LoadingScreen() {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center h-dvh bg-mj-bg-page">
      <p className="text-mj-bone/50 text-sm">{t('loading')}</p>
    </div>
  );
}

/** Jing (Spirit) reveal screen shown before the first turn. */
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
      {/* Title */}
      <div>
        <p className="text-[11px] font-bold tracking-widest text-mj-gold/70 uppercase mb-1">
          {t('gameSpirit')}
        </p>
        <h1 className="text-2xl font-serif font-bold text-mj-bone">{t('gameSpiritTiles')}</h1>
      </div>

      {/* Spirit indicator tile */}
      {indicatorTile && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-xs text-mj-bone/50">{t('gameSpirit')}</p>
          <MahjongTile tile={indicatorTile} size="lg" isJing />
        </div>
      )}

      {/* Description / waiting message */}
      <p className="text-sm text-mj-bone/60 max-w-[260px]">
        {isHost ? t('gameRevealSpirit') : t('gameWaitingReveal')}
      </p>

      {/* Host: Reveal button; Others: waiting indicator */}
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

/** Game-end screen (shown after phase=finished). */
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
      {/* Placement badge */}
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

      {/* Rating delta */}
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

      {/* Final scores */}
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

      {/* Hands played */}
      {ended && (
        <p className="text-xs text-mj-bone/40">
          {t('endGameHandsPlayed').replace('{{0}}', String(ended.handsPlayed))}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3 w-full max-w-[280px]">
        {/* Seat 0 (host) can trigger rematch */}
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

// ── Game Table ────────────────────────────────────────────────────────────────

/** Nameplate for an opponent seat (top, left, right). */
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
  const { t } = useI18n();

  return (
    <div
      className={[
        'flex items-center gap-1.5 px-2 py-1 rounded-md',
        compact ? 'text-[10px]' : 'text-xs',
      ].join(' ')}
      style={{
        background: isActive ? 'rgba(201,169,97,0.15)' : 'rgba(245,239,223,0.05)',
        border: `1px solid ${isActive ? 'rgba(201,169,97,0.4)' : 'rgba(245,239,223,0.1)'}`,
      }}
    >
      {/* Wind indicator */}
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: WIND_COLOR[seat.wind] }}
      />
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

/** The viewer's own hand at the bottom. */
function ViewerHand({
  snapshot,
  selectedTileIdx,
  onSelect,
  onDiscard,
  pendingMove,
}: {
  snapshot: ClientGameState;
  selectedTileIdx: number | null;
  onSelect: (idx: number) => void;
  onDiscard: (tile: TileType) => void;
  pendingMove: boolean;
}) {
  const { t } = useI18n();
  const viewerSeat = snapshot.viewerSeat;
  if (viewerSeat === null) return null;

  const hand = snapshot.seats[viewerSeat].hand ?? [];
  const isMyTurn = snapshot.currentSeat === viewerSeat && snapshot.phase === 'playing';
  const drawnTile = isMyTurn && hand.length > 0 ? hand[hand.length - 1] : null;

  const handleTileClick = (idx: number) => {
    if (!isMyTurn || pendingMove) return;
    if (selectedTileIdx === idx) {
      // Second tap → discard
      onDiscard(hand[idx]);
    } else {
      onSelect(idx);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 pb-2">
      {/* Instruction */}
      <p className="text-[10px] text-mj-bone/40">
        {isMyTurn
          ? selectedTileIdx !== null
            ? t('gameConfirmDiscard')
            : t('gameSelectDiscard')
          : t('gameWaitingTurn')}
      </p>

      {/* Hand tiles */}
      <div
        className="flex gap-[3px] px-3 overflow-x-auto max-w-full"
        role="group"
        aria-label={t('gameYourTurn')}
      >
        {hand.map((tile, idx) => (
          <MahjongTile
            key={`${tile}-${idx}`}
            tile={tile}
            size="lg"
            selected={selectedTileIdx === idx}
            isDrawn={tile === drawnTile && idx === hand.length - 1}
            onClick={isMyTurn && !pendingMove ? () => handleTileClick(idx) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/** Compact discard pile for one seat. */
function DiscardPile({
  seat,
  discards,
  isLastDiscard,
}: {
  seat: SeatWind;
  discards: TileType[];
  isLastDiscard?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-[2px] content-start" style={{ minHeight: 40 }}>
      {discards.map((tile, i) => {
        const isLast = i === discards.length - 1 && isLastDiscard;
        return (
          <MahjongTile
            key={`${tile}-${i}`}
            tile={tile}
            size="xs"
            isJing={false}
            className={isLast ? 'animate-last-discard-pulse' : ''}
            ariaHint={WIND_CHAR[seat]}
          />
        );
      })}
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
      className="fixed bottom-0 left-0 right-0 flex flex-col items-center gap-3 p-4 max-w-viewport mx-auto animate-call-prompt-enter"
      style={{ background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(12px)' }}
      role="dialog"
      aria-label={t('gameClaimWindow')}
    >
      <p className="text-[10px] text-mj-bone/40">{t('gameClaimWindowDesc', String(secLeft))}</p>

      {/* Claim action buttons */}
      <div className="flex gap-3 w-full justify-center">
        {claimWindow.actions.map((action) => (
          <button
            key={action.kind}
            onClick={() => {
              const seq = action.sequences?.[0]; // use first sequence for chow
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

        {/* Pass button */}
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

/** Reconnecting overlay (semi-transparent, non-blocking). */
function ReconnectingOverlay() {
  const { t } = useI18n();
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-50"
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
      className="fixed inset-0 z-40 flex items-end justify-center"
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

/** Full game table — compass layout. */
function GameTable({
  snapshot,
  selectedTileIdx,
  claimWindow,
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
  pendingMove: boolean;
  onSelect: (idx: number) => void;
  onDiscard: (tile: TileType) => void;
  onClaim: (kind: 'win' | 'pung' | 'kong' | 'chow', seq?: [TileType, TileType, TileType]) => void;
  onPass: () => void;
  onConcede: () => void;
}) {
  const { t } = useI18n();
  const [showConcedeSheet, setShowConcedeSheet] = useState(false);

  const viewerSeat = snapshot.viewerSeat ?? 0;
  const { right: rightSeat, across: acrossSeat, left: leftSeat } = getCompassSeats(viewerSeat);

  const seatsData = snapshot.seats;
  const isMyTurn = snapshot.currentSeat === viewerSeat && snapshot.phase === 'playing';
  const hasClaimWindow = !!claimWindow;

  const handleConcede = () => {
    setShowConcedeSheet(false);
    onConcede();
  };

  return (
    <div className="flex flex-col h-dvh bg-mj-jade-deep overflow-hidden relative">
      {/* ── Status bar ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{
          background: 'rgba(10,10,10,0.6)',
          borderBottom: '1px solid rgba(245,239,223,0.08)',
        }}
      >
        {/* Round wind + dealer */}
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-bold font-serif"
            style={{ color: WIND_COLOR[snapshot.roundWind] }}
          >
            {WIND_CHAR[snapshot.roundWind]} {t('gameRound')}
          </span>
          <span className="text-[10px] text-mj-bone/40">
            {t('gameDealer')} {WIND_CHAR[snapshot.seats[snapshot.dealerSeat].wind]}
          </span>
        </div>

        {/* Wall count + Jing */}
        <div className="flex items-center gap-3 text-[10px] text-mj-bone/50">
          <span>
            {t('gameWallLeft')} {snapshot.wallCount}
          </span>
          {snapshot.jingPrimary && (
            <span className="text-mj-gold/70">
              {t('gameSpirit')} {t('hostBadge')}
            </span>
          )}
        </div>

        {/* Concede button */}
        <button
          onClick={() => setShowConcedeSheet(true)}
          className="text-[10px] text-mj-bone/40 px-2 py-1 rounded"
          style={{ border: '1px solid rgba(245,239,223,0.1)' }}
        >
          {t('gameConcede')}
        </button>
      </div>

      {/* ── Main game area ──────────────────────────────────────────────── */}
      <div className="flex-1 relative flex flex-col overflow-hidden">
        {/* ── Top opponent ─────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-1 pt-2 px-4 shrink-0">
          <Nameplate
            seat={seatsData[acrossSeat]}
            seatIdx={acrossSeat}
            snapshot={snapshot}
            compact
          />
          <div
            className="flex gap-[3px]"
            aria-label={`${WIND_CHAR[seatsData[acrossSeat].wind]} ${t('gameWaitingTurn')}`}
          >
            {Array.from({ length: seatsData[acrossSeat].handCount }).map((_, i) => (
              <FaceDownTile key={i} size="xs" />
            ))}
          </div>
          <DiscardPile
            seat={seatsData[acrossSeat].wind}
            discards={seatsData[acrossSeat].discards}
            isLastDiscard={snapshot.discardedBySeat === acrossSeat}
          />
        </div>

        {/* ── Middle row: left | center | right ────────────────────────── */}
        <div className="flex flex-1 px-2 gap-1 min-h-0">
          {/* Left opponent */}
          <div className="flex flex-col items-end justify-center gap-1 w-[56px] shrink-0">
            <Nameplate seat={seatsData[leftSeat]} seatIdx={leftSeat} snapshot={snapshot} compact />
            <div
              className="flex flex-col gap-[3px]"
              aria-label={`${WIND_CHAR[seatsData[leftSeat].wind]} ${t('gameWaitingTurn')}`}
            >
              {Array.from({ length: Math.min(seatsData[leftSeat].handCount, 8) }).map((_, i) => (
                <FaceDownTile key={i} size="xs" />
              ))}
            </div>
          </div>

          {/* Center: discard pools */}
          <div className="flex-1 flex flex-col gap-1 min-w-0 overflow-hidden">
            {/* Turn indicator */}
            <div className="flex justify-center">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: isMyTurn ? 'rgba(201,169,97,0.2)' : 'rgba(245,239,223,0.05)',
                  color: isMyTurn ? '#c9a961' : 'rgba(245,239,223,0.4)',
                }}
              >
                {isMyTurn ? t('gameYourTurn') : WIND_CHAR[seatsData[snapshot.currentSeat].wind]}
              </span>
            </div>

            {/* 4 discard piles in a 2×2 grid */}
            <div className="grid grid-cols-2 gap-1 flex-1 overflow-hidden">
              <DiscardPile
                seat={seatsData[viewerSeat].wind}
                discards={seatsData[viewerSeat].discards}
                isLastDiscard={snapshot.discardedBySeat === viewerSeat}
              />
              <DiscardPile
                seat={seatsData[rightSeat].wind}
                discards={seatsData[rightSeat].discards}
                isLastDiscard={snapshot.discardedBySeat === rightSeat}
              />
              <DiscardPile
                seat={seatsData[leftSeat].wind}
                discards={seatsData[leftSeat].discards}
                isLastDiscard={snapshot.discardedBySeat === leftSeat}
              />
              <DiscardPile
                seat={seatsData[acrossSeat].wind}
                discards={seatsData[acrossSeat].discards}
                isLastDiscard={snapshot.discardedBySeat === acrossSeat}
              />
            </div>

            {/* Jing spirit tile display */}
            {snapshot.jingPrimary && (
              <div className="flex items-center justify-center gap-2 py-1">
                <span className="text-[9px] text-mj-gold/50">{t('gameSpirit')}</span>
                <MahjongTile tile={snapshot.jingPrimary} size="xs" isJing />
                {snapshot.jingSecondary && (
                  <MahjongTile tile={snapshot.jingSecondary} size="xs" isJing />
                )}
              </div>
            )}
          </div>

          {/* Right opponent */}
          <div className="flex flex-col items-start justify-center gap-1 w-[56px] shrink-0">
            <Nameplate
              seat={seatsData[rightSeat]}
              seatIdx={rightSeat}
              snapshot={snapshot}
              compact
            />
            <div
              className="flex flex-col gap-[3px]"
              aria-label={`${WIND_CHAR[seatsData[rightSeat].wind]} ${t('gameWaitingTurn')}`}
            >
              {Array.from({ length: Math.min(seatsData[rightSeat].handCount, 8) }).map((_, i) => (
                <FaceDownTile key={i} size="xs" />
              ))}
            </div>
          </div>
        </div>

        {/* ── Viewer's hand ─────────────────────────────────────────────── */}
        <div className="shrink-0 pb-2">
          <ViewerHand
            snapshot={snapshot}
            selectedTileIdx={selectedTileIdx}
            onSelect={onSelect}
            onDiscard={onDiscard}
            pendingMove={pendingMove}
          />
        </div>
      </div>

      {/* ── Side rail (claim window overlay) ─────────────────────────────── */}
      {hasClaimWindow && !showConcedeSheet && (
        <SideRail claimWindow={claimWindow!} onClaim={onClaim} onPass={onPass} />
      )}

      {/* ── Concede sheet ─────────────────────────────────────────────────── */}
      {showConcedeSheet && (
        <ConcedeSheet onConfirm={handleConcede} onCancel={() => setShowConcedeSheet(false)} />
      )}

      {/* ── Polite live region: turn timer announcement (PLAN §7.5) ──────── */}
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

  // When the server confirms a rematch room, navigate there immediately.
  useEffect(() => {
    if (rematchRoomCode) {
      navigate(`/room/${rematchRoomCode}`);
    }
  }, [rematchRoomCode, navigate]);

  if (!gameId) {
    return <LoadingScreen />;
  }

  if (!snapshot) {
    return <LoadingScreen />;
  }

  const viewerSeat = snapshot.viewerSeat;
  // The dealer reveals jing — for hand 1 this is always seat 0, but using
  // dealerSeat is more correct and survives dealer rotation in later hands.
  const isDealer = viewerSeat !== null && viewerSeat === snapshot.dealerSeat;

  return (
    <>
      {/* Phase-based screen selection */}
      {snapshot.phase === 'jing_reveal' && (
        <JingRevealScreen snapshot={snapshot} isHost={isDealer} onReveal={revealJing} />
      )}

      {(snapshot.phase === 'playing' || snapshot.phase === 'awaiting_claims') && (
        <GameTable
          snapshot={snapshot}
          selectedTileIdx={selectedTileIdx}
          claimWindow={claimWindow}
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

      {/* Reconnecting overlay — shown on top of any screen */}
      {connection === 'reconnecting' && <ReconnectingOverlay />}
    </>
  );
}
