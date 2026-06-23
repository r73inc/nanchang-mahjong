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
import { LangToggle, useI18n } from '../../i18n';
import { connectSocket } from '../../lib/socket';
import { useAuthStore } from '../../stores/auth.store';
import {
  tileAriaLabel,
  engineToDesignTile,
  decomposeConcealed,
  sortTypes,
  WIND_CHOWS,
  DRAGON_CHOW,
  calculateEffectiveSpiritScores,
} from '@nanchang/shared';
import type {
  ClientGameState,
  TileType,
  SeatWind,
  GameEndedPayload,
  SettlementPreviewPayload,
  HandRevealPayload,
  Meld,
  RestoreHistoryPayload,
  RestoreStatusPayload,
  GameSavedPayload,
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

const BOT_NAME_KEYS: Partial<Record<string, 'botNameMilky' | 'botNameMelon' | 'botNameFifth'>> = {
  MilkyBot: 'botNameMilky',
  MelonBot: 'botNameMelon',
  FifthBot: 'botNameFifth',
};

/** Returns the localized display name for any seat, translating known bot names via i18n. */
function sdn(s: { seatName: string; isBot?: boolean }, t: ReturnType<typeof useI18n>['t']): string {
  const key = s.isBot ? BOT_NAME_KEYS[s.seatName] : undefined;
  return key ? t(key) : s.seatName;
}

function getCompassSeats(viewerSeat: 0 | 1 | 2 | 3) {
  return {
    right: ((viewerSeat + 1) % 4) as 0 | 1 | 2 | 3,
    across: ((viewerSeat + 2) % 4) as 0 | 1 | 2 | 3,
    left: ((viewerSeat + 3) % 4) as 0 | 1 | 2 | 3,
  };
}

const WIND_CHAR: Record<SeatWind, string> = { east: '東', south: '南', west: '西', north: '北' };

const SCORE_SEP = ': ' as const;
const MULT_CHAR = '×' as const;
const CHEVRON_UP = '▲' as const;
const CHEVRON_DOWN = '▼' as const;
const ARROW_RIGHT = '→ ' as const;

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
        className="px-8 py-3.5 rounded-[14px] font-bold text-sm text-mj-ink"
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
      className="px-8 py-3.5 rounded-[14px] font-bold text-sm text-mj-ink"
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
  isHuman,
  onAdvance,
}: {
  snapshot: ClientGameState;
  settlementPreview: SettlementPreviewPayload | null;
  isHuman: boolean;
  onAdvance: () => void;
}) {
  const { t, lang } = useI18n();
  const phase = snapshot.preGamePhase;
  const viewerSeat = snapshot.viewerSeat;
  const myHand: TileType[] = viewerSeat !== null ? (snapshot.seats[viewerSeat].hand ?? []) : [];

  const readySeats: readonly (0 | 1 | 2 | 3)[] = snapshot.preGameReadySeats ?? [];
  const iAmReady = viewerSeat !== null && readySeats.includes(viewerSeat);
  const pendingNames = ([0, 1, 2, 3] as const)
    .filter((s) => !snapshot.seats[s]?.isBot && !readySeats.includes(s))
    .map((s) => snapshot.seats[s].seatName)
    .join(', ');

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
    return (
      <div
        className="flex flex-col items-center justify-center gap-8 min-h-dvh px-6 text-center bg-mj-bg-page"
        aria-label={t('preGameYourHand')}
      >
        <div>
          <h1 className="text-2xl font-serif font-bold text-mj-bone">{t('preGameYourHand')}</h1>
          <p className="text-sm text-mj-bone/60 mt-1">{t('preGameHandDesc')}</p>
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

        {isHuman && !iAmReady && (
          <GoldButton onClick={onAdvance}>{t('preGameReadyBtn')}</GoldButton>
        )}
        {(!isHuman || iAmReady) && (
          <div className="flex flex-col items-center gap-2">
            <WaitingDots />
            <p className="text-xs text-mj-bone/55">
              {pendingNames ? t('preGameWaitingFor', pendingNames) : t('preGameWaitingHost')}
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Step 1.5: Settlement — bonus tile payout (ruleTopBottomJing only) ──────
  if (phase === 'settlement') {
    if (!settlementPreview) return <LoadingScreen />;
    const footer =
      isHuman && !iAmReady ? (
        <GoldButton onClick={onAdvance}>{t('preGameReadyBtn')}</GoldButton>
      ) : (
        <>
          <WaitingDots />
          <p className="text-xs text-mj-bone/40">
            {pendingNames ? t('preGameWaitingFor', pendingNames) : t('preGameWaitingHost')}
          </p>
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
          <h1 className="text-2xl font-serif font-bold text-mj-bone">{t('gameSpiritTiles')}</h1>
          <p className="text-sm text-mj-bone/60 mt-1">
            {t(
              'gameSpiritDesc',
              primary ? tileAriaLabel(primary, lang) : '',
              secondary ? tileAriaLabel(secondary, lang) : '',
            )}
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

        {isHuman && !iAmReady && (
          <GoldButton onClick={onAdvance}>{t('preGameReadyBtn')}</GoldButton>
        )}
        {(!isHuman || iAmReady) && (
          <div className="flex flex-col items-center gap-3">
            <WaitingDots />
            <p className="text-xs text-mj-bone/55">
              {pendingNames ? t('preGameWaitingFor', pendingNames) : t('preGameWaitingHost')}
            </p>
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
  isHuman,
  isActualHost,
  onAdvance,
  onSetFinalHand,
  mode = 'pause',
  onBack,
}: {
  handReveal: HandRevealPayload;
  snapshot: ClientGameState;
  isHuman: boolean;
  isActualHost: boolean;
  onAdvance?: () => void;
  onSetFinalHand?: (active: boolean) => void;
  mode?: 'pause' | 'review';
  onBack?: () => void;
}) {
  const { t, lang } = useI18n();
  const viewerSeat = snapshot.viewerSeat;

  const readySeats: readonly (0 | 1 | 2 | 3)[] = snapshot.handEndReadySeats ?? [];
  const iAmReady = viewerSeat !== null && readySeats.includes(viewerSeat);
  const pendingNames = ([0, 1, 2, 3] as const)
    .filter((s) => !snapshot.seats[s]?.isBot && !readySeats.includes(s))
    .map((s) => snapshot.seats[s].seatName)
    .join(', ');

  const [expandedSeat, setExpandedSeat] = useState<number | null>(null);

  const MELD_KIND_LABEL: Record<Meld['kind'], string> = {
    pung: t('gamePung'),
    chow: t('gameChow'),
    kong: t('gameKong'),
  };
  const PAIR_LABEL = t('handPair');

  const effectiveSpiritScores = calculateEffectiveSpiritScores(handReveal.spiritCounts);
  const spiritHasAny =
    handReveal.spiritDeltas.some((d) => d !== 0) &&
    (handReveal.jingPrimary !== null || handReveal.jingSecondary !== null);
  const sortedSeats = ([0, 1, 2, 3] as const).slice().sort((a, b) => {
    const totalA = snapshot.seats[a].score + handReveal.spiritDeltas[a];
    const totalB = snapshot.seats[b].score + handReveal.spiritDeltas[b];
    return totalB - totalA;
  });

  const handTypeLabel =
    (handReveal.handType ?? 'standard') !== 'standard'
      ? handReveal.handType === 'seven_pairs'
        ? t('handTypeSevenPairs')
        : handReveal.handType === 'all_triplets'
          ? t('handTypeAllTriplets')
          : handReveal.handType === 'thirteen_misfits'
            ? t('handTypeThirteenMisfits')
            : t('handTypeSevenStarThirteen')
      : null;

  if (handReveal.result === 'win' && handReveal.winnerSeat === undefined) {
    throw new Error('Invalid domain state: Win condition missing winnerSeat');
  }
  const headingLabel =
    handReveal.result === 'win'
      ? t('handRevealWinsHeading', sdn(snapshot.seats[handReveal.winnerSeat!], t))
      : handReveal.result === 'concede'
        ? t('handRevealResultConcede')
        : t('handRevealResultDraw');

  return (
    <div className="min-h-dvh bg-mj-bg-page overflow-y-auto">
      <div className="flex flex-col items-center gap-6 px-4 py-8 max-w-lg mx-auto">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-mj-bone/40 mb-1">
            {t('handRevealTitle')}
          </p>
          <h1 className="text-2xl font-serif font-bold text-mj-bone">{headingLabel}</h1>
          {handReveal.concedeSeat !== undefined && (
            <p className="text-sm text-mj-bone/60 mt-1">
              {t('handRevealConcedeBy', sdn(snapshot.seats[handReveal.concedeSeat], t))}
            </p>
          )}
        </div>

        {/* ── Unified sorted results table ─────────────────────────────────── */}
        <div className="flex flex-col gap-2 w-full">
          {sortedSeats.map((seat) => {
            const wind = snapshot.seats[seat].wind;
            const seatName = sdn(snapshot.seats[seat], t);
            const isViewer = seat === viewerSeat;
            const isWinner = seat === handReveal.winnerSeat;
            const delta = handReveal.handNetDeltas[seat];
            const totalScore = snapshot.seats[seat].score + handReveal.spiritDeltas[seat];
            const isExp = expandedSeat === seat;

            const winPayDelta = handReveal.winPayment?.scoreDelta[seat] ?? 0;
            const spiritDelta = handReveal.spiritDeltas[seat];
            const bonusTileDelta = handReveal.openingJingDelta?.[seat] ?? 0;
            const kongDelta = delta - winPayDelta - spiritDelta - bonusTileDelta;
            const hasWinSection =
              handReveal.result === 'win' && handReveal.winPayment !== undefined;
            const hasBreakdown =
              hasWinSection || spiritHasAny || kongDelta !== 0 || bonusTileDelta !== 0;

            return (
              <div
                key={seat}
                className="rounded-xl overflow-hidden"
                style={
                  isViewer
                    ? {
                        background: 'rgba(201,169,97,0.15)',
                        border: '1px solid rgba(201,169,97,0.3)',
                      }
                    : { background: 'rgba(var(--felt-ink-rgb),0.05)' }
                }
              >
                {/* ── Collapsed row ── */}
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                  onClick={() => hasBreakdown && setExpandedSeat(isExp ? null : seat)}
                  aria-expanded={hasBreakdown ? isExp : undefined}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="text-sm font-bold shrink-0"
                      style={{ color: WIND_COLOR[wind] }}
                    >
                      {WIND_CHAR[wind]}
                    </span>
                    <span
                      className="text-sm font-bold truncate"
                      style={{ color: WIND_COLOR[wind] }}
                    >
                      {seatName}
                    </span>
                    {isWinner && (
                      <span className="text-[10px] bg-mj-gold/20 text-mj-gold px-1.5 py-0.5 rounded font-bold uppercase tracking-wide shrink-0">
                        {t('handRevealWinnerBadge')}
                      </span>
                    )}
                    {handTypeLabel && isWinner && (
                      <span className="text-[10px] bg-mj-gold/10 text-mj-gold/70 px-1.5 py-0.5 rounded shrink-0">
                        {handTypeLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex flex-col items-end">
                      <span
                        className={`text-base font-bold tabular-nums ${
                          delta > 0
                            ? 'text-mj-win'
                            : delta < 0
                              ? 'text-mj-loss-light'
                              : 'text-mj-bone/40'
                        }`}
                      >
                        {totalScore}
                      </span>
                      {delta !== 0 && (
                        <span
                          className={`text-[11px] tabular-nums leading-none ${
                            delta > 0 ? 'text-mj-win/60' : 'text-mj-loss-light/60'
                          }`}
                        >
                          {delta > 0 ? '+' : ''}
                          {delta}
                        </span>
                      )}
                    </div>
                    {hasBreakdown && (
                      <span className="text-mj-bone/30 text-[10px]" aria-hidden>
                        {isExp ? CHEVRON_UP : CHEVRON_DOWN}
                      </span>
                    )}
                  </div>
                </button>

                {/* ── Expanded breakdown ── */}
                {isExp && (
                  <div className="px-4 pb-4 flex flex-col gap-3 border-t border-white/[0.06] pt-3">
                    {/* Hand net summary — always first in the expanded view */}
                    <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                      <p className="text-[10px] font-bold tracking-widest text-mj-bone/40 uppercase">
                        {t('handRevealBreakdownHandNetLabel')}
                      </p>
                      <p
                        className={`text-sm font-bold tabular-nums ${
                          delta > 0
                            ? 'text-mj-win'
                            : delta < 0
                              ? 'text-mj-loss-light'
                              : 'text-mj-bone/40'
                        }`}
                      >
                        {delta > 0 ? '+' : ''}
                        {delta}
                      </p>
                    </div>

                    {/* Section 1 — Win payment */}
                    {hasWinSection &&
                      handReveal.winPayment &&
                      (() => {
                        const wp = handReveal.winPayment!;
                        if (isWinner) {
                          const liableName =
                            handReveal.liableSeat !== undefined
                              ? sdn(snapshot.seats[handReveal.liableSeat], t)
                              : undefined;
                          const ronKey =
                            handReveal.winMeldKind === 'chow'
                              ? 'handRevealBreakdownWinRonChow'
                              : handReveal.winMeldKind === 'pung'
                                ? 'handRevealBreakdownWinRonPung'
                                : handReveal.winMeldKind === 'pair'
                                  ? 'handRevealBreakdownWinRonPair'
                                  : 'handRevealBreakdownWinRonNamed';
                          const winTypeLabel = handReveal.isRobKong
                            ? liableName
                              ? t('handRevealBreakdownWinRobKongNamed', liableName)
                              : t('handRevealBreakdownWinRobKong')
                            : handReveal.winType === 'tsumo'
                              ? t('handRevealBreakdownWinTsumo')
                              : liableName
                                ? t(ronKey, liableName)
                                : t('handRevealBreakdownWinRon');
                          return (
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-bold bg-mj-win/15 text-mj-win px-1.5 py-0.5 rounded uppercase tracking-wide">
                                  {winTypeLabel}
                                </span>
                                {handTypeLabel && (
                                  <span className="text-[10px] font-bold bg-mj-gold/15 text-mj-gold px-1.5 py-0.5 rounded uppercase tracking-wide">
                                    {handTypeLabel}
                                  </span>
                                )}
                              </div>
                              {/* Multiplier chain */}
                              <div className="flex flex-wrap items-center gap-1 text-[11px] text-mj-bone/50">
                                <span>{t('handRevealBreakdownBase')}</span>
                                {wp.items.map((item, ii) => (
                                  <span key={ii} className="flex items-center gap-1">
                                    <span className="text-mj-bone/30">{MULT_CHAR}</span>
                                    <span
                                      className="px-1.5 py-0.5 rounded text-mj-bone/70"
                                      style={{ background: 'rgba(var(--felt-ink-rgb),0.08)' }}
                                    >
                                      {lang === 'zh' ? item.nameZh : item.name} {MULT_CHAR}
                                      {item.multiplier}
                                    </span>
                                  </span>
                                ))}
                                <span className="text-mj-bone/70 font-bold">
                                  {ARROW_RIGHT}
                                  {t('handRevealBreakdownTotalMult', String(wp.totalMultiplier))}
                                </span>
                              </div>
                              {wp.flatBonusPerLoser > 0 && (
                                <p className="text-[11px] text-mj-bone/40">
                                  {t(
                                    'handRevealBreakdownFlatPerPlayer',
                                    String(wp.flatBonusPerLoser),
                                  )}
                                </p>
                              )}
                              {/* Payments received from each loser */}
                              {([0, 1, 2, 3] as const)
                                .filter((s) => s !== seat)
                                .map((loser) => {
                                  const received = -wp.scoreDelta[loser];
                                  if (received === 0) return null;
                                  return (
                                    <p key={loser} className="text-[12px] text-mj-win/80">
                                      {t(
                                        'handRevealBreakdownReceivedFrom',
                                        String(received),
                                        sdn(snapshot.seats[loser], t),
                                      )}
                                    </p>
                                  );
                                })}
                              <p className="text-sm font-bold text-mj-win">
                                {t('handRevealBreakdownWinTotal', String(wp.winnerTotal))}
                              </p>
                            </div>
                          );
                        } else {
                          const loseTypeLabel =
                            handReveal.winType === 'tsumo'
                              ? t('handRevealBreakdownLoseTsumo')
                              : handReveal.liableSeat === seat
                                ? handReveal.isRobKong
                                  ? t('handRevealBreakdownWinRobKong')
                                  : t('handRevealBreakdownLoseDiscard')
                                : t('handRevealBreakdownLoseBystander');
                          const paid = Math.abs(wp.scoreDelta[seat]);
                          const winnerName =
                            handReveal.winnerSeat !== undefined
                              ? sdn(snapshot.seats[handReveal.winnerSeat], t)
                              : '';
                          return (
                            <div className="flex flex-col gap-1.5">
                              <span className="text-[10px] font-bold bg-mj-loss-light/15 text-mj-loss-light px-1.5 py-0.5 rounded uppercase tracking-wide self-start">
                                {loseTypeLabel}
                              </span>
                              {paid > 0 && (
                                <p className="text-[12px] text-mj-loss-light/80">
                                  {t('handRevealBreakdownPaidWinner', winnerName, String(paid))}
                                </p>
                              )}
                            </div>
                          );
                        }
                      })()}

                    {/* Section 2 — Spirit settlement */}
                    {spiritHasAny &&
                      (() => {
                        const counts = handReveal.spiritCounts[seat];
                        const effScore = effectiveSpiritScores[seat];
                        const rawScore =
                          counts.primary * 2 + counts.secondary + counts.spiritKongs * 10;
                        const isExplosive = rawScore >= 5;
                        const playersWithSpirits = effectiveSpiritScores.filter(
                          (s) => s > 0,
                        ).length;
                        const isIndomitable = playersWithSpirits === 1 && effScore > 0;
                        const sDelta = handReveal.spiritDeltas[seat];
                        return (
                          <div className="flex flex-col gap-1.5">
                            <p className="text-[10px] font-bold tracking-widest text-mj-gold/50 uppercase">
                              {t('handRevealBreakdownSpiritHeader')}
                            </p>
                            {/* Tile icons + holdings */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {handReveal.jingPrimary && counts.primary > 0 && (
                                <span className="flex items-center gap-1">
                                  <MahjongTile2D
                                    tile={handReveal.jingPrimary}
                                    size="xs"
                                    interactive={false}
                                    isJing
                                    showJingLabel={false}
                                  />
                                  <span className="text-[11px] text-mj-bone/60">
                                    {MULT_CHAR}
                                    {counts.primary}
                                  </span>
                                </span>
                              )}
                              {handReveal.jingSecondary && counts.secondary > 0 && (
                                <span className="flex items-center gap-1">
                                  <MahjongTile2D
                                    tile={handReveal.jingSecondary}
                                    size="xs"
                                    interactive={false}
                                    showJingLabel={false}
                                  />
                                  <span className="text-[11px] text-mj-bone/60">
                                    {MULT_CHAR}
                                    {counts.secondary}
                                  </span>
                                </span>
                              )}
                              {counts.spiritKongs > 0 && (
                                <span className="text-[11px] text-mj-bone/60">
                                  {t('handRevealBreakdownSpiritKongs', String(counts.spiritKongs))}
                                </span>
                              )}
                              {counts.primary === 0 &&
                                counts.secondary === 0 &&
                                counts.spiritKongs === 0 && (
                                  <span className="text-[11px] text-mj-bone/30">—</span>
                                )}
                            </div>
                            {effScore > 0 && (
                              <div className="flex flex-wrap gap-1 text-[11px]">
                                {isExplosive && (
                                  <span className="bg-mj-spirit-hot/15 text-mj-spirit-hot px-1.5 py-0.5 rounded">
                                    {t('handRevealBreakdownSpiritExplosive')}
                                  </span>
                                )}
                                {isIndomitable && (
                                  <span className="bg-mj-spirit-lone/15 text-mj-spirit-lone px-1.5 py-0.5 rounded">
                                    {t('handRevealBreakdownSpiritIndomitable')}
                                  </span>
                                )}
                                <span className="text-mj-bone/50">
                                  {t('handRevealBreakdownSpiritEffective', String(effScore))}
                                </span>
                              </div>
                            )}
                            <p
                              className={`text-sm font-bold tabular-nums ${
                                sDelta > 0
                                  ? 'text-mj-win'
                                  : sDelta < 0
                                    ? 'text-mj-loss-light'
                                    : 'text-mj-bone/40'
                              }`}
                            >
                              {t(
                                'handRevealBreakdownSpiritNet',
                                sDelta > 0 ? `+${sDelta}` : String(sDelta),
                              )}
                            </p>
                          </div>
                        );
                      })()}

                    {/* Section 3 — Kong payouts */}
                    {kongDelta !== 0 && (
                      <div className="flex flex-col gap-1">
                        <p className="text-[10px] font-bold tracking-widest text-mj-gold/50 uppercase">
                          {t('handRevealBreakdownKongHeader')}
                        </p>
                        <p
                          className={`text-sm font-bold tabular-nums ${
                            kongDelta > 0 ? 'text-mj-win' : 'text-mj-loss-light'
                          }`}
                        >
                          {t(
                            'handRevealBreakdownKongNet',
                            kongDelta > 0 ? `+${kongDelta}` : String(kongDelta),
                          )}
                        </p>
                      </div>
                    )}

                    {/* Section 4 — Bonus tile (opening jing settlement) */}
                    {bonusTileDelta !== 0 && (
                      <div className="flex flex-col gap-1">
                        <p className="text-[10px] font-bold tracking-widest text-mj-gold/50 uppercase">
                          {t('handRevealBreakdownBonusTileHeader')}
                        </p>
                        <p
                          className={`text-sm font-bold tabular-nums ${
                            bonusTileDelta > 0 ? 'text-mj-win' : 'text-mj-loss-light'
                          }`}
                        >
                          {t(
                            'handRevealBreakdownBonusTileNet',
                            bonusTileDelta > 0 ? `+${bonusTileDelta}` : String(bonusTileDelta),
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

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
                  className="rounded-xl p-3"
                  style={
                    isViewer
                      ? {
                          background: 'rgba(201,169,97,0.10)',
                          border: '1px solid rgba(201,169,97,0.2)',
                        }
                      : { background: 'rgba(var(--felt-ink-rgb),0.04)' }
                  }
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-bold" style={{ color: WIND_COLOR[wind] }}>
                      {WIND_CHAR[wind]}
                    </span>
                    <span className="text-xs text-mj-bone/70 font-medium">
                      {sdn(snapshot.seats[i], t)}
                    </span>
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

                    // Pre-compute the exact position of the winning tile so we can
                    // highlight it without mutable state during render.
                    // The engine always stores the winning tile in the 14-tile final hand
                    // (ron: discard appended; tsumo: drawn tile already present).
                    let winGIdx = -1;
                    let winTIdx = -1;
                    let winUIdx = -1;
                    if (isWinner && handReveal.winningTile) {
                      outer: for (let gi = 0; gi < groups.length; gi++) {
                        for (let ti = 0; ti < groups[gi].tiles.length; ti++) {
                          if (groups[gi].tiles[ti] === handReveal.winningTile) {
                            winGIdx = gi;
                            winTIdx = ti;
                            break outer;
                          }
                        }
                      }
                      if (winGIdx === -1) {
                        winUIdx = ungrouped.indexOf(handReveal.winningTile);
                      }
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
                              isWinningTile={j === winUIdx}
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
                                  isWinningTile={gi === winGIdx && ti === winTIdx}
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
                                isWinningTile={ui === winUIdx}
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

        {/* ── Final hand badge ─────────────────────────────────────────────── */}
        {mode !== 'review' && handReveal.isLastHand && (
          <div
            className="px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase"
            style={{
              background: 'rgba(201,169,97,0.15)',
              border: '1px solid rgba(201,169,97,0.5)',
              color: '#c9a961',
            }}
          >
            {t('handRevealLastHandBadge')}
          </div>
        )}

        {/* ── Continue / waiting / back ────────────────────────────────────── */}
        <div className="pt-2 pb-4 flex flex-col items-center gap-3 w-full max-w-[280px] mx-auto">
          {mode === 'review' ? (
            <GoldButton onClick={onBack ?? (() => undefined)}>
              {t('endGameBackToResults')}
            </GoldButton>
          ) : (
            <>
              {/* Force-final toggle — actual host only, not on the last hand */}
              {isActualHost && !handReveal.isLastHand && (
                <button
                  onClick={() => onSetFinalHand?.(!snapshot.forcedFinalNextHand)}
                  className="w-full py-2.5 rounded-full font-semibold text-xs"
                  style={{
                    background: snapshot.forcedFinalNextHand
                      ? 'rgba(201,169,97,0.15)'
                      : 'rgba(var(--felt-ink-rgb),0.06)',
                    border: snapshot.forcedFinalNextHand
                      ? '1px solid rgba(201,169,97,0.40)'
                      : '1px solid rgba(var(--felt-ink-rgb),0.15)',
                    color: snapshot.forcedFinalNextHand ? '#c9a961' : 'var(--felt-ink,#f5efdf)',
                  }}
                >
                  {snapshot.forcedFinalNextHand
                    ? t('handRevealForceFinalActive')
                    : t('handRevealForceFinal')}
                </button>
              )}

              {/* Badge shown to all players when host has queued a forced final */}
              {!isActualHost && snapshot.forcedFinalNextHand && !handReveal.isLastHand && (
                <p className="text-[11px] font-semibold text-mj-gold/80 tracking-wide">
                  {t('handRevealForceFinalBadge')}
                </p>
              )}

              {/* Ready / waiting */}
              {isHuman && !iAmReady ? (
                handReveal.isLastHand ? (
                  <button
                    onClick={onAdvance ?? (() => undefined)}
                    className="w-full py-4 rounded-full font-bold text-base"
                    style={{
                      background: 'linear-gradient(180deg,#c9a961 0%,#a88a45 100%)',
                      boxShadow: '0 6px 18px rgba(201,169,97,0.45)',
                      color: '#1a1a1a',
                    }}
                  >
                    {t('handRevealEndSession')} →
                  </button>
                ) : (
                  <button
                    onClick={onAdvance ?? (() => undefined)}
                    className="w-full py-3 rounded-full font-bold text-sm"
                    style={{
                      background: 'rgba(var(--felt-ink-rgb),0.08)',
                      border: '1px solid rgba(var(--felt-ink-rgb),0.2)',
                      color: 'var(--felt-ink,#f5efdf)',
                    }}
                  >
                    {t('handRevealContinue')} →
                  </button>
                )
              ) : (
                <>
                  <WaitingDots />
                  <p className="text-xs text-mj-bone/40">
                    {pendingNames
                      ? t('handRevealWaitingFor', pendingNames)
                      : handReveal.isLastHand
                        ? t('handRevealWaitingHostEnd')
                        : t('handRevealWaitingHost')}
                  </p>
                </>
              )}
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

function MatchEndStatsScreen({
  snapshot,
  ended,
  viewerSeat,
  gameId,
  onHome,
  onViewFinalHand,
}: {
  snapshot: ClientGameState;
  ended: GameEndedPayload | null;
  viewerSeat: 0 | 1 | 2 | 3 | null;
  gameId?: string;
  onHome: () => void;
  onViewFinalHand?: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  // Prefer the authoritative finalScores from game:ended — snapshot seat scores
  // exclude the final hand's spirit settlement (no snapshot follows endSession).
  const scores = (ended ? ended.finalScores : snapshot.seats.map((s) => s.score)) as [
    number,
    number,
    number,
    number,
  ];
  const myPlacement = viewerSeat !== null && ended ? ended.placement[viewerSeat] : null;
  const myRatingDelta =
    viewerSeat !== null && ended?.ratingDeltas ? ended.ratingDeltas[viewerSeat] : null;

  // Sort seats by final score descending for display
  const sortedSeatIndices = ([0, 1, 2, 3] as const)
    .slice()
    .sort((a, b) => scores[b] - scores[a]) as (0 | 1 | 2 | 3)[];

  const hasStats = !!ended?.handsWon;

  return (
    <div className="min-h-dvh bg-mj-bg-page overflow-y-auto">
      <div className="flex flex-col items-center gap-6 px-4 py-8 max-w-lg mx-auto">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="text-center">
          <p className="text-[11px] font-bold tracking-widest text-mj-gold/70 uppercase mb-1">
            {t('matchEndTitle')}
          </p>
          {ended && (
            <p className="text-xs text-mj-bone/40">
              {t('endGameHandsPlayed').replace('{{0}}', String(ended.handsPlayed))}
            </p>
          )}
        </div>

        {/* ── Viewer placement + ELO ──────────────────────────────────────── */}
        {myPlacement && (
          <p
            className="text-[13px] font-bold tracking-widest uppercase"
            style={{ color: myPlacement === 1 ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.4)' }}
          >
            {t(PLACEMENT_KEY[myPlacement])}
          </p>
        )}

        {myRatingDelta !== null && (
          <p
            className="text-sm font-mono font-bold"
            style={{ color: myRatingDelta >= 0 ? '#7fc299' : '#e88080' }}
          >
            {myRatingDelta >= 0 ? '+' : ''}
            {myRatingDelta} {t('matchEndRatingChange')}
          </p>
        )}

        {/* ── Final standings ─────────────────────────────────────────────── */}
        <div
          className="w-full rounded-xl p-4"
          style={{
            background: 'rgba(var(--felt-ink-rgb),0.05)',
            border: '1px solid rgba(var(--felt-ink-rgb),0.1)',
          }}
        >
          <p className="text-xs font-bold tracking-widest text-mj-gold/70 uppercase mb-3">
            {t('matchEndFinalStandings')}
          </p>
          {sortedSeatIndices.map((i, rank) => {
            const seat = snapshot.seats[i];
            const isMe = i === viewerSeat;
            const seatPlacement = ended ? ended.placement[i] : ((rank + 1) as 1 | 2 | 3 | 4);
            return (
              <div key={i} className="flex items-center justify-between py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-bold w-5 text-center"
                    style={{
                      color: seatPlacement === 1 ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.3)',
                    }}
                  >
                    #{seatPlacement}
                  </span>
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: WIND_COLOR[seat.wind] }}
                  />
                  <span className="text-mj-bone/80 max-w-[120px] truncate font-medium">
                    {sdn(seat, t)}
                  </span>
                  {isMe && (
                    <span className="text-[10px] text-mj-gold/60">{t('matchEndYouLabel')}</span>
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

        {/* ── Per-player stat breakdown ────────────────────────────────────── */}
        {hasStats && (
          <div
            className="w-full rounded-xl p-4"
            style={{
              background: 'rgba(var(--felt-ink-rgb),0.05)',
              border: '1px solid rgba(var(--felt-ink-rgb),0.1)',
            }}
          >
            <p className="text-xs font-bold tracking-widest text-mj-gold/70 uppercase mb-3">
              {t('matchEndPlayerStats')}
            </p>

            {/* Column headers */}
            <div className="grid grid-cols-5 gap-1 text-[9px] font-bold text-mj-bone/30 uppercase mb-1 px-1">
              <div />
              <div className="text-center">{t('matchEndHandsWon')}</div>
              <div className="text-center">{t('matchEndSpiritPoints')}</div>
              <div className="text-center">{t('matchEndBonusTile')}</div>
              <div className="text-center">{t('matchEndBestHand')}</div>
            </div>

            {sortedSeatIndices.map((i) => {
              const seat = snapshot.seats[i];
              const isMe = i === viewerSeat;
              const handsWon = ended!.handsWon![i] ?? 0;
              const spirit = ended!.sessionSpiritPoints?.[i] ?? 0;
              const bonus = ended!.sessionBonusTilePoints?.[i] ?? 0;
              const best = ended!.bestHandPoints?.[i] ?? 0;
              return (
                <div
                  key={i}
                  className="grid grid-cols-5 gap-1 py-2 items-center"
                  style={{ borderTop: '1px solid rgba(var(--felt-ink-rgb),0.07)' }}
                >
                  <div className="flex items-center gap-1 overflow-hidden">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: WIND_COLOR[seat.wind] }}
                    />
                    <span
                      className="text-[11px] truncate"
                      style={{
                        color: isMe ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.6)',
                        fontWeight: isMe ? 700 : 400,
                      }}
                    >
                      {isMe ? t('matchEndYouLabel') : sdn(seat, t).split(' ')[0]}
                    </span>
                  </div>
                  <div className="text-center font-mono text-xs text-mj-bone/80">{handsWon}</div>
                  <div
                    className="text-center font-mono text-xs"
                    style={{
                      color:
                        spirit > 0
                          ? '#7fc299'
                          : spirit < 0
                            ? '#e88080'
                            : 'rgba(var(--felt-ink-rgb),0.4)',
                    }}
                  >
                    {spirit !== 0 ? (spirit > 0 ? '+' : '') + spirit : '—'}
                  </div>
                  <div
                    className="text-center font-mono text-xs"
                    style={{
                      color:
                        bonus > 0
                          ? '#7fc299'
                          : bonus < 0
                            ? '#e88080'
                            : 'rgba(var(--felt-ink-rgb),0.4)',
                    }}
                  >
                    {bonus !== 0 ? (bonus > 0 ? '+' : '') + bonus : '—'}
                  </div>
                  <div
                    className="text-center font-mono text-xs"
                    style={{ color: best > 0 ? '#7fc299' : 'rgba(var(--felt-ink-rgb),0.4)' }}
                  >
                    {best > 0 ? '+' + best : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Action buttons ───────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 w-full max-w-[280px]">
          {onViewFinalHand && (
            <button
              onClick={onViewFinalHand}
              className="py-3 rounded-full text-sm font-bold text-mj-bone/80"
              style={{ border: '1px solid rgba(var(--felt-ink-rgb),0.2)' }}
            >
              {t('matchEndViewFinalHand')}
            </button>
          )}
          {gameId && (
            <button
              onClick={() => navigate(`/replay/${gameId}`)}
              className="py-3 rounded-full text-sm font-bold text-mj-bone/80"
              style={{ border: '1px solid rgba(var(--felt-ink-rgb),0.2)' }}
            >
              {t('historyViewReplay')}
            </button>
          )}
          <button
            onClick={onHome}
            className="py-4 rounded-full font-bold text-base text-mj-ink"
            style={{
              background: 'linear-gradient(180deg,#c9a961 0%,#a88a45 100%)',
              boxShadow: '0 6px 18px rgba(201,169,97,0.35)',
            }}
          >
            {t('matchEndReturnLobby')}
          </button>
        </div>
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
  const nameKey = seat.isBot ? BOT_NAME_KEYS[seat.seatName] : undefined;
  const displayName = nameKey ? t(nameKey) : seat.seatName;

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
      <span className="font-semibold text-mj-bone/90 flex-1 min-w-0 truncate">{displayName}</span>
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
          style={{ background: 'rgba(90,125,140,0.3)', color: '#8aaab8' }}
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

/**
 * Full-screen overlay shown to non-host players when the host saves and quits.
 * Auto-navigates home after 5 seconds; "Return Home" button skips the timer.
 */
function GameSavedOverlay({ payload, onHome }: { payload: GameSavedPayload; onHome: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    const id = setTimeout(onHome, 5000);
    return () => clearTimeout(id);
  }, [onHome]);

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 px-8 text-center"
      style={{ background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(12px)' }}
      role="alert"
      aria-live="assertive"
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(201,169,97,0.15)', border: '2px solid rgba(201,169,97,0.5)' }}
        aria-hidden
      >
        <span className="text-2xl">💾</span>
      </div>
      <div>
        <p className="text-lg font-bold text-mj-bone">{t('gameSavedByHost', payload.hostName)}</p>
        <p className="text-sm text-mj-bone/50 mt-2 max-w-[260px]">{t('gameSavedSubtext')}</p>
      </div>
      <button
        onClick={onHome}
        className="px-8 py-3.5 rounded-[14px] font-bold text-sm text-mj-ink"
        style={{
          background: 'linear-gradient(180deg,#c9a961 0%,#a88a45 100%)',
          boxShadow: '0 6px 18px rgba(201,169,97,0.35)',
        }}
      >
        {t('gameSavedGoHome')}
      </button>
    </div>
  );
}

/**
 * Full-screen overlay shown while a restored multi-player session waits for
 * all human players to reconnect. The host sees the restore code and a
 * "Start Game" button; other players see a waiting message.
 */
function RestoreWaitingOverlay({
  status,
  snapshot,
  isHost,
  onStart,
}: {
  status: RestoreStatusPayload;
  snapshot: ClientGameState;
  isHost: boolean;
  onStart: () => void;
}) {
  const { t } = useI18n();
  const allConnected = status.humanSeats.every((s) => status.connectedSeats.includes(s));

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-8 px-6 text-center"
      style={{ background: 'rgba(10,10,10,0.95)', backdropFilter: 'blur(12px)' }}
    >
      <div>
        <p className="text-[11px] font-bold tracking-widest text-mj-gold/70 uppercase mb-1">
          {t('restoreWaitingTitle')}
        </p>
        {status.restoreCode && (
          <>
            <p className="text-xs text-mj-bone/50 mb-2">{t('restoreWaitingShareCode')}</p>
            <p className="text-5xl font-mono font-bold text-mj-bone tracking-widest mb-1">
              {status.restoreCode}
            </p>
          </>
        )}
      </div>

      {/* Per-seat connection status */}
      <div className="flex flex-col gap-2 w-full max-w-[240px]">
        {status.humanSeats.map((seatIdx) => {
          const seat = snapshot.seats[seatIdx];
          const isConnected = status.connectedSeats.includes(seatIdx);
          return (
            <div
              key={seatIdx}
              className="flex items-center justify-between px-3 py-2 rounded-lg"
              style={{
                background: isConnected
                  ? 'rgba(127,194,153,0.1)'
                  : 'rgba(var(--felt-ink-rgb),0.06)',
                border: `1px solid ${isConnected ? 'rgba(127,194,153,0.3)' : 'rgba(var(--felt-ink-rgb),0.1)'}`,
              }}
            >
              <span className="text-sm text-mj-bone/80">{seat.seatName}</span>
              <span
                className="text-xs font-bold"
                style={{ color: isConnected ? '#7fc299' : 'rgba(var(--felt-ink-rgb),0.4)' }}
              >
                {isConnected ? t('restoreWaitingConnected') : t('restoreWaitingWaiting')}
              </span>
            </div>
          );
        })}
      </div>

      {isHost ? (
        <button
          onClick={onStart}
          disabled={!allConnected}
          className="px-8 py-3.5 rounded-[14px] font-bold text-sm text-mj-ink disabled:opacity-40"
          style={{
            background: 'linear-gradient(180deg,#c9a961 0%,#a88a45 100%)',
            boxShadow: allConnected ? '0 6px 18px rgba(201,169,97,0.35)' : 'none',
          }}
        >
          {t('restoreWaitingStart')} →
        </button>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-mj-gold/40 animate-pulse"
                style={{ animationDelay: `${i * 200}ms` }}
              />
            ))}
          </div>
          <p className="text-xs text-mj-bone/40">{t('restoreWaitingWaitingForHost')}</p>
        </div>
      )}
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

/** Save & Quit confirmation sheet (host only). */
function SaveAndQuitSheet({
  onConfirm,
  onCancel,
}: {
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
        aria-label={t('gameSaveAndQuitTitle')}
      >
        <h2 className="font-bold text-lg text-mj-bone">{t('gameSaveAndQuitTitle')}</h2>
        <p className="text-sm text-mj-bone/60">{t('gameSaveAndQuitDesc')}</p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl font-bold text-sm text-mj-bone/70"
            style={{ border: '1px solid rgba(var(--felt-ink-rgb),0.15)' }}
          >
            {t('gameSaveAndQuitCancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl font-bold text-sm"
            style={{ background: '#1f7a4d', color: '#f5efdf' }}
          >
            {t('gameSaveAndQuitConfirm')}
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
  // Content-based detection mirrors PlayerHand2D's prevHandKeyRef pattern.
  // prevToggleRef ensures a settings change mid-hand re-sorts immediately.
  const prevHandKeyRef = useRef<string>(hand.join(','));
  const prevToggleRef = useRef<boolean>(autoSortDrawnTile);

  // Sync displayOrder on hand changes or auto-sort toggle changes.
  useEffect(() => {
    const key = hand.join(',');
    const handUnchanged = key === prevHandKeyRef.current;
    const toggleUnchanged = prevToggleRef.current === autoSortDrawnTile;

    if (handUnchanged && toggleUnchanged) return;

    const prevLen = prevLenRef.current;
    prevHandKeyRef.current = key;
    prevToggleRef.current = autoSortDrawnTile;
    prevLenRef.current = hand.length;

    if (hand.length < prevLen) {
      // Tile discarded — reset to natural order.
      setDisplayOrder(hand.map((_, i) => i));
      return;
    }

    if (hand.length > prevLen) {
      // Tile drawn — server always appends at the end of the hand array.
      const newHandIdx = hand.length - 1;
      if (autoSortDrawnTile) {
        setDisplayOrder((order) => {
          const extended = [...order, newHandIdx];
          return extended.sort((a, b) => {
            const ta = hand[a];
            const tb = hand[b];
            const sorted = sortTypes([ta, tb]);
            return sorted[0] === sorted[1] ? 0 : sorted[0] === ta ? -1 : 1;
          });
        });
      } else {
        setDisplayOrder((order) => [...order, newHandIdx]);
      }
      return;
    }

    // Same hand length: toggle changed mid-hand. Apply the new setting immediately.
    if (autoSortDrawnTile) {
      setDisplayOrder((order) =>
        [...order].sort((a, b) => {
          const ta = hand[a];
          const tb = hand[b];
          const sorted = sortTypes([ta, tb]);
          return sorted[0] === sorted[1] ? 0 : sorted[0] === ta ? -1 : 1;
        }),
      );
    }
    // Disabling: keep the current user-arranged order unchanged.
  }, [hand, autoSortDrawnTile]);

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
                        <MahjongTile2D
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
          borderRadius: '8px 0 0 8px',
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
                      <MahjongTile2D
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

const GAME_MENU_ICON = '···' as const;

// ── Game menu (replaces individual History / Save & Quit / Concede buttons) ──

function GameMenu({
  isHost,
  canSaveAndQuit,
  historyOpen,
  onToggleHistory,
  onOpenSave,
  onOpenConcede,
}: {
  isHost: boolean;
  canSaveAndQuit: boolean;
  historyOpen: boolean;
  onToggleHistory: () => void;
  onOpenSave: () => void;
  onOpenConcede: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  const handleHistory = () => {
    close();
    onToggleHistory();
  };
  const handleSave = () => {
    close();
    onOpenSave();
  };
  const handleConcede = () => {
    close();
    onOpenConcede();
  };

  return (
    <div className="relative" style={{ zIndex: 31 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t('gameMenuLabel')}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center justify-center font-bold"
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          border: open
            ? '1px solid rgba(201,169,97,0.4)'
            : '1px solid rgba(var(--felt-ink-rgb),0.15)',
          color: open ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.5)',
          fontSize: 16,
          background: open ? 'rgba(201,169,97,0.08)' : 'transparent',
          letterSpacing: 0,
          lineHeight: 1,
        }}
      >
        {GAME_MENU_ICON}
      </button>

      {open && (
        <>
          {/* Invisible backdrop — clicking outside closes the menu */}
          <div
            className="fixed inset-0"
            style={{ zIndex: -1 }}
            onClick={close}
            aria-hidden="true"
          />

          {/* Menu panel */}
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 rounded-xl overflow-hidden flex flex-col"
            style={{
              minWidth: 148,
              background: '#1a1a1a',
              border: '1px solid rgba(var(--felt-ink-rgb),0.14)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            {/* History */}
            <button
              role="menuitem"
              onClick={handleHistory}
              className="flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-left w-full"
              style={{
                color: historyOpen ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.75)',
                background: historyOpen ? 'rgba(201,169,97,0.07)' : 'transparent',
              }}
            >
              {t('gameHistoryTitle')}
            </button>

            {/* Save & Quit — host only */}
            {isHost && canSaveAndQuit && (
              <>
                <div style={{ height: 1, background: 'rgba(var(--felt-ink-rgb),0.08)' }} />
                <button
                  role="menuitem"
                  onClick={handleSave}
                  className="flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-left w-full"
                  style={{ color: '#c9a961' }}
                >
                  {t('gameSaveAndQuit')}
                </button>
              </>
            )}

            {/* Concede */}
            <div style={{ height: 1, background: 'rgba(var(--felt-ink-rgb),0.08)' }} />
            <button
              role="menuitem"
              onClick={handleConcede}
              className="flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-left w-full"
              style={{ color: 'rgba(192,57,43,0.9)' }}
            >
              {t('gameConcede')}
            </button>
          </div>
        </>
      )}
    </div>
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
  canAddToKong,
  canConcealedKong,
  toast,
  pendingMove,
  onSelect,
  onDiscard,
  onKongConcealed,
  onKongAdd,
  onClaim,
  onPass,
  onConcede,
  onSaveAndQuit,
  onDeclareTsumo,
  restoreEvents,
}: {
  snapshot: ClientGameState;
  selectedTileIdx: number | null;
  claimWindow: ClaimWindowState | null;
  canTsumo: boolean;
  canAddToKong: TileType | null;
  canConcealedKong: TileType[] | null;
  toast: GameToast | null;
  pendingMove: boolean;
  onSelect: (idx: number | null) => void;
  onDiscard: (tile: TileType) => void;
  onKongConcealed: (tile: TileType) => void;
  onKongAdd: (tile: TileType) => void;
  onClaim: (kind: 'win' | 'pung' | 'kong' | 'chow', seq?: [TileType, TileType, TileType]) => void;
  onPass: () => void;
  onConcede: () => void;
  onSaveAndQuit?: () => void;
  onDeclareTsumo: () => void;
  restoreEvents?: RestoreHistoryPayload['events'] | null;
}) {
  const { t } = useI18n();
  const yourTurnFlash = useGameStore((s) => s.yourTurnFlash);
  const [showConcedeSheet, setShowConcedeSheet] = useState(false);
  const [showSaveSheet, setShowSaveSheet] = useState(false);
  const [jingDiscardPending, setJingDiscardPending] = useState<TileType | null>(null);
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

  // Kong buttons are proactive overlays — discarding always just discards.
  const handleDiscardOrKong = useCallback(
    (tile: TileType) => handleDiscardWithConfirm(tile),
    [handleDiscardWithConfirm],
  );

  // ── History tracking ────────────────────────────────────────────────────────

  const addHistory = useCallback((entry: Omit<HistoryEntry, 'id'>) => {
    setHistoryEntries((prev) => [...prev, { ...entry, id: nextHistoryId.current++ }]);
  }, []);

  // Bootstrap history entries when joining a restored session.
  // The server sends game:restore-history once with the current hand's public
  // events so the panel isn't empty after a save/load.
  useEffect(() => {
    if (!restoreEvents || restoreEvents.length === 0) return;
    const bootstrapped: HistoryEntry[] = [];
    for (const e of restoreEvents) {
      const seatIdx = e.seat;
      const seatWind = snapshot.seats[seatIdx]?.wind;
      if (!seatWind) continue;

      if (e.kind === 'discard') {
        bootstrapped.push({
          id: nextHistoryId.current++,
          kind: 'discard',
          seatWind,
          seatIdx,
          tile: e.tile,
        });
      } else if (e.kind === 'concede') {
        bootstrapped.push({ id: nextHistoryId.current++, kind: 'concede', seatWind, seatIdx });
      } else if (e.kind === 'pung') {
        bootstrapped.push({
          id: nextHistoryId.current++,
          kind: 'pung',
          seatWind,
          seatIdx,
          tile: e.tile,
        });
      } else if (e.kind === 'chow') {
        bootstrapped.push({
          id: nextHistoryId.current++,
          kind: 'chow',
          seatWind,
          seatIdx,
          tile: e.tile,
        });
      } else if (e.kind === 'kong_open' || e.kind === 'kong_added') {
        bootstrapped.push({
          id: nextHistoryId.current++,
          kind: 'kong',
          seatWind,
          seatIdx,
          tile: e.tile,
        });
      } else if (e.kind === 'kong_concealed') {
        bootstrapped.push({ id: nextHistoryId.current++, kind: 'kong', seatWind, seatIdx });
      } else if (e.kind === 'win') {
        bootstrapped.push({ id: nextHistoryId.current++, kind: 'win', seatWind, seatIdx });
      }
    }
    if (bootstrapped.length > 0) {
      setHistoryEntries(bootstrapped);
    }
  }, [restoreEvents]); // snapshot.seats winds are stable within a hand; only run when restore events arrive

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

  const handleSaveAndQuit = () => {
    setShowSaveSheet(false);
    onSaveAndQuit?.();
  };

  const isHost = viewerSeat === 0;

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
                tsumoSuppressed={tsumoSuppressed}
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

            {/* Unified game menu — History, Save & Quit (host only), Concede */}
            <GameMenu
              isHost={isHost}
              canSaveAndQuit={!!onSaveAndQuit}
              historyOpen={historyOpen}
              onToggleHistory={() => setHistoryOpen((o) => !o)}
              onOpenSave={() => setShowSaveSheet(true)}
              onOpenConcede={() => setShowConcedeSheet(true)}
            />
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
        {!showConcedeSheet && !showSaveSheet && snapshot.viewMode !== '2D' && !isMobile && (
          <ViewerHandHUD
            hand={viewerHand}
            selectedTileIdx={selectedTileIdx}
            onSelect={onSelect}
            onDiscard={handleDiscardOrKong}
            isMyTurn={isMyTurn && (!canTsumo || tsumoSuppressed)}
            jingTypes={jingTypes}
            pendingMove={pendingMove}
            onDisplayOrderChange={setHudDisplayOrder}
          />
        )}

        {/* ── Kong action buttons (top-right, non-blocking) ─────────────────── */}
        {/* Both "Declare Hidden Kong" and "Promote Pung to Kong" live here as    */}
        {/* proactive buttons visible at any point on the player's turn. They     */}
        {/* stack vertically and never cover the hand or open melds.              */}
        {isMyTurn && !showConcedeSheet && !jingDiscardPending && (
          <div className="absolute top-[calc(var(--mj-safe-top,0px)+40px)] right-2 z-20 flex flex-col items-end gap-2">
            {canConcealedKong &&
              canConcealedKong.map((tile) => (
                <button
                  key={tile}
                  onClick={() => onKongConcealed(tile)}
                  className="font-bold text-sm px-4 py-2 rounded-xl animate-call-prompt-enter bg-mj-gold/22 border border-mj-gold/65 text-mj-gold backdrop-blur drop-shadow-mj-gold"
                >
                  {canConcealedKong.length > 1 ? (
                    <span className="flex items-center gap-2">
                      <MahjongTile2D tile={tile} size="xxs" interactive={false} />
                      {t('declareHiddenKong')}
                    </span>
                  ) : (
                    t('declareHiddenKong')
                  )}
                </button>
              ))}
            {canAddToKong && (
              <button
                onClick={() => onKongAdd(canAddToKong)}
                className="font-bold text-sm px-4 py-2 rounded-xl animate-call-prompt-enter bg-mj-gold/22 border border-mj-gold/65 text-mj-gold backdrop-blur drop-shadow-mj-gold"
              >
                {t('addToKong')}
              </button>
            )}
          </div>
        )}

        {/* ── Persistent "Declare Win" button (IMP-020) ──────────────────────── */}
        {/* Shown after the player dismisses the TsumoBar. Floats above the hand  */}
        {/* HUD and lets them re-open the win prompt at any time before discarding.*/}
        {canTsumo && tsumoSuppressed && isMyTurn && !showConcedeSheet && (
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
          isMyTurn={isMyTurn && !pendingMove && (!canTsumo || tsumoSuppressed)}
          displayOrder={hudDisplayOrder}
        />

        {/* ── Collapsible history panel ──────────────────────────────────────── */}
        {!showConcedeSheet && !showSaveSheet && !jingDiscardPending && (
          <GameHistoryPanel
            entries={historyEntries}
            isOpen={historyOpen}
            onToggle={() => setHistoryOpen((o) => !o)}
            snapshot={snapshot}
            isMobile={isMobile}
          />
        )}

        {/* ── Action toast ───────────────────────────────────────────────────── */}
        {toast && !showConcedeSheet && !showSaveSheet && !jingDiscardPending && (
          <ActionToast toast={toast} snapshot={snapshot} />
        )}

        {/* ── Your Turn flash banner ─────────────────────────────────────────── */}
        {yourTurnFlash &&
          !claimWindow &&
          !showConcedeSheet &&
          !showSaveSheet &&
          !jingDiscardPending && <YourTurnBanner />}

        {/* ── Waiting indicator — non-eligible viewer while claim window is open */}
        {snapshot.phase === 'awaiting_claims' &&
          !claimWindow &&
          !showConcedeSheet &&
          !showSaveSheet &&
          !jingDiscardPending && <WaitingForClaimIndicator isMobile={isMobile} />}

        {/* ── Claim window rail ──────────────────────────────────────────────── */}
        {claimWindow && !showConcedeSheet && !showSaveSheet && !jingDiscardPending && (
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

        {/* ── Save & Quit sheet (host only) ─────────────────────────────────── */}
        {showSaveSheet && !jingDiscardPending && (
          <SaveAndQuitSheet
            onConfirm={handleSaveAndQuit}
            onCancel={() => setShowSaveSheet(false)}
          />
        )}

        {/* ── Jing discard confirmation sheet ────────────────────────────────── */}
        {jingDiscardPending && (
          <JingDiscardConfirmSheet
            tile={jingDiscardPending}
            onConfirm={handleJingDiscardConfirm}
            onCancel={handleJingDiscardCancel}
          />
        )}

        {/* ── Tsumo bar (IMP-020) ─────────────────────────────────────────────── */}
        {/* Non-blocking compact bar — does NOT cover the hand/canvas.            */}
        {/* Dismissed → shows persistent "Declare Win" button instead (above).    */}
        {canTsumo && isMyTurn && !tsumoSuppressed && !showConcedeSheet && !jingDiscardPending && (
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

  const accessToken = useAuthStore((s) => s.accessToken);
  // Ensure the socket is connected before useGame's effect fires.
  // GamePage can be entered directly from the challenge flow (POST /challenges
  // → navigate to /game/:id), bypassing the lobby/room pages that normally
  // call connectSocket(). This effect runs first (React runs effects in
  // declaration order) so getSocket() inside useGame never throws.
  useEffect(() => {
    if (accessToken) connectSocket(accessToken);
  }, [accessToken]);

  const {
    snapshot,
    ended,
    settlementPreview,
    handReveal,
    finalHandReveal,
    connection,
    selectedTileIdx,
    claimWindow,
    toast,
    pendingMove,
    gameError,
    selectTile,
    canTsumo,
    canAddToKong,
    canConcealedKong,
    discard,
    declareTsumo,
    kongConcealed,
    kongAdd,
    claim,
    pass,
    concede,
    saveAndQuit,
    advancePreGame,
    advanceHand,
    setFinalHand,
    rollDice,
    onDiceAnimationComplete,
    diceAnimation,
    restoreEvents,
    gameSaved,
    restoreStatus,
    startRestore,
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

  // Play point-transfer sound when the settlement SCREEN becomes active.
  // The opening_jing_settlement event arrives while the jing-reveal dice
  // animation is still playing; deferring to the phase transition ensures
  // the dice sound finishes before the coin sound starts.
  useEffect(() => {
    if (snapshot?.preGamePhase === 'settlement' && !diceAnimation) playPointTransfer();
  }, [snapshot?.preGamePhase, diceAnimation, playPointTransfer]);

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

  // On the last hand, the host must explicitly click "View Match Results" —
  // this is intentional to give all players a chance to see the final hand
  // reveal before transitioning to the match end statistics screen.

  // True while the player is reviewing the final hand's details from the
  // results screen — the last screen of the end-of-game sequence.
  const [showEndDetails, setShowEndDetails] = useState(false);

  const handleHome = useCallback(() => navigate('/lobby'), [navigate]);

  // ── Active-game localStorage tracking ──────────────────────────────────────
  // Store the gameId so LobbyPage can show a "Rejoin" card if the player
  // navigates away mid-game. Clear it once the session ends normally.

  useEffect(() => {
    if (gameId) localStorage.setItem(ACTIVE_GAME_KEY, gameId);
  }, [gameId]);

  useEffect(() => {
    if (snapshot?.phase === 'finished') localStorage.removeItem(ACTIVE_GAME_KEY);
  }, [snapshot?.phase]);

  // Also clear on any terminal/error state so a destroyed backend session
  // doesn't leave a stale rejoin card in the lobby indefinitely.
  useEffect(() => {
    if (gameError || timedOut || ended) localStorage.removeItem(ACTIVE_GAME_KEY);
  }, [gameError, timedOut, ended]);

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
  const isHuman = viewerSeat !== null && !snapshot.seats[viewerSeat]?.isBot;
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
          isHuman={isHuman}
          isActualHost={canAdvanceHand}
          onAdvance={advanceHand}
          onSetFinalHand={setFinalHand}
        />
      )}

      {/* ── Pre-game reveal flow ──────────────────────────────────────────── */}
      {/* Shown whenever preGamePhase is not null (and not 'dealing' — that     */}
      {/* phase only shows a loading state since DiceRollOverlay covers it).    */}
      {!handReveal && !announcingReveal && snapshot.preGamePhase !== null && (
        <PreGameFlow
          snapshot={snapshot}
          settlementPreview={settlementPreview}
          isHuman={isHuman}
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
            canAddToKong={canAddToKong}
            canConcealedKong={canConcealedKong}
            toast={toast}
            pendingMove={pendingMove}
            onSelect={selectTile}
            onDiscard={discardWithSound}
            onKongConcealed={kongConcealed}
            onKongAdd={kongAdd}
            onClaim={claim}
            onPass={pass}
            onConcede={concede}
            onSaveAndQuit={viewerSeat === 0 ? saveAndQuit : undefined}
            onDeclareTsumo={declareTsumo}
            restoreEvents={restoreEvents}
          />
        )}

      {/* ── Session end — match stats, then final hand review (optional) ─── */}
      {!handReveal &&
        !announcingReveal &&
        snapshot.preGamePhase === null &&
        snapshot.phase === 'finished' &&
        (showEndDetails && finalHandReveal ? (
          <HandRevealScreen
            handReveal={finalHandReveal}
            snapshot={snapshot}
            isHuman={false}
            isActualHost={false}
            mode="review"
            onBack={() => setShowEndDetails(false)}
          />
        ) : (
          <MatchEndStatsScreen
            snapshot={snapshot}
            ended={ended}
            viewerSeat={viewerSeat}
            gameId={gameId}
            onHome={handleHome}
            onViewFinalHand={finalHandReveal ? () => setShowEndDetails(true) : undefined}
          />
        ))}

      {/* ── Loading / dealing ─────────────────────────────────────────────── */}
      {!handReveal &&
        snapshot.preGamePhase === null &&
        snapshot.phase !== 'playing' &&
        snapshot.phase !== 'awaiting_claims' &&
        snapshot.phase !== 'finished' && <LoadingScreen />}

      {connection === 'reconnecting' && <ReconnectingOverlay />}

      {/* ── Non-host: host saved the game overlay ─────────────────────────── */}
      {gameSaved && <GameSavedOverlay payload={gameSaved} onHome={() => navigate('/')} />}

      {/* ── Restore-waiting lobby: waiting for all human players ──────────── */}
      {restoreStatus && snapshot && (
        <RestoreWaitingOverlay
          status={restoreStatus}
          snapshot={snapshot}
          isHost={viewerSeat === 0}
          onStart={startRestore}
        />
      )}
    </>
  );
}
