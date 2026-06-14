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
import { LangToggle, useI18n } from '../../i18n';
import {
  tileAriaLabel,
  engineToDesignTile,
  decomposeConcealed,
  concealedKongOptions,
  addToKongOptions,
  sortTypes,
  WIND_CHOWS,
  DRAGON_CHOW,
} from '@nanchang/shared';
import type {
  ClientGameState,
  TileType,
  SeatWind,
  GameEndedPayload,
  SettlementPreviewPayload,
  HandRevealPayload,
  Meld,
} from '@nanchang/shared';
import { useGameStore } from '../../stores/game.store';
import type { ClaimWindowState, GameToast } from '../../stores/game.store';
import { useThemeStore, TILE_USER_SCALE } from '../../stores/theme.store';
import { GameCanvas } from '../../r3f/GameCanvas';
import { GameTable2D, MahjongTile2D, ForcedLandscapeWrapper } from '../../components/2d';
import { MobileLandscapeGate } from '../../components/2d/MobileLandscapeGate';
import { DiceRollOverlay } from '../../components/2d/DiceRollOverlay';
import { GameWinnerPopup } from '../../components/game/GameWinnerPopup';
import { SettlementPreview } from '../../components/game/SettlementPreview';
import { tileTexturePath } from '../../r3f/utils/tile-texture-map';
import { useOrientation } from '../../hooks/use-orientation';
import { useSound } from '../../hooks/use-sound';

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
const JING_CHAR = '节' as const;
const MULT_CHAR = '×' as const;
const SCORE_SEP = ': ' as const;

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

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function GoldButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-8 py-3.5 rounded-full font-bold text-sm text-mj-ink"
      style={{
        background: 'linear-gradient(180deg,#c9a961 0%,#a88a45 100%)',
        boxShadow: '0 6px 18px rgba(201,169,97,0.35)',
      }}
    >
      {children}
    </button>
  );
}

function WaitingDots() {
  return (
    <div className="flex gap-1.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-mj-gold/40 animate-pulse"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
    </div>
  );
}

// ── PreGameFlow ───────────────────────────────────────────────────────────────
// Multi-step host-driven reveal sequence before each hand.
//   Step 'hands'      — each player sees their dealt hand
//   Step 'settlement' — bonus settlement tile shown (ruleTopBottomJing only)
//   Step 'jing'       — spirit wildcard tiles revealed; host starts game

