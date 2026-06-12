/**
 * DiceRollOverlay — full-screen overlay shown during the three manual dice-roll
 * pauses (deal_1, deal_2, jing_reveal). Renders in two states:
 *
 * 1. **Interactive / waiting** — pendingRoll is set but no animation is playing.
 *    The designated roller sees a "Roll Dice" button; everyone else sees a
 *    "Waiting for X to roll…" message.
 *
 * 2. **Animating** — after the server emits a dice_roll event. Framer Motion
 *    spins two dice and settles on the actual result. After the animation
 *    completes, `onAnimationComplete` is called so the parent can flush the
 *    queued ClientGameState snapshot.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '../../i18n';
import type { ClientGameState } from '@nanchang/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiceAnimationState {
  dice: [number, number];
  purpose: 'wall_selection' | 'deal_start' | 'jing_reveal';
  roller: 0 | 1 | 2 | 3;
}

interface Props {
  snapshot: ClientGameState;
  diceAnimation: DiceAnimationState | null;
  onRoll: () => void;
  onAnimationComplete: () => void;
}

// ── Die face dot layout ────────────────────────────────────────────────────────

// Each element is an array of [top%, left%] positions for the dots on that face.
const DOT_POSITIONS: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [
    [25, 50],
    [75, 50],
  ],
  3: [
    [20, 50],
    [50, 50],
    [80, 50],
  ],
  4: [
    [25, 25],
    [25, 75],
    [75, 25],
    [75, 75],
  ],
  5: [
    [25, 25],
    [25, 75],
    [50, 50],
    [75, 25],
    [75, 75],
  ],
  6: [
    [25, 25],
    [25, 75],
    [50, 25],
    [50, 75],
    [75, 25],
    [75, 75],
  ],
};

// ── Die component ─────────────────────────────────────────────────────────────

function DieFace({ value, isAnimating }: { value: number; isAnimating: boolean }) {
  const dots = DOT_POSITIONS[value] ?? DOT_POSITIONS[1];

  return (
    <motion.div
      className="relative w-16 h-16 rounded-xl bg-white shadow-lg border-2 border-mj-gold/30 flex-shrink-0"
      initial={isAnimating ? { rotateX: 0, rotateY: 0, scale: 1.2 } : false}
      animate={
        isAnimating
          ? {
              rotateX: [0, 360, 720, 720],
              rotateY: [0, 180, 360, 360],
              scale: [1.2, 1.1, 1.15, 1],
            }
          : { scale: 1 }
      }
      transition={
        isAnimating
          ? {
              duration: 1.2,
              ease: 'easeOut',
              times: [0, 0.4, 0.8, 1],
            }
          : { duration: 0.2 }
      }
      style={{ perspective: 400 }}
    >
      {dots.map(([top, left], i) => (
        <div
          key={i}
          className="absolute w-3 h-3 rounded-full bg-[#1a1a2e]"
          style={{
            top: `${top}%`,
            left: `${left}%`,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
    </motion.div>
  );
}

// ── WaitingDots ────────────────────────────────────────────────────────────────

function WaitingDots() {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-mj-bone/40"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}

// ── GoldButton ─────────────────────────────────────────────────────────────────

function GoldButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      className="px-8 py-4 rounded-xl bg-mj-gold text-mj-bg-page font-bold text-lg tracking-wide shadow-md active:shadow-sm"
    >
      {children}
    </motion.button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DiceRollOverlay({ snapshot, diceAnimation, onRoll, onAnimationComplete }: Props) {
  const { t } = useI18n();

  const pendingRoll = snapshot.pendingRoll;
  const viewerSeat = snapshot.viewerSeat;

  // Determine the seat name of the roller
  const rollerSeat = diceAnimation?.roller ?? pendingRoll?.roller ?? null;
  const rollerName =
    rollerSeat !== null ? (snapshot.seats[rollerSeat]?.seatName ?? String(rollerSeat)) : '';

  const isMyRoll =
    viewerSeat !== null &&
    ((diceAnimation ? diceAnimation.roller === viewerSeat : false) ||
      (pendingRoll ? pendingRoll.roller === viewerSeat : false));

  const currentPurpose = diceAnimation?.purpose ?? pendingRoll?.purpose ?? 'deal_1';

  // Derive subtitle label
  const subtitleKey =
    currentPurpose === 'wall_selection' || currentPurpose === 'deal_1'
      ? 'diceRollDeal1'
      : currentPurpose === 'deal_start' || currentPurpose === 'deal_2'
        ? 'diceRollDeal2'
        : 'diceRollJing';

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-mj-bg-page/95 backdrop-blur-sm"
      aria-live="polite"
      aria-label={t('diceRollTitle')}
    >
      <div className="flex flex-col items-center gap-6 px-8 text-center">
        {/* Title */}
        <div>
          <p className="text-[11px] font-bold tracking-widest text-mj-gold/70 uppercase mb-1">
            {t('diceRollTitle')}
          </p>
          <h2 className="text-xl font-serif font-bold text-mj-bone">{t(subtitleKey)}</h2>
        </div>

        {/* Dice area */}
        <div className="flex gap-6 items-center justify-center min-h-[80px]">
          <AnimatePresence mode="wait">
            {diceAnimation ? (
              <motion.div
                key="dice-result"
                className="flex gap-6 items-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <DieFace value={diceAnimation.dice[0]} isAnimating />
                <DieFace value={diceAnimation.dice[1]} isAnimating />
              </motion.div>
            ) : (
              <motion.div
                key="dice-placeholder"
                className="flex gap-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.25 }}
                exit={{ opacity: 0 }}
              >
                <DieFace value={1} isAnimating={false} />
                <DieFace value={1} isAnimating={false} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sum result — shown during/after animation */}
        <AnimatePresence>
          {diceAnimation && (
            <motion.p
              key="result"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.0, duration: 0.25 }}
              exit={{ opacity: 0 }}
              className="text-mj-gold font-bold text-lg"
              onAnimationComplete={onAnimationComplete}
            >
              {t('diceRollResult')
                .replace('{{0}}', String(diceAnimation.dice[0]))
                .replace('{{1}}', String(diceAnimation.dice[1]))
                .replace('{{2}}', String(diceAnimation.dice[0] + diceAnimation.dice[1]))}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Button / waiting state — only when not animating */}
        {!diceAnimation && pendingRoll && (
          <div className="flex flex-col items-center gap-3 mt-2">
            {isMyRoll ? (
              <GoldButton onClick={onRoll}>{t('diceRollButton')} 🎲</GoldButton>
            ) : (
              <>
                <WaitingDots />
                <p className="text-sm text-mj-bone/50">
                  {t('diceRollWaiting').replace('{{0}}', rollerName)}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