function PreGameFlow({
  snapshot,
  settlementPreview,
  isHost,
  onAdvance,
}: {
  snapshot: ClientGameState;
  settlementPreview: SettlementPreviewPayload | null;
  isHost: boolean;
  onAdvance: () => void;
}) {
  const { t } = useI18n();
  const phase = snapshot.preGamePhase;
  const viewerSeat = snapshot.viewerSeat;
  const myHand: TileType[] = viewerSeat !== null ? (snapshot.seats[viewerSeat].hand ?? []) : [];

  // ── Step 0: Dealing — DiceRollOverlay covers this; just show a loading screen
  if (phase === 'dealing') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 min-h-dvh bg-mj-bg-page">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-mj-gold/60 animate-pulse"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </div>
        <p className="text-mj-bone/80 text-sm">{t('diceRollDealing')}</p>
      </div>
    );
  }

  // ── Step 1: Hands ─────────────────────────────────────────────────────────
  if (phase === 'hands') {
    const buttonLabel = snapshot.ruleTopBottomJing
      ? t('preGameRevealSettlement')
      : t('preGameRevealSpirit');
    return (
      <div
        className="flex flex-col items-center justify-center gap-8 min-h-dvh px-6 text-center bg-mj-bg-page"
        aria-label={t('preGameYourHand')}
      >
        <div>
          <p className="text-[11px] font-bold tracking-widest text-mj-gold/70 uppercase mb-1">
            {t('preGameHandTitle')}
          </p>
          <h1 className="text-2xl font-serif font-bold text-mj-bone">{t('preGameYourHand')}</h1>
          <p className="text-sm text-mj-bone/50 mt-1">{t('preGameHandDesc')}</p>
        </div>

        {myHand.length > 0 && (
          <div
            className="flex flex-wrap justify-center gap-1 max-w-sm"
            aria-label={t('preGameYourHand')}
          >
            {myHand.map((tile, i) => (
              <MahjongTile2D
                key={`${tile}-${i}`}
                tile={tile}
                size="sm"
                interactive={false}
                isJing={tile === snapshot.jingPrimary || tile === snapshot.jingSecondary}
              />
            ))}
          </div>
        )}

        {viewerSeat === null && <p className="text-sm text-mj-bone/50">{t('preGameSpectating')}</p>}

        {isHost ? (
          <GoldButton onClick={onAdvance}>{buttonLabel} →</GoldButton>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <WaitingDots />
            <p className="text-xs text-mj-bone/40">{t('preGameWaitingHost')}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Step 1.5: Settlement — bonus tile payout (ruleTopBottomJing only) ──────
  if (phase === 'settlement') {
    if (!settlementPreview) return <LoadingScreen />;
    const footer = isHost ? (
      <GoldButton onClick={onAdvance}>{t('preGameRevealSpirit')} →</GoldButton>
    ) : (
      <>
        <WaitingDots />
        <p className="text-xs text-mj-bone/40">{t('preGameWaitingHost')}</p>
      </>
    );
    return (
      <SettlementPreview
        settlementPreview={settlementPreview}
        snapshot={snapshot}
        viewerSeat={viewerSeat}
        footer={footer}
      />
    );
  }

  // ── Step 2: Jing wildcards revealed ────────────────────────────────────────
  if (phase === 'jing') {
    const primary = snapshot.jingPrimary;
    const secondary = snapshot.jingSecondary;
    return (
      <div
        className="flex flex-col items-center justify-center gap-8 min-h-dvh px-6 text-center bg-mj-bg-page"
        aria-label={t('gameSpiritTiles')}
      >
        <div>
          <p className="text-[11px] font-bold tracking-widest text-mj-gold/70 uppercase mb-1">
            {t('gameSpirit')}
          </p>
          <h1 className="text-2xl font-serif font-bold text-mj-bone">{t('gameSpiritTiles')}</h1>
          <p className="text-sm text-mj-bone/50 mt-1">
            {t('gameSpiritDesc', primary ?? '', secondary ?? '')}
          </p>
        </div>

        {/* Just show primary and secondary spirit tiles — no indicator needed */}
        <div className="flex items-end justify-center gap-6 flex-wrap">
          {primary && (
            <div className="flex flex-col items-center gap-2">
              <MahjongTile2D tile={primary} size="lg" isJing interactive={false} />
              <p className="text-[10px] text-mj-gold/70 font-bold uppercase tracking-wider">
                {t('preGamePrimary')}
              </p>
            </div>
          )}
          {secondary && (
            <div className="flex flex-col items-center gap-2">
              <MahjongTile2D tile={secondary} size="lg" isJing interactive={false} />
              <p className="text-[10px] text-mj-gold/50 font-bold uppercase tracking-wider">
                {t('preGameSecondary')}
              </p>
            </div>
          )}
        </div>

        {isHost ? (
          <GoldButton onClick={onAdvance}>{t('preGameStartGame')} →</GoldButton>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <WaitingDots />
            <p className="text-xs text-mj-bone/40">{t('preGameWaitingHost')}</p>
          </div>
        )}
      </div>
    );
  }

  // Fallback while snapshot hasn't arrived yet
  return <LoadingScreen />;
}

// ── greedyGroupHand ───────────────────────────────────────────────────────────
// Best-effort grouping of any tile set into labeled groups + leftover tiles.
// Used for loser hands and as a winner fallback (seven pairs, etc.).
// Order: pungs first, then chows, then pairs, then remainder.

type TileGroup = { kind: 'pung' | 'chow' | 'pair'; tiles: TileType[] };

function greedyGroupHand(tiles: TileType[]): { groups: TileGroup[]; ungrouped: TileType[] } {
  // sortTypes gives standard mahjong order (man → pin → sou → winds → dragons)
  const bag: TileType[] = sortTypes([...tiles]);
  const groups: TileGroup[] = [];

  const takeOne = (tile: TileType): boolean => {
    const idx = bag.indexOf(tile);
    if (idx === -1) return false;
    bag.splice(idx, 1);
    return true;
  };

  // Pass 1: Pungs (3 of same tile)
  for (const tile of [...new Set(bag)]) {
    while (bag.filter((t) => t === tile).length >= 3) {
      takeOne(tile);
      takeOne(tile);
      takeOne(tile);
      groups.push({ kind: 'pung', tiles: [tile, tile, tile] });
    }
  }

  // Pass 2: Honor chows — Nanchang §4.3: three non-repeating winds or all
  // three dragons form a valid chow sequence.
  const honorChows: readonly (readonly [TileType, TileType, TileType])[] = [
    ...WIND_CHOWS,
    DRAGON_CHOW,
  ];
  for (const chow of honorChows) {
    while (bag.includes(chow[0]) && bag.includes(chow[1]) && bag.includes(chow[2])) {
      takeOne(chow[0]);
      takeOne(chow[1]);
      takeOne(chow[2]);
      groups.push({ kind: 'chow', tiles: [chow[0], chow[1], chow[2]] });
    }
  }

  // Pass 3: Suit chows (3 consecutive same-suit tiles — scan sorted snapshot)
  const snapshot = sortTypes([...bag]);
  for (const tile of snapshot) {
    if (!bag.includes(tile)) continue;
    const m = tile.match(/^(\d)([mps])$/);
    if (!m) continue;
    const rank = parseInt(m[1], 10);
    const suit = m[2];
    if (rank > 7) continue;
    const t2 = `${rank + 1}${suit}` as TileType;
    const t3 = `${rank + 2}${suit}` as TileType;
    if (bag.includes(t2) && bag.includes(t3)) {
      takeOne(tile);
      takeOne(t2);
      takeOne(t3);
      groups.push({ kind: 'chow', tiles: [tile, t2, t3] });
    }
  }

  // Pass 4: Pairs (2 of same tile)
  for (const tile of [...new Set(bag)]) {
    while (bag.filter((t) => t === tile).length >= 2) {
      takeOne(tile);
      takeOne(tile);
      groups.push({ kind: 'pair', tiles: [tile, tile] });
    }
  }

  return { groups, ungrouped: sortTypes([...bag]) };
}

// ── reconstructMeldTiles ──────────────────────────────────────────────────────
// Re-derives the actual tile identities in each decomposed meld group by
// matching from the original hand pool (which still holds real jing tile types).
// The engine's decomposeConcealed fills every meld position with the natural
// target tile, so the actual jing tile identity is lost. This function restores
// it: for each position, prefer the natural tile from the pool; if it's absent,
// a jing tile must have been used — take one from the pool instead.
function reconstructMeldTiles(
  decomp: { pair: TileType; melds: Meld[]; jingPair: boolean },
  hand: TileType[],
  jingTypes: TileType[],
): { kind: 'pung' | 'chow' | 'pair'; tiles: TileType[] }[] {
  const pool: TileType[] = [...hand];

  const takeFromPool = (natural: TileType): TileType => {
    const natIdx = pool.indexOf(natural);
    if (natIdx !== -1) {
      pool.splice(natIdx, 1);
      return natural;
    }
    // Natural not in pool — a jing tile filled this position
    for (const jt of jingTypes) {
      const ji = pool.indexOf(jt);
      if (ji !== -1) {
        pool.splice(ji, 1);
        return jt;
      }
    }
    return natural; // unreachable for valid decompositions
  };

  const groups: { kind: 'pung' | 'chow' | 'pair'; tiles: TileType[] }[] = [];

  for (const meld of decomp.melds) {
    groups.push({
      kind: meld.kind as 'pung' | 'chow',
      tiles: meld.tiles.map((t) => takeFromPool(t)),
    });
  }

  const pairNatural = takeFromPool(decomp.pair);
  const pairSecond = takeFromPool(decomp.pair);
  groups.push({ kind: 'pair', tiles: [pairNatural, pairSecond] });

  return groups;
}

// ── HandRevealScreen ──────────────────────────────────────────────────────────
// Full-screen post-hand reveal. Shows all hands, spirit settlement, and
// payment breakdown.
//   mode 'pause'  — between hands: host clicks "Continue" to start the next
//                   hand (or end the session as a fallback when game:ended is
//                   delayed); everyone else waits.
//   mode 'review' — after the session results (BUG-025): the final screen of
//                   the end-of-game sequence, with a back-to-results button.

function HandRevealScreen({
  handReveal,
  snapshot,
  isHost,
  onAdvance,
  mode = 'pause',
  onBack,
}: {
  handReveal: HandRevealPayload;
  snapshot: ClientGameState;
  isHost: boolean;
  onAdvance?: () => void;
  mode?: 'pause' | 'review';
  onBack?: () => void;
}) {
  const { t } = useI18n();
  const viewerSeat = snapshot.viewerSeat;

  const MELD_KIND_LABEL: Record<Meld['kind'], string> = {
    pung: t('gamePung'),
    chow: t('gameChow'),
    kong: t('gameKong'),
  };
  const PAIR_LABEL = t('handPair');

  const resultLabel =
    handReveal.result === 'win'
      ? t('handRevealResultWin')
      : handReveal.result === 'concede'
        ? t('handRevealResultConcede')
        : t('handRevealResultDraw');

  return (
    <div className="min-h-dvh bg-mj-bg-page overflow-y-auto">
      <div className="flex flex-col items-center gap-6 px-4 py-8 max-w-lg mx-auto">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="text-center">
          <p className="text-[11px] font-bold tracking-widest text-mj-gold/70 uppercase mb-1">
            {t('handRevealTitle')}
          </p>
          <h1 className="text-2xl font-serif font-bold text-mj-bone">{resultLabel}</h1>
          {handReveal.winnerSeat !== undefined && (
            <p className="text-sm text-mj-bone/60 mt-1">
              {t('handRevealWinner', snapshot.seats[handReveal.winnerSeat].seatName)}
            </p>
          )}
          {handReveal.concedeSeat !== undefined && (
            <p className="text-sm text-mj-bone/60 mt-1">
              {t('handRevealConcedeBy', snapshot.seats[handReveal.concedeSeat].seatName)}
            </p>
          )}
        </div>

        {/* ── Score summary ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 w-full">
          {handReveal.handNetDeltas.map((delta, i) => {
            const wind = snapshot.seats[i].wind;
            const isViewer = i === viewerSeat;
            const isWinner = i === handReveal.winnerSeat;
            return (
              <div
                key={i}
                className={`flex items-center justify-between px-4 py-2.5 rounded-xl ${
                  isViewer ? 'bg-mj-gold/15 border border-mj-gold/30' : 'bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: WIND_COLOR[wind] }}
                  />
                  <span
                    className="text-base font-bold max-w-[120px] truncate"
                    style={{ color: WIND_COLOR[wind] }}
                  >
                    {snapshot.seats[i].seatName}
                  </span>
                  {isViewer && <span className="text-xs text-mj-bone/50">{t('preGameYou')}</span>}
                  {isWinner && (
                    <span className="text-[10px] bg-mj-gold/20 text-mj-gold px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">
                      {t('handRevealWinnerBadge')}
                    </span>
                  )}
                </div>
                <span
                  className={`text-base font-bold tabular-nums ${
                    delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-mj-bone/40'
                  }`}
                >
                  {delta > 0 ? '+' : ''}
                  {delta}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── Spirit settlement breakdown ──────────────────────────────────── */}
        {(handReveal.jingPrimary || handReveal.jingSecondary) && (
          <div className="w-full">
            <p className="text-[10px] font-bold tracking-widest text-mj-gold/60 uppercase mb-2 text-center">
              {t('handRevealSpiritSection')}
            </p>
            <div className="flex flex-col gap-1.5 w-full">
              {handReveal.spiritDeltas.map((delta, i) => {
                const wind = snapshot.seats[i].wind;
                const counts = handReveal.spiritCounts[i];
                const isViewer = i === viewerSeat;
                if (delta === 0 && counts.primary === 0 && counts.secondary === 0) return null;
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between px-3 py-1.5 rounded-lg ${
                      isViewer ? 'bg-mj-gold/10' : 'bg-white/4'
                    }`}
                  >
                    <span
                      className="text-sm font-bold max-w-[100px] truncate"
                      style={{ color: WIND_COLOR[wind] }}
                    >
                      {snapshot.seats[i].seatName}
                    </span>
                    <span className="text-xs text-mj-bone/50">
                      {counts.primary > 0 && `${JING_CHAR}${MULT_CHAR}${counts.primary} `}
                      {counts.secondary > 0 && `${JING_CHAR}${MULT_CHAR}${counts.secondary}`}
                    </span>
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        delta > 0
                          ? 'text-emerald-400'
                          : delta < 0
                            ? 'text-red-400'
                            : 'text-mj-bone/30'
                      }`}
                    >
                      {delta > 0
                        ? t('settlementReceived', String(delta))
                        : delta < 0
                          ? t('settlementPaid', String(Math.abs(delta)))
                          : t('settlementEven')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── All four hands ───────────────────────────────────────────────── */}
        <div className="w-full">
          <p className="text-[10px] font-bold tracking-widest text-mj-bone/40 uppercase mb-3 text-center">
            {t('handRevealAllHands')}
          </p>
          <div className="flex flex-col gap-4 w-full">
            {handReveal.hands.map((hand, i) => {
              const wind = snapshot.seats[i].wind;
              const isViewer = i === viewerSeat;
              const isWinner = i === handReveal.winnerSeat;
              const melds = handReveal.openMelds[i] ?? [];
              return (
                <div
                  key={i}
                  className={`rounded-xl p-3 ${isViewer ? 'bg-mj-gold/10 border border-mj-gold/20' : 'bg-white/4'}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-bold" style={{ color: WIND_COLOR[wind] }}>
                      {WIND_CHAR[wind]}
                    </span>
                    <span className="text-xs text-mj-bone/70 font-medium">
                      {snapshot.seats[i].seatName}
                    </span>
                    {isViewer && <span className="text-xs text-mj-bone/50">{t('preGameYou')}</span>}
                    {isWinner && (
                      <span className="text-[10px] bg-mj-gold/20 text-mj-gold px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">
                        {t('handRevealWinnerBadge')}
                      </span>
                    )}
                  </div>

                  {/* Open melds (pung / chow / kong) */}
                  {melds.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {melds.map((meld, mi) => (
                        <div key={mi} className="flex flex-col items-center gap-0.5">
                          <div className="flex gap-0.5">
                            {meld.tiles.map((tile, ti) => (
                              <MahjongTile2D
                                key={`m${i}-${mi}-${ti}`}
                                tile={tile}
                                size="xs"
                                interactive={false}
                                isJing={
                                  tile === handReveal.jingPrimary ||
                                  tile === handReveal.jingSecondary
                                }
                              />
                            ))}
                          </div>
                          <span className="text-[8px] text-mj-bone/30 uppercase tracking-wider">
                            {MELD_KIND_LABEL[meld.kind]}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Concealed hand — grouped into labeled meld/pair groups */}
                  {(() => {
                    const jingTypes: TileType[] = [
                      handReveal.jingPrimary,
                      handReveal.jingSecondary,
                    ].filter((t): t is TileType => t !== undefined);
                    const isJing = (tile: TileType) =>
                      tile === handReveal.jingPrimary || tile === handReveal.jingSecondary;

                    // Build the groups to render: for winner use exact decomposition of the
                    // concealed portion (works for 2/5/8/11/14 tiles = any number of open melds).
                    // For losers (and winner fallback for seven-pairs etc.) use greedy grouping.
                    let groups: { kind: 'pung' | 'chow' | 'pair'; tiles: TileType[] }[] = [];
                    let ungrouped: TileType[] = [];

                    if (isWinner) {
                      const decomps = decomposeConcealed(hand, jingTypes);
                      if (decomps.length > 0) {
                        groups = reconstructMeldTiles(decomps[0], hand, jingTypes);
                        ungrouped = [];
                      } else {
                        // Seven pairs, thirteen misfits, or edge cases — greedy fallback
                        ({ groups, ungrouped } = greedyGroupHand(hand));
                      }
                    } else {
                      ({ groups, ungrouped } = greedyGroupHand(hand));
                    }

                    if (groups.length === 0 && ungrouped.length > 0) {
                      // No recognisable groups — flat row
                      return (
                        <div className="flex flex-wrap gap-0.5">
                          {ungrouped.map((tile, j) => (
                            <MahjongTile2D
                              key={`${i}-${tile}-${j}`}
                              tile={tile}
                              size="xs"
                              interactive={false}
                              isJing={isJing(tile)}
                            />
                          ))}
                        </div>
                      );
                    }

                    return (
                      <div className="flex flex-wrap gap-2">
                        {groups.map((group, gi) => (
                          <div key={gi} className="flex flex-col items-center gap-0.5">
                            <div className="flex gap-0.5">
                              {group.tiles.map((tile, ti) => (
                                <MahjongTile2D
                                  key={`g${i}-${gi}-${ti}`}
                                  tile={tile}
                                  size="xs"
                                  interactive={false}
                                  isJing={isJing(tile)}
                                  showJingLabel={false}
                                />
                              ))}
                            </div>
                            <span className="text-[8px] text-mj-bone/30 uppercase tracking-wider">
                              {group.kind === 'pair' ? PAIR_LABEL : MELD_KIND_LABEL[group.kind]}
                            </span>
                          </div>
                        ))}
                        {/* Ungrouped remainder — no label, slight separator */}
                        {ungrouped.length > 0 && (
                          <div className="flex items-end gap-0.5 ml-1 pl-1 border-l border-mj-bone/10">
                            {ungrouped.map((tile, ui) => (
                              <MahjongTile2D
                                key={`u${i}-${ui}`}
                                tile={tile}
                                size="xs"
                                interactive={false}
                                isJing={isJing(tile)}
                                showJingLabel={false}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Continue / waiting / back ────────────────────────────────────── */}
        <div className="pt-2 pb-4 flex flex-col items-center gap-3">
          {mode === 'review' ? (
            <GoldButton onClick={onBack ?? (() => undefined)}>
              {t('endGameBackToResults')}
            </GoldButton>
          ) : isHost ? (
            <GoldButton onClick={onAdvance ?? (() => undefined)}>
              {handReveal.isLastHand ? t('handRevealEndSession') : t('handRevealContinue')} →
            </GoldButton>
          ) : (
            <>
              <WaitingDots />
              <p className="text-xs text-mj-bone/40">{t('handRevealWaitingHost')}</p>
            </>
          )}
        </div>
      </div>
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
  onViewDetails,
}: {
  snapshot: ClientGameState;
  ended: GameEndedPayload | null;
  viewerSeat: 0 | 1 | 2 | 3 | null;
  onHome: () => void;
  onRematch: () => void;
  onViewDetails?: () => void;
}) {
  const { t } = useI18n();
  // Prefer the authoritative finalScores from game:ended — snapshot seat scores
  // exclude the final hand's spirit settlement (no snapshot follows endSession).
  const scores = ended ? ended.finalScores : snapshot.seats.map((s) => s.score);
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
          style={{ color: myPlacement === 1 ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.4)' }}
        >
          {t(PLACEMENT_KEY[myPlacement])}
        </p>
      )}

      <h1
        className="text-3xl font-serif font-bold"
        style={{ color: iWon ? '#7fc299' : 'var(--felt-ink,#f5efdf)' }}
      >
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
        style={{
          background: 'rgba(var(--felt-ink-rgb),0.05)',
          border: '1px solid rgba(var(--felt-ink-rgb),0.1)',
        }}
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
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: WIND_COLOR[seat.wind] }}
                />
                <span className="text-mj-bone/70 max-w-[110px] truncate">{seat.seatName}</span>
                {seatPlacement && (
                  <span
                    className="text-[10px] font-bold"
                    style={{
                      color: seatPlacement === 1 ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.3)',
                    }}
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
                style={{ color: scores[i] >= 0 ? '#7fc299' : '#e88080' }}
              >
                {scores[i] >= 0 ? '+' : ''}
                {scores[i]}
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
        {onViewDetails && (
          <button
            onClick={onViewDetails}
            className="px-8 py-3 rounded-full text-sm font-bold text-mj-bone/80"
            style={{ border: '1px solid rgba(var(--felt-ink-rgb),0.2)' }}
          >
            {t('endGameViewDetails')}
          </button>
        )}
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
          style={{ border: '1px solid rgba(var(--felt-ink-rgb),0.2)' }}
        >
          {t('gamePlayAgain')}
        </button>
      </div>
    </div>
  );
}

// ── DOM overlays ──────────────────────────────────────────────────────────────

/**
 * Single-seat nameplate chip — wind dot, dealer badge, score, bot/AFK/disconnect.
 *
 * RIGID DIMENSIONS: width and height are fixed so that badge toggling (dealer
 * rotation, AFK, bot chip) and score updates never change the bounding box.
 * SeatHUD positions the chip with translate(-50%) / translate(-50%) anchors;
 * if the footprint were dynamic those translations would shift every re-render,
 * producing visible wiggling. `overflow: hidden` + `flex-1 min-w-0 truncate`
 * on the name span handle any content that exceeds the fixed width.
 *
 * Geometry clearance (2D desktop mode, 800 × 600 reference viewport):
 *   Left  chip: x = [8, 138 px]  — left meld inner extent ≈ 189 px  → 51 px gap
 *   Right chip: symmetric
 *   Top   chip: y = [56, 84 px]  — top  meld inner extent ≈ 167 px  → 83 px gap
 */
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
        'flex items-center gap-1.5 px-2 rounded-md',
        compact ? 'text-[10px]' : 'text-xs',
      ].join(' ')}
      style={{
        width: 130,
        height: 28,
        overflow: 'hidden',
        flexShrink: 0,
        background: isActive ? 'rgba(201,169,97,0.18)' : 'rgba(var(--felt-ink-rgb),0.05)',
        border: `1px solid ${isActive ? 'rgba(201,169,97,0.5)' : 'rgba(var(--felt-ink-rgb),0.1)'}`,
        boxShadow: isActive ? '0 0 8px rgba(201,169,97,0.2)' : 'none',
      }}
    >
      {seat.avatarUrl && (
        <img
          src={seat.avatarUrl}
          alt=""
          aria-hidden="true"
          className="w-4 h-4 rounded-full shrink-0 object-cover"
          style={{ border: `1px solid ${WIND_COLOR[seat.wind]}` }}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            const dot = e.currentTarget.nextElementSibling as HTMLElement | null;
            if (dot) dot.style.display = '';
          }}
        />
      )}
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{
          background: WIND_COLOR[seat.wind],
          display: seat.avatarUrl ? 'none' : undefined,
        }}
      />
      <span className="font-semibold text-mj-bone/90 flex-1 min-w-0 truncate">{seat.seatName}</span>
      {isDealer && (
        <span
          className="text-[9px] font-bold px-1 rounded shrink-0"
          style={{ background: 'rgba(201,169,97,0.3)', color: '#c9a961' }}
        >
          {t('gameDealerBadge')}
        </span>
      )}
      <span className="text-mj-bone/60 font-mono tabular-nums shrink-0">{seat.score}</span>
      {seat.isBot ? (
        <span
          className="text-[8px] font-bold px-1 rounded shrink-0"
          style={{ background: 'rgba(90,125,140,0.3)', color: '#7ab5cc' }}
          aria-label={t(
            seat.botDifficulty === 'normal' ? 'botDifficultyNormalFull' : 'botDifficultyEasyFull',
          )}
        >
          {t('botBadge')}
        </span>
      ) : (
        <>
          {seat.afk && (
            <span className="text-mj-loss-light text-[9px] shrink-0">{t('gameWaitingTurn')}</span>
          )}
          {!seat.connected && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-mj-loss shrink-0"
              title={t('gameReconnecting')}
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * Three opponent nameplate chips anchored to screen edges.
 * Viewer score is in the top status bar instead.
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
  displayOrder,
}: {
  hand: TileType[];
  selectedTileIdx: number | null;
  onSelect: (idx: number) => void;
  onDiscard: (tile: TileType) => void;
  isMyTurn: boolean;
  /** Maps display position → server hand index. Mirrors ViewerHandHUD's display
   *  order so screen-reader buttons stay in sync with the visual tile positions.
   *  Pass `hand.map((_, i) => i)` for natural order (2D mode / no auto-sort). */
  displayOrder: number[];
}) {
  const { lang } = useI18n();

  // Derive entries directly from displayOrder — serverIdx is permanently baked in,
  // no multiset match needed. Entries whose serverIdx is out of range are skipped
  // (transient during hand transitions).
  const entries = displayOrder
    .filter((serverIdx) => serverIdx < hand.length)
    .map((serverIdx) => ({ tile: hand[serverIdx], serverIdx }));

  return (
    <div className="sr-only" role="group" aria-label="Your hand">
      {entries.map(({ tile, serverIdx }) => (
        <button
          key={`accessible-${tile}-${serverIdx}`}
          aria-label={tileAriaLabel(tile, lang)}
          aria-pressed={selectedTileIdx === serverIdx}
          data-tile={engineToDesignTile(tile)}
          onClick={() => {
            if (!isMyTurn) return;
            if (selectedTileIdx === serverIdx) {
              onDiscard(tile);
            } else {
              onSelect(serverIdx);
            }
          }}
        >
          {tileAriaLabel(tile, lang)}
        </button>
      ))}
    </div>
  );
}

/** Centre-screen flash banner shown for ~2s when the viewer's turn begins. */
function YourTurnBanner() {
  const { t } = useI18n();
  return (
    <div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div
        className="px-8 py-4 rounded-2xl animate-your-turn-flash"
        style={{
          background: 'rgba(10,10,10,0.88)',
          border: '2px solid rgba(201,169,97,0.85)',
          boxShadow: '0 0 48px rgba(201,169,97,0.45), 0 8px 32px rgba(0,0,0,0.55)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <span className="text-2xl font-bold tracking-wider font-serif" style={{ color: '#c9a961' }}>
          {t('gameYourTurn')}
        </span>
      </div>
    </div>
  );
}

/** Subtle indicator shown to non-eligible viewers while a claim window is open. */
function WaitingForClaimIndicator({ isMobile = false }: { isMobile?: boolean }) {
  const { t } = useI18n();
  return (
    <div
      className="absolute left-0 right-0 flex justify-center items-center px-4 py-3 max-w-viewport mx-auto animate-call-prompt-enter z-20"
      style={{
        bottom: isMobile ? 'var(--mj-hand-height, 90px)' : 0,
        background: 'rgba(10,10,10,0.75)',
        backdropFilter: 'blur(8px)',
      }}
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-mj-bone/40 animate-pulse" aria-hidden="true" />
        <p className="text-[11px] text-mj-bone/60 font-medium">{t('gameWaitingClaim')}</p>
      </div>
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
    const deltaColor =
      delta > 0 ? '#7fc299' : delta < 0 ? '#e07070' : 'rgba(var(--felt-ink-rgb),0.5)';
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
          border: `1px solid ${isContested ? 'rgba(var(--felt-ink-rgb),0.1)' : WIND_COLOR[seat.wind] + '66'}`,
          backdropFilter: 'blur(10px)',
          boxShadow: isContested ? 'none' : `0 8px 24px ${WIND_COLOR[seat.wind]}33`,
        }}
      >
        {!isContested && (
          <span
            className="text-[10px] font-bold tracking-widest uppercase max-w-[120px] truncate"
            style={{ color: WIND_COLOR[seat.wind] }}
          >
            {seat.seatName}
          </span>
        )}
        <span
          className="font-bold text-lg"
          style={{
            color: isContested ? 'rgba(var(--felt-ink-rgb),0.3)' : 'var(--felt-ink,#f5efdf)',
          }}
        >
          {label}
        </span>
        {toast.outbidBy && (
          <span className="text-[10px] text-mj-bone/50 mt-0.5">{t('gamePrecedenceLost')}</span>
        )}
      </div>
    </div>
  );
}

/** Side rail claim-window overlay — shows tile previews and the pending claimed tile. */
function SideRail({
  claimWindow,
  pendingDiscard,
  onClaim,
  onPass,
  isMobile = false,
}: {
  claimWindow: ClaimWindowState;
  pendingDiscard: TileType | null;
  onClaim: (kind: 'win' | 'pung' | 'kong' | 'chow', seq?: [TileType, TileType, TileType]) => void;
  onPass: () => void;
  isMobile?: boolean;
}) {
  const { t } = useI18n();
  const [minimized, setMinimized] = useState(false);
  const secLeft = Math.max(0, Math.ceil((claimWindow.deadline - Date.now()) / 1000));

  type ExpandedAction =
    | { kind: 'win' | 'pung' | 'kong' }
    | { kind: 'chow'; sequence: [TileType, TileType, TileType] };

  const expandedActions: ExpandedAction[] = claimWindow.actions.flatMap((action) => {
    if (action.kind === 'chow') {
      return (action.sequences ?? []).map(
        (seq): ExpandedAction => ({ kind: 'chow', sequence: seq }),
      );
    }
    return [{ kind: action.kind } as ExpandedAction];
  });

  function tilePreview(action: ExpandedAction): TileType[] {
    if (!pendingDiscard) return [];
    switch (action.kind) {
      case 'win':
        return [pendingDiscard];
      case 'pung':
        return [pendingDiscard, pendingDiscard, pendingDiscard];
      case 'kong':
        return [pendingDiscard, pendingDiscard, pendingDiscard, pendingDiscard];
      case 'chow':
        return [...action.sequence];
    }
  }

  const CLAIM_COLORS = {
    win: '#7fc299',
    pung: '#c9a961',
    kong: '#a36d3e',
    chow: '#5a7d8c',
  };

  // Infer win label from co-present actions: "Win by Pung/Chow/Kong" when the
  // win is specifically via that meld type; plain "Win" when claiming outright.
  const winLabel = (() => {
    const kinds = new Set(claimWindow.actions.map((a) => a.kind));
    if (kinds.has('pung')) return t('gameWinByPung');
    if (kinds.has('chow')) return t('gameWinByChow');
    if (kinds.has('kong')) return t('gameWinByKong');
    return t('gameWin');
  })();

  const CLAIM_LABELS: Record<string, string> = {
    win: winLabel,
    pung: t('gamePung'),
    kong: t('gameKong'),
    chow: t('gameChow'),
  };

  const bottomStyle = isMobile ? 'var(--mj-hand-height, 90px)' : 0;

  // ── Minimized chip ────────────────────────────────────────────────────────
  // Anchored to the upper-right so it never covers the active player's hand,
  // melds, or the discard pile in the centre.
  if (minimized) {
    return (
      <button
        className="fixed top-[calc(1rem+env(safe-area-inset-top))] right-[calc(1rem+env(safe-area-inset-right))] flex items-center gap-2 px-3 py-2 rounded-xl z-20 animate-call-prompt-enter"
        style={{
          background: 'rgba(10,10,10,0.92)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(var(--felt-ink-rgb),0.12)',
        }}
        onClick={() => setMinimized(false)}
        aria-label={t('claimExpand')}
        role="dialog"
      >
        {pendingDiscard && <MahjongTile2D tile={pendingDiscard} size="xs" interactive={false} />}
        <span className="text-[11px] font-bold text-mj-bone/70">{t('gameClaimWindow')}</span>
        <span className="text-[10px] text-mj-bone/40">
          {t('gameClaimWindowDesc', String(secLeft))}
        </span>
        {/* Chevron down */}
        <svg
          className="w-3 h-3 text-mj-bone/40"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    );
  }

  // ── Expanded rail ─────────────────────────────────────────────────────────
  return (
    <div
      className="absolute left-0 right-0 flex flex-col items-center gap-2 px-4 pt-3 pb-4 max-w-viewport mx-auto animate-call-prompt-enter z-20"
      style={{
        bottom: bottomStyle,
        background: 'rgba(10,10,10,0.92)',
        backdropFilter: 'blur(12px)',
      }}
      role="dialog"
      aria-label={t('gameClaimWindow')}
    >
      {/* Header: label + minimize button + countdown */}
      <div className="flex items-center justify-between w-full">
        <p className="text-[11px] font-bold text-mj-bone/70">{t('gameClaimWindow')}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMinimized(true)}
            aria-label={t('claimMinimize')}
            className="flex items-center justify-center w-5 h-5 rounded text-mj-bone/40 hover:text-mj-bone/70"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            {/* Chevron down */}
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          <p className="text-[10px] text-mj-bone/40">{t('gameClaimWindowDesc', String(secLeft))}</p>
        </div>
      </div>

      {/* Prominent claimed tile with gold ring */}
      {pendingDiscard && (
        <div className="relative flex items-center justify-center" aria-hidden="true">
          <MahjongTile2D tile={pendingDiscard} size="lg" interactive={false} />
          <div
            className="absolute inset-[-3px] rounded-[6px] pointer-events-none"
            style={{ border: '2px solid #c9a961', boxShadow: '0 0 10px rgba(201,169,97,0.5)' }}
          />
        </div>
      )}

      {/* Action buttons — one per expanded action + pass */}
      <div className="flex gap-2 w-full justify-center flex-wrap">
        {expandedActions.map((action, idx) => {
          const preview = tilePreview(action);
          const color = CLAIM_COLORS[action.kind];
          return (
            <button
              key={`${action.kind}-${idx}`}
              onClick={() => {
                if (action.kind === 'chow') {
                  onClaim('chow', action.sequence);
                } else {
                  onClaim(action.kind);
                }
              }}
              className="flex flex-col items-center gap-1 px-2 py-2 rounded-xl font-bold text-sm text-mj-ink flex-1 min-w-[70px] max-w-[140px]"
              style={{ background: color, boxShadow: `0 4px 12px ${color}44` }}
            >
              {preview.length > 0 && (
                <div className="flex gap-[2px] justify-center" aria-hidden="true">
                  {preview.map((tile, ti) => (
                    <MahjongTile2D
                      key={`${tile}-${ti}`}
                      tile={tile}
                      size="xs"
                      interactive={false}
                    />
                  ))}
                </div>
              )}
              <span>{CLAIM_LABELS[action.kind]}</span>
            </button>
          );
        })}

        <button
          onClick={onPass}
          className="flex flex-col items-center justify-center flex-1 min-w-[70px] max-w-[140px] px-2 py-2 rounded-xl font-bold text-sm text-mj-bone/60"
          style={{ border: '1px solid rgba(var(--felt-ink-rgb),0.15)' }}
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
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,10,10,0.6)', backdropFilter: 'blur(12px)' }}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-xl p-6 flex flex-col gap-4"
        style={{ background: '#1c1c1c', border: '1px solid rgba(var(--felt-ink-rgb),0.1)' }}
        role="dialog"
        aria-label={t('gameConcedeTitle')}
      >
        <h2 className="font-bold text-lg text-mj-bone">{t('gameConcedeTitle')}</h2>
        <p className="text-sm text-mj-bone/60">{t('gameConcedeDesc')}</p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl font-bold text-sm text-mj-bone/70"
            style={{ border: '1px solid rgba(var(--felt-ink-rgb),0.15)' }}
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

/** Spirit-tile discard confirmation sheet. */
function JingDiscardConfirmSheet({
  tile,
  onConfirm,
  onCancel,
}: {
  tile: TileType;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,10,10,0.6)', backdropFilter: 'blur(12px)' }}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-xl p-6 flex flex-col gap-4"
        style={{ background: '#1c1c1c', border: '1px solid rgba(var(--felt-ink-rgb),0.1)' }}
        role="dialog"
        aria-label={t('jingDiscardTitle')}
      >
        <div className="flex items-center gap-4">
          <MahjongTile2D tile={tile} size="lg" isJing interactive={false} />
          <div>
            <h2 className="font-bold text-lg text-mj-bone">{t('jingDiscardTitle')}</h2>
            <p className="text-sm text-mj-bone/60 mt-1">{t('jingDiscardDesc')}</p>
          </div>
        </div>
        <div className="flex gap-3 mt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl font-bold text-sm text-mj-bone/70"
            style={{ border: '1px solid rgba(var(--felt-ink-rgb),0.15)' }}
          >
            {t('jingDiscardCancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl font-bold text-sm"
            style={{ background: '#c9a961', color: '#1a1a1a' }}
          >
            {t('jingDiscardConfirm')}
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
// Base dimensions for SvgHandTile at md (1.0) scale.
const SVG_HAND_TILE_BASE_W = 46;
const SVG_HAND_TILE_BASE_H = 62;

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
  const { tileSize } = useThemeStore();
  const userScale = TILE_USER_SCALE[tileSize];
  const tileW = Math.max(28, Math.round(SVG_HAND_TILE_BASE_W * userScale));
  const tileH = Math.max(38, Math.round(SVG_HAND_TILE_BASE_H * userScale));

  return (
    <div
      style={{
        position: 'relative',
        width: tileW,
        height: tileH,
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
  onDisplayOrderChange,
}: {
  hand: TileType[];
  selectedTileIdx: number | null;
  onSelect: (idx: number) => void;
  onDiscard: (tile: TileType) => void;
  isMyTurn: boolean;
  jingTypes: Set<string>;
  pendingMove: boolean;
  /** Called whenever the internal displayOrder changes so the parent can mirror
   *  it in AccessibleHand (keeping sr-only buttons in sync with visual order). */
  onDisplayOrderChange?: (order: number[]) => void;
}) {
  const { t } = useI18n();
  const { autoSortDrawnTile } = useThemeStore();
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
      const newHandIdx = hand.length - 1;
      if (autoSortDrawnTile) {
        // Insert the drawn tile at its canonical sorted position among existing tiles.
        // Sort the extended displayOrder array by tile type using the engine's canonical
        // ordering so the drawn tile slots into the correct visual position.
        setDisplayOrder((order) => {
          const extended = [...order, newHandIdx];
          return extended.sort((a, b) => {
            const ta = hand[a];
            const tb = hand[b];
            const sorted = sortTypes([ta, tb]);
            // When ta === tb the two tiles compare equal; preserve relative order.
            return sorted[0] === sorted[1] ? 0 : sorted[0] === ta ? -1 : 1;
          });
        });
      } else {
        // Default: append the drawn tile at the right end of the display.
        setDisplayOrder((order) => [...order, newHandIdx]);
      }
    } else {
      // A tile was discarded — we can't cheaply determine which index was
      // removed, so reset to natural order for the new hand.
      setDisplayOrder(hand.map((_, i) => i));
    }
  }, [hand.length, autoSortDrawnTile]);

  // Report displayOrder to the parent whenever it changes so AccessibleHand can
  // mirror the exact visual order without recomputing it independently.
  useEffect(() => {
    onDisplayOrderChange?.(displayOrder);
  }, [displayOrder, onDisplayOrderChange]);

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

  const handleReorganize = () => {
    const sortedTiles = sortTypes([...hand]);
    const pool = hand.map((_, i) => i);
    const newOrder: number[] = [];
    const used = new Set<number>();
    for (const tile of sortedTiles) {
      const idx = pool.find((i) => hand[i] === tile && !used.has(i));
      if (idx !== undefined) {
        newOrder.push(idx);
        used.add(idx);
      }
    }
    setDisplayOrder(newOrder);
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
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, maxWidth: '100%' }}>
          {/* Sort button — left of tile row, only on player's turn */}
          {isMyTurn && !pendingMove && (
            <button
              onClick={handleReorganize}
              style={{
                flexShrink: 0,
                padding: '4px 8px',
                borderRadius: 8,
                border: '1px solid rgba(201,169,97,0.35)',
                background: 'rgba(201,169,97,0.08)',
                color: '#c9a961',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                alignSelf: 'center',
              }}
            >
              {t('gameSortHand')}
            </button>
          )}
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
    // ── Mobile: full-screen overlay, tap backdrop to close ────────────────────
    if (!isOpen) return null;
    return (
      <div
        data-testid="history-bottom-sheet"
        className="fixed inset-0 flex flex-col justify-end"
        style={{ zIndex: 60, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)' }}
        onClick={onToggle}
      >
        {/* Content panel — tap inside does NOT close */}
        <div
          className="flex flex-col overflow-hidden"
          style={{
            height: '55%',
            background: 'rgba(8,8,8,0.98)',
            borderTop: '1px solid rgba(var(--felt-ink-rgb),0.15)',
            borderRadius: '16px 16px 0 0',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="px-3 py-2 flex items-center justify-between shrink-0"
            style={{ borderBottom: '1px solid rgba(var(--felt-ink-rgb),0.07)' }}
          >
            <span className="text-[10px] font-bold tracking-widest text-mj-gold/60 uppercase">
              {t('gameHistoryTitle')}
            </span>
            <span className="text-[10px] text-mj-bone/30">{entries.length}</span>
          </div>

          {/* Scrollable event list */}
          <div
            ref={scrollRef}
            className="overflow-y-auto flex-1 pb-4"
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
                      style={{ borderBottom: '1px solid rgba(var(--felt-ink-rgb),0.04)' }}
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
          border: '1px solid rgba(var(--felt-ink-rgb),0.12)',
          borderRight: 'none',
          borderRadius: '6px 0 0 6px',
          color: 'rgba(var(--felt-ink-rgb),0.5)',
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
          borderLeft: '1px solid rgba(var(--felt-ink-rgb),0.07)',
          backdropFilter: 'blur(12px)',
          transition: 'right 0.22s ease',
        }}
      >
        {/* Header */}
        <div
          className="px-3 py-2 flex items-center justify-between shrink-0"
          style={{ borderBottom: '1px solid rgba(var(--felt-ink-rgb),0.07)' }}
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
                    style={{ borderBottom: '1px solid rgba(var(--felt-ink-rgb),0.04)' }}
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
 * Mobile-only spirit tile button shown in the status bar.
 *
 * A compact "节" chip (gold serif, always visible when jing is revealed).
 * Tapping it opens a full-screen overlay showing the jing indicator tile and
 * all primary/secondary spirit tiles at large size. Tapping the overlay
 * closes it. Uses position:fixed so it covers the full viewport on both
 * native-landscape and css-landscape devices.
 */
function MobileJingButton({ snapshot }: { snapshot: ClientGameState }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!snapshot.jingPrimary) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t('gameSpirit')}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          lineHeight: 0,
          flexShrink: 0,
          display: 'flex',
          gap: 2,
          alignItems: 'center',
        }}
      >
        <MahjongTile2D
          tile={snapshot.jingPrimary}
          size="xxs"
          role="bottom"
          isJing
          showJingLabel={false}
          interactive={false}
        />
        {snapshot.jingSecondary && (
          <MahjongTile2D
            tile={snapshot.jingSecondary}
            size="xxs"
            role="bottom"
            isJing
            showJingLabel={false}
            interactive={false}
          />
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 flex flex-col items-center justify-center gap-4"
          style={{ zIndex: 70, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}
          onClick={() => setOpen(false)}
        >
          <p
            className="text-[10px] tracking-widest uppercase"
            style={{ color: 'rgba(201,169,97,0.7)' }}
          >
            {t('gameSpiritTiles')}
          </p>
          <div className="flex gap-6 items-end">
            <div className="flex flex-col items-center gap-1.5">
              <MahjongTile2D
                tile={snapshot.jingPrimary}
                size="lg"
                role="bottom"
                isJing
                interactive={false}
              />
              <span
                className="text-[9px] tracking-widest uppercase"
                style={{ color: 'rgba(201,169,97,0.6)' }}
              >
                {t('gameSpiritCurrent')}
              </span>
            </div>
            {snapshot.jingSecondary && (
              <div className="flex flex-col items-center gap-1.5">
                <MahjongTile2D
                  tile={snapshot.jingSecondary}
                  size="lg"
                  role="bottom"
                  isJing
                  interactive={false}
                />
                <span
                  className="text-[9px] tracking-widest uppercase"
                  style={{ color: 'rgba(var(--felt-ink-rgb),0.35)' }}
                >
                  {t('gameSpiritNext')}
                </span>
              </div>
            )}
          </div>
          <p className="text-[9px]" style={{ color: 'rgba(var(--felt-ink-rgb),0.25)' }}>
            {t('gameSpirit')}
          </p>
        </div>
      )}
    </>
  );
}

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
        <MahjongTile2D
          tile={tile}
          size="xs"
          role="bottom"
          isJing
          showJingLabel={false}
          interactive={false}
        />
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

// ── Kong action sheet ─────────────────────────────────────────────────────────

type KongActionOption =
  | { type: 'concealed'; kongTile: TileType }
  | { type: 'add'; pungTile: TileType };

interface KongActionPending {
  discardTile: TileType;
  options: KongActionOption[];
}

function KongActionSheet({
  pending,
  onKong,
  onDiscard,
}: {
  pending: KongActionPending;
  onKong: (opt: KongActionOption) => void;
  onDiscard: () => void;
}) {
  const { t } = useI18n();
  const opt = pending.options[0];
  const titleKey = opt.type === 'concealed' ? 'kongActionConcealedTitle' : 'kongActionAddTitle';
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,10,10,0.6)', backdropFilter: 'blur(12px)' }}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-xl p-6 flex flex-col gap-4"
        style={{ background: '#1c1c1c', border: '1px solid rgba(var(--felt-ink-rgb),0.1)' }}
        role="dialog"
        aria-label={t(titleKey)}
      >
        <div className="flex items-center gap-4">
          <MahjongTile2D tile={pending.discardTile} size="lg" interactive={false} />
          <h2 className="font-bold text-lg text-mj-bone">{t(titleKey)}</h2>
        </div>
        <div className="flex gap-3 mt-2">
          <button
            onClick={onDiscard}
            className="flex-1 py-3 rounded-xl font-bold text-sm text-mj-bone/70"
            style={{ border: '1px solid rgba(var(--felt-ink-rgb),0.15)' }}
          >
            {t('kongActionDiscard')}
          </button>
          {pending.options.map((o, i) => (
            <button
              key={i}
              onClick={() => onKong(o)}
              className="flex-1 py-3 rounded-xl font-bold text-sm"
              style={{ background: '#c9a961', color: '#1a1a1a' }}
            >
              {t('kongActionKong')}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact bottom-bar tsumo prompt — does NOT cover the hand or 3D scene.
 * Positioned like SideRail: above the mobile hand strip, at bottom-0 on
 * desktop where the game canvas shows the hand in 3D perspective.
 */
function TsumoBar({
  onDeclare,
  onDismiss,
  isMobile = false,
}: {
  onDeclare: () => void;
  onDismiss: () => void;
  isMobile?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className="absolute left-0 right-0 flex flex-col gap-2 px-4 pt-3 pb-4 max-w-viewport mx-auto z-20 animate-call-prompt-enter"
      style={{
        bottom: isMobile ? 'var(--mj-hand-height, 90px)' : 0,
        background: 'rgba(10,10,10,0.92)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(201,169,97,0.25)',
      }}
      role="dialog"
      aria-label={t('tsumoTitle')}
    >
      <div className="flex items-center gap-2">
        <p className="font-bold text-sm flex-1" style={{ color: '#c9a961' }}>
          {t('tsumoTitle')}
        </p>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{
            background: 'rgba(201,169,97,0.15)',
            border: '1px solid rgba(201,169,97,0.3)',
            color: 'rgba(201,169,97,0.8)',
          }}
        >
          {t('tsumoWinReason')}
        </span>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onDismiss}
          className="flex-1 py-2.5 rounded-xl font-bold text-sm text-mj-bone/70"
          style={{ border: '1px solid rgba(var(--felt-ink-rgb),0.15)' }}
        >
          {t('tsumoContinue')}
        </button>
        <button
          onClick={onDeclare}
          className="flex-1 py-2.5 rounded-xl font-bold text-sm"
          style={{ background: '#c9a961', color: '#1a1a1a' }}
        >
          {t('tsumoDeclare')}
        </button>
      </div>
    </div>
  );
}

// ── Mobile status-bar icon button ────────────────────────────────────────────

function MobileHeaderButton({
  onClick,
  icon,
  isActive,
  ariaLabel,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  isActive?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center"
      style={{
        width: 24,
        height: 24,
        borderRadius: 4,
        border: '1px solid rgba(var(--felt-ink-rgb),0.1)',
        color: isActive ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.4)',
        fontSize: 12,
        background: 'transparent',
      }}
      aria-label={ariaLabel}
      aria-pressed={isActive !== undefined ? isActive : undefined}
    >
      {icon}
    </button>
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
  canTsumo,
  toast,
  pendingMove,
  onSelect,
  onDiscard,
  onKongConcealed,
  onKongAdd,
  onClaim,
  onPass,
  onConcede,
  onDeclareTsumo,
}: {
  snapshot: ClientGameState;
  selectedTileIdx: number | null;
  claimWindow: ClaimWindowState | null;
  canTsumo: boolean;
  toast: GameToast | null;
  pendingMove: boolean;
  onSelect: (idx: number | null) => void;
  onDiscard: (tile: TileType) => void;
  onKongConcealed: (tile: TileType) => void;
  onKongAdd: (tile: TileType) => void;
  onClaim: (kind: 'win' | 'pung' | 'kong' | 'chow', seq?: [TileType, TileType, TileType]) => void;
  onPass: () => void;
  onConcede: () => void;
  onDeclareTsumo: () => void;
}) {
  const { t } = useI18n();
  const yourTurnFlash = useGameStore((s) => s.yourTurnFlash);
  const [showConcedeSheet, setShowConcedeSheet] = useState(false);
  const [jingDiscardPending, setJingDiscardPending] = useState<TileType | null>(null);
  const [kongActionPending, setKongActionPending] = useState<KongActionPending | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const nextHistoryId = useRef(0);
  const prevSnapshotRef = useRef<ClientGameState | null>(null);

  // tsumoSuppressed: player clicked "Keep Playing" — hide the prompt but show a
  // persistent "Declare Win" button. Cleared automatically when canTsumo resets.
  const [tsumoSuppressed, setTsumoSuppressed] = useState(false);
  useEffect(() => {
    if (!canTsumo) setTsumoSuppressed(false);
  }, [canTsumo]);

  // Auto-close history when a claim window opens — the rail covers the bottom
  // half of the screen and the history panel would just be in the way.
  useEffect(() => {
    if (claimWindow) setHistoryOpen(false);
  }, [claimWindow]);

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

  // Mirror of ViewerHandHUD's internal displayOrder, kept in sync via the
  // onDisplayOrderChange callback below. Used by AccessibleHand so the sr-only
  // DOM buttons always match the visual tile positions in the 3D hand HUD.
  const [hudDisplayOrder, setHudDisplayOrder] = useState<number[]>(() =>
    viewerHand.map((_, i) => i),
  );

  // Derive jing set for the viewer hand HUD tile highlighting.
  const jingTypes = new Set<string>();
  if (snapshot.jingPrimary) jingTypes.add(snapshot.jingPrimary);
  if (snapshot.jingSecondary) jingTypes.add(snapshot.jingSecondary);

  // ── Jing discard confirmation ────────────────────────────────────────────────
  // Intercept discard attempts on spirit tiles — show a confirmation sheet so
  // the player doesn't accidentally throw away a wildcard.
  const handleDiscardWithConfirm = useCallback(
    (tile: TileType) => {
      const isJing = tile === snapshot.jingPrimary || tile === snapshot.jingSecondary;
      if (isJing) {
        setJingDiscardPending(tile);
      } else {
        onDiscard(tile);
      }
    },
    [snapshot.jingPrimary, snapshot.jingSecondary, onDiscard],
  );

  const handleJingDiscardConfirm = () => {
    if (jingDiscardPending) onDiscard(jingDiscardPending);
    setJingDiscardPending(null);
  };

  const handleJingDiscardCancel = () => {
    setJingDiscardPending(null);
    onSelect(null); // deselect the tile
  };

  // ── Kong detection ───────────────────────────────────────────────────────────
  // On the player's draw turn, check if the tile being discarded can instead
  // be used to declare a concealed kong or extend an open pung to a kong.
  const handleDiscardOrKong = useCallback(
    (tile: TileType) => {
      if (!isMyTurn) {
        handleDiscardWithConfirm(tile);
        return;
      }
      const options: KongActionOption[] = [];
      const jingTypesArr = Array.from(jingTypes) as TileType[];

      // Concealed kong: all 4 of this tile type are in hand
      const cKongTypes = concealedKongOptions(viewerHand, jingTypesArr);
      if (cKongTypes.includes(tile)) {
        options.push({ type: 'concealed', kongTile: tile });
      }

      // Add-to-kong: tile in hand matches what's needed to extend an open pung
      const openPungs = snapshot.seats[viewerSeat].openMelds.filter((m) => m.kind === 'pung');
      for (const pung of openPungs) {
        const pungTile = pung.tiles[0] as TileType;
        const removable = addToKongOptions(viewerHand, pungTile, jingTypesArr);
        if (removable.includes(tile)) {
          options.push({ type: 'add', pungTile });
        }
      }

      if (options.length > 0) {
        setKongActionPending({ discardTile: tile, options });
      } else {
        handleDiscardWithConfirm(tile);
      }
    },
    [isMyTurn, viewerHand, jingTypes, snapshot.seats, viewerSeat, handleDiscardWithConfirm],
  );

  const handleKongAction = useCallback(
    (opt: KongActionOption) => {
      setKongActionPending(null);
      if (opt.type === 'concealed') {
        onKongConcealed(opt.kongTile);
      } else {
        onKongAdd(opt.pungTile);
      }
    },
    [onKongConcealed, onKongAdd],
  );

  const handleKongActionDiscard = useCallback(() => {
    if (!kongActionPending) return;
    const tile = kongActionPending.discardTile;
    setKongActionPending(null);
    handleDiscardWithConfirm(tile);
  }, [kongActionPending, handleDiscardWithConfirm]);

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
    <ForcedLandscapeWrapper
      active={landscapeMode === 'css-landscape'}
      className={landscapeMode === 'css-landscape' ? 'w-full h-full' : 'w-full h-dvh'}
    >
      <div className="mj-game-surface relative w-full h-full overflow-hidden bg-black">
        {/* ── Table renderer — fills entire screen ──────────────────────────── */}
        {/* Branched on snapshot.viewMode set by the host before game start.    */}
        {/* All overlays (z-10+) are identical in both modes.                   */}
        <div className="absolute inset-0" aria-hidden="true">
          {snapshot.viewMode === '2D' || isMobile ? (
            // 2D mode or any mobile device (phones always use the touch-optimised 2D layout
            // regardless of the host's viewMode setting — the 3D canvas has no mobile handling).
            <MobileLandscapeGate mode={landscapeMode} onRequestNative={requestNativeLandscape}>
              <GameTable2D
                onDiscard={handleDiscardOrKong}
                isMobile={isMobile}
                isCssLandscape={landscapeMode === 'css-landscape'}
              />
            </MobileLandscapeGate>
          ) : (
            <GameCanvas />
          )}
        </div>

        {/* ── Active-turn border glow — transparent overlay, above the table ── */}
        {/* Applied ABOVE FeltSurface2D (which would cover an inset box-shadow   */}
        {/* applied directly to the root div). pointer-events:none so no clicks  */}
        {/* are intercepted. z-5 sits between the game table (z-auto) and the    */}
        {/* status bar (z-10).                                                    */}
        {isMyTurn && (
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none mj-turn-border-glow"
            style={{ zIndex: 5 }}
          />
        )}

        {/* ── Status bar ─────────────────────────────────────────────────────── */}
        <div
          className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between"
          style={{
            background: 'rgba(10,10,10,0.7)',
            borderBottom: '1px solid rgba(var(--felt-ink-rgb),0.08)',
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
            {isMobile ? (
              // Mobile: compact "节" button → taps to show full spirit tile overlay
              <MobileJingButton snapshot={snapshot} />
            ) : (
              // Desktop: always-visible xs tile chips in the status bar
              snapshot.jingPrimary && (
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-mj-gold/50">{t('gameSpirit')}</span>
                  <JingTileChip tile={snapshot.jingPrimary} />
                  {snapshot.jingSecondary && <JingTileChip tile={snapshot.jingSecondary} />}
                </div>
              )
            )}
          </div>

          {/* Wall count + viewer score (desktop) */}
          <div className="flex items-center gap-3">
            <span className="text-mj-bone/50" style={{ fontSize: isMobile ? 10 : 10 }}>
              {isMobile ? snapshot.wallCount : `${t('gameWallLeft')} ${snapshot.wallCount}`}
            </span>
            {!isMobile && (
              <span className="font-mono tabular-nums" style={{ fontSize: 10, color: '#c9a961' }}>
                {snapshot.seats[viewerSeat].seatName}
                {SCORE_SEP}
                {snapshot.seats[viewerSeat].score}
              </span>
            )}
          </div>

          {/* Right-side controls */}
          <div className="flex items-center gap-2">
            {/* Language toggle — available at all times during gameplay */}
            <LangToggle />

            {/* History icon — mobile only (desktop uses the right-edge panel toggle) */}
            {isMobile && (
              <MobileHeaderButton
                onClick={() => setHistoryOpen((o) => !o)}
                icon={ICON_HISTORY}
                isActive={historyOpen}
                ariaLabel={t('gameHistoryTitle')}
              />
            )}

            {/* Concede button */}
            {isMobile ? (
              <MobileHeaderButton
                onClick={() => setShowConcedeSheet(true)}
                icon={ICON_CLOSE}
                ariaLabel={t('gameConcede')}
              />
            ) : (
              <button
                onClick={() => setShowConcedeSheet(true)}
                className="text-[10px] text-mj-bone/40 px-2 py-1 rounded"
                style={{ border: '1px solid rgba(var(--felt-ink-rgb),0.1)' }}
              >
                {t('gameConcede')}
              </button>
            )}
          </div>
        </div>

        {/* ── Seat HUD — corner nameplates (desktop/3D only) ─────────────────── */}
        {/* Hidden on mobile: the 2D game table renders OpponentBadge2D and      */}
        {/* MobilePlayerBadge2D for player info. SeatHUD would also escape the   */}
        {/* MobileJingButton overlay's stacking context and paint on top of it.  */}
        {!isMobile && <SeatHUD snapshot={snapshot} />}

        {/* ── Turn indicator ────────────────────────────────────────────────── */}
        {/* Hidden on mobile: the viewport-wide glow (mj-turn-border-glow) is   */}
        {/* the turn signal for mobile players. The bottom pill at bottom-2      */}
        {/* would sit directly on top of the hand tile row.                      */}
        {/* 3D: bottom-40 sits above the ViewerHandHUD (~80 px gradient).        */}
        {/* 2D: bottom-2 sits inside the board's own bottom zone.                */}
        {!isMobile && (
          <div
            className={`absolute ${snapshot.viewMode === '2D' ? 'bottom-2' : 'bottom-40'} left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-0.5 pointer-events-none`}
          >
            <span
              className={`text-[11px] font-bold px-3 py-1 rounded-full${isMyTurn ? ' mj-your-turn-pill' : ''}`}
              style={{
                background: isMyTurn ? 'rgba(201,169,97,0.25)' : 'rgba(var(--felt-ink-rgb),0.07)',
                color: isMyTurn ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.6)',
                border: isMyTurn
                  ? '1px solid rgba(201,169,97,0.5)'
                  : '1px solid rgba(var(--felt-ink-rgb),0.1)',
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
        )}

        {/* ── Viewer hand HUD — large draggable tiles at the bottom ─────────── */}
        {/* In 2D mode or on mobile, GameTable2D renders PlayerHand2D as the     */}
        {/* interactive hand. ViewerHandHUD is only needed on desktop in 3D mode  */}
        {/* where it overlays the R3F canvas (which has no mobile handling).      */}
        {/* Kept visible when canTsumo is true so the hand remains visible while  */}
        {/* the non-blocking TsumoBar appears above it (IMP-020).                 */}
        {!showConcedeSheet && !kongActionPending && snapshot.viewMode !== '2D' && !isMobile && (
          <ViewerHandHUD
            hand={viewerHand}
            selectedTileIdx={selectedTileIdx}
            onSelect={onSelect}
            onDiscard={handleDiscardOrKong}
            isMyTurn={isMyTurn && !canTsumo}
            jingTypes={jingTypes}
            pendingMove={pendingMove}
            onDisplayOrderChange={setHudDisplayOrder}
          />
        )}

        {/* ── Persistent "Declare Win" button (IMP-020) ──────────────────────── */}
        {/* Shown after the player dismisses the TsumoBar. Floats above the hand  */}
        {/* HUD and lets them re-open the win prompt at any time before discarding.*/}
        {canTsumo && tsumoSuppressed && isMyTurn && !showConcedeSheet && !kongActionPending && (
          <button
            onClick={() => setTsumoSuppressed(false)}
            className="absolute right-2 font-bold text-sm px-3 py-2 rounded-xl animate-call-prompt-enter"
            style={{
              zIndex: 15,
              bottom: 'calc(var(--mj-hand-height, 80px) + 8px)',
              background: 'rgba(201,169,97,0.18)',
              border: '1px solid rgba(201,169,97,0.5)',
              color: '#c9a961',
              backdropFilter: 'blur(8px)',
            }}
          >
            {t('tsumoDeclare')}
          </button>
        )}

        {/* ── Accessible hand — sr-only DOM buttons for a11y + tests ─────────── */}
        <AccessibleHand
          hand={viewerHand}
          selectedTileIdx={pendingMove ? null : selectedTileIdx}
          onSelect={onSelect}
          onDiscard={handleDiscardOrKong}
          isMyTurn={isMyTurn && !pendingMove && !canTsumo}
          displayOrder={hudDisplayOrder}
        />

        {/* ── Collapsible history panel ──────────────────────────────────────── */}
        {!showConcedeSheet && !jingDiscardPending && !kongActionPending && (
          <GameHistoryPanel
            entries={historyEntries}
            isOpen={historyOpen}
            onToggle={() => setHistoryOpen((o) => !o)}
            snapshot={snapshot}
            isMobile={isMobile}
          />
        )}

        {/* ── Action toast ───────────────────────────────────────────────────── */}
        {toast && !showConcedeSheet && !jingDiscardPending && !kongActionPending && (
          <ActionToast toast={toast} snapshot={snapshot} />
        )}

        {/* ── Your Turn flash banner ─────────────────────────────────────────── */}
        {yourTurnFlash &&
          !claimWindow &&
          !showConcedeSheet &&
          !jingDiscardPending &&
          !kongActionPending && <YourTurnBanner />}

        {/* ── Waiting indicator — non-eligible viewer while claim window is open */}
        {snapshot.phase === 'awaiting_claims' &&
          !claimWindow &&
          !showConcedeSheet &&
          !jingDiscardPending &&
          !kongActionPending && <WaitingForClaimIndicator isMobile={isMobile} />}

        {/* ── Claim window rail ──────────────────────────────────────────────── */}
        {claimWindow && !showConcedeSheet && !jingDiscardPending && !kongActionPending && (
          <SideRail
            claimWindow={claimWindow}
            pendingDiscard={snapshot.pendingDiscard}
            onClaim={onClaim}
            onPass={onPass}
            isMobile={isMobile}
          />
        )}

        {/* ── Concede sheet ──────────────────────────────────────────────────── */}
        {showConcedeSheet && !jingDiscardPending && (
          <ConcedeSheet onConfirm={handleConcede} onCancel={() => setShowConcedeSheet(false)} />
        )}

        {/* ── Jing discard confirmation sheet ────────────────────────────────── */}
        {jingDiscardPending && (
          <JingDiscardConfirmSheet
            tile={jingDiscardPending}
            onConfirm={handleJingDiscardConfirm}
            onCancel={handleJingDiscardCancel}
          />
        )}

        {/* ── Kong action sheet ──────────────────────────────────────────────── */}
        {kongActionPending && !jingDiscardPending && (
          <KongActionSheet
            pending={kongActionPending}
            onKong={handleKongAction}
            onDiscard={handleKongActionDiscard}
          />
        )}

        {/* ── Tsumo bar (IMP-020) ─────────────────────────────────────────────── */}
        {/* Non-blocking compact bar — does NOT cover the hand/canvas.            */}
        {/* Dismissed → shows persistent "Declare Win" button instead (above).    */}
        {canTsumo &&
          isMyTurn &&
          !tsumoSuppressed &&
          !showConcedeSheet &&
          !jingDiscardPending &&
          !kongActionPending && (
            <TsumoBar
              onDeclare={onDeclareTsumo}
              onDismiss={() => setTsumoSuppressed(true)}
              isMobile={isMobile}
            />
          )}

        {/* ── A11y live region ───────────────────────────────────────────────── */}
        <div aria-live="polite" aria-atomic="true" className="sr-only" id="game-live-region">
          {isMyTurn ? t('gameYourTurn') : ''}
        </div>
      </div>
    </ForcedLandscapeWrapper>
  );
}

// ── Hand result announcement ──────────────────────────────────────────────────

/**
 * Builds the title/subtitle for the full-screen GameWinnerPopup announcement
 * shown when game:hand-reveal arrives, BEFORE any reveal/score screens
 * (BUG-025).
 *
 * Mid-session hands announce the hand result. The last hand announces the
 * SESSION winner (snapshot scores + the reveal's spirit deltas equal the
 * server's cumulative scores), with the hand result as the subtitle.
 */
function buildHandAnnouncement(
  reveal: HandRevealPayload,
  snapshot: ClientGameState,
  t: ReturnType<typeof useI18n>['t'],
): { title: string; subtitle?: string; isViewer: boolean } {
  const viewerSeat = snapshot.viewerSeat;

  const handResultLine =
    reveal.result === 'win' && reveal.winnerSeat !== undefined
      ? t('handRevealWinner', snapshot.seats[reveal.winnerSeat].seatName)
      : reveal.result === 'concede' && reveal.concedeSeat !== undefined
        ? t('handRevealConcedeBy', snapshot.seats[reveal.concedeSeat].seatName)
        : t('handRevealResultDraw');

  if (reveal.isLastHand) {
    const finals = snapshot.seats.map((s, i) => s.score + reveal.spiritDeltas[i]);
    const winnerSeat = finals.indexOf(Math.max(...finals));
    const isViewer = viewerSeat !== null && winnerSeat === viewerSeat;
    return {
      title: isViewer
        ? t('gameWinnerPopupYou')
        : t('gameWinnerPopupOther', snapshot.seats[winnerSeat].seatName),
      subtitle: handResultLine,
      isViewer,
    };
  }

  if (reveal.result === 'win' && reveal.winnerSeat !== undefined) {
    const isViewer = viewerSeat !== null && reveal.winnerSeat === viewerSeat;
    return {
      title: isViewer
        ? t('gameWinnerPopupYou')
        : t('gameWinnerPopupOther', snapshot.seats[reveal.winnerSeat].seatName),
      isViewer,
    };
  }

  return { title: handResultLine, isViewer: false };
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
  const { t } = useI18n();

  const spectate = searchParams.get('spectate') === '1';

  const {
    snapshot,
    ended,
    settlementPreview,
    handReveal,
    finalHandReveal,
    rematchRoomCode,
    connection,
    selectedTileIdx,
    claimWindow,
    toast,
    pendingMove,
    gameError,
    selectTile,
    canTsumo,
    discard,
    declareTsumo,
    kongConcealed,
    kongAdd,
    claim,
    pass,
    concede,
    advancePreGame,
    advanceHand,
    requestRematch,
    rollDice,
    onDiceAnimationComplete,
    diceAnimation,
  } = useGame(gameId ?? '', spectate);

  // ── Sound effects ─────────────────────────────────────────────────────────────
  const { playTilePlace, playPointTransfer } = useSound();

  const discardWithSound = useCallback(
    (tile: TileType) => {
      playTilePlace();
      discard(tile);
    },
    [discard, playTilePlace],
  );

  // Play point-transfer sound when post-hand scoring arrives.
  useEffect(() => {
    if (handReveal) playPointTransfer();
  }, [handReveal, playPointTransfer]);

  // Play point-transfer sound for opening spirit settlement toast.
  useEffect(() => {
    if (toast?.kind === 'opening_settlement') playPointTransfer();
  }, [toast, playPointTransfer]);

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

  // ── BUG-025: end-of-hand screen order ───────────────────────────────────────
  // 1. Winner announcement popup (first — fires when game:hand-reveal arrives)
  // 2. HandRevealScreen between hands / GameEndScreen results at session end
  // 3. Hand-detail review (last — reached from the results screen)

  // The reveal currently being announced. Stashed separately from the store so
  // the popup survives game:ended clearing `handReveal` mid-announcement.
  const [announcingReveal, setAnnouncingReveal] = useState<HandRevealPayload | null>(null);
  const announcedRevealRef = useRef<HandRevealPayload | null>(null);
  useEffect(() => {
    if (handReveal && announcedRevealRef.current !== handReveal) {
      announcedRevealRef.current = handReveal;
      setAnnouncingReveal(handReveal);
    }
  }, [handReveal]);

  // On the last hand the host client ends the session immediately — the old
  // "View Final Scores" click added nothing, and ending now lets game:ended
  // (placement, ELO) arrive while the announcement is still on screen. If the
  // emit is lost, HandRevealScreen renders after the announcement with the
  // manual button as a fallback.
  const autoAdvancedRef = useRef<HandRevealPayload | null>(null);
  useEffect(() => {
    if (!handReveal?.isLastHand || ended) return;
    const vs = snapshot?.viewerSeat;
    if (vs === null || vs === undefined) return;
    // Advance if: I am the dealer, OR the dealer is a bot and I'm the first human seat.
    const botDealer = snapshot?.seats[snapshot.dealerSeat]?.isBot === true;
    const firstHuman = snapshot?.seats.findIndex((s) => !s.isBot);
    const shouldAdvance = vs === snapshot?.dealerSeat || (botDealer && vs === firstHuman);
    if (!shouldAdvance) return;
    if (autoAdvancedRef.current === handReveal) return;
    autoAdvancedRef.current = handReveal;
    advanceHand();
  }, [handReveal, ended, snapshot, advanceHand]);

  // True while the player is reviewing the final hand's details from the
  // results screen — the last screen of the end-of-game sequence.
  const [showEndDetails, setShowEndDetails] = useState(false);

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
  // When the dealer seat is occupied by a bot, the server allows any human to advance.
  // Client-side we assign that role to the first non-bot seat so only one human shows
  // the Continue button and emits game:advance-hand.
  const dealerIsBot = snapshot.seats[snapshot.dealerSeat]?.isBot === true;
  const firstHumanSeat = snapshot.seats.findIndex((s) => !s.isBot) as 0 | 1 | 2 | 3 | -1;
  const canAdvanceHand =
    isDealer || (dealerIsBot && viewerSeat !== null && viewerSeat === firstHumanSeat);
  const announcement = announcingReveal
    ? buildHandAnnouncement(announcingReveal, snapshot, t)
    : null;

  return (
    <>
      {/* ── Winner announcement — always the FIRST screen after a hand ends ── */}
      {announcement && (
        <GameWinnerPopup
          title={announcement.title}
          subtitle={announcement.subtitle}
          isViewer={announcement.isViewer}
          onClose={() => setAnnouncingReveal(null)}
        />
      )}

      {/* ── Post-hand reveal (paused between hands) ──────────────────────── */}
      {/* Also the last-hand fallback when game:ended hasn't arrived — the    */}
      {/* host still has the manual "View Final Scores" button there.        */}
      {handReveal && !announcingReveal && (
        <HandRevealScreen
          handReveal={handReveal}
          snapshot={snapshot}
          isHost={canAdvanceHand}
          onAdvance={advanceHand}
        />
      )}

      {/* ── Pre-game reveal flow ──────────────────────────────────────────── */}
      {/* Shown whenever preGamePhase is not null (and not 'dealing' — that     */}
      {/* phase only shows a loading state since DiceRollOverlay covers it).    */}
      {!handReveal && !announcingReveal && snapshot.preGamePhase !== null && (
        <PreGameFlow
          snapshot={snapshot}
          settlementPreview={settlementPreview}
          isHost={canAdvanceHand}
          onAdvance={advancePreGame}
        />
      )}

      {/* ── Dice roll overlay — always on top, shown during roll pauses ────── */}
      {(snapshot.pendingRoll !== null || diceAnimation !== null) && (
        <DiceRollOverlay
          snapshot={snapshot}
          diceAnimation={diceAnimation}
          onRoll={rollDice}
          onAnimationComplete={onDiceAnimationComplete}
        />
      )}

      {/* ── Active game table ─────────────────────────────────────────────── */}
      {/* Only rendered when the pre-game sequence is complete (preGamePhase=null). */}
      {!handReveal &&
        snapshot.preGamePhase === null &&
        (snapshot.phase === 'playing' || snapshot.phase === 'awaiting_claims') && (
          <GameTable
            snapshot={snapshot}
            selectedTileIdx={selectedTileIdx}
            claimWindow={claimWindow}
            canTsumo={canTsumo}
            toast={toast}
            pendingMove={pendingMove}
            onSelect={selectTile}
            onDiscard={discardWithSound}
            onKongConcealed={kongConcealed}
            onKongAdd={kongAdd}
            onClaim={claim}
            onPass={pass}
            onConcede={concede}
            onDeclareTsumo={declareTsumo}
          />
        )}

      {/* ── Session end — results screen, then hand-detail review (last) ──── */}
      {!handReveal &&
        !announcingReveal &&
        snapshot.preGamePhase === null &&
        snapshot.phase === 'finished' &&
        (showEndDetails && finalHandReveal ? (
          <HandRevealScreen
            handReveal={finalHandReveal}
            snapshot={snapshot}
            isHost={false}
            mode="review"
            onBack={() => setShowEndDetails(false)}
          />
        ) : (
          <GameEndScreen
            snapshot={snapshot}
            ended={ended}
            viewerSeat={viewerSeat}
            onHome={handleHome}
            onRematch={requestRematch}
            onViewDetails={finalHandReveal ? () => setShowEndDetails(true) : undefined}
          />
        ))}

      {/* ── Loading / dealing ─────────────────────────────────────────────── */}
      {!handReveal &&
        snapshot.preGamePhase === null &&
        snapshot.phase !== 'playing' &&
        snapshot.phase !== 'awaiting_claims' &&
        snapshot.phase !== 'finished' && <LoadingScreen />}

      {connection === 'reconnecting' && <ReconnectingOverlay />}
    </>
  );
}
