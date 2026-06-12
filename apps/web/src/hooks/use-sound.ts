/**
 * use-sound.ts — Sound effects hook.
 *
 * Provides MP3-based sound effects for gameplay events (tile place, dice roll,
 * point transfer, shuffle/round start) plus a synthesised chime for wins.
 * Sound is opt-in (soundEnabled defaults false in ThemeStore).
 *
 * Usage:
 *   const { playTilePlace, playDiceRoll, playPointTransfer, playShuffle, playChime } = useSound();
 */

import { useCallback } from 'react';
import { useThemeStore } from '../stores/theme.store';

// ── Static sound pools ────────────────────────────────────────────────────────

const TILE_PLACE_SOUNDS = [
  '/sounds/tilePlace/mahjong_tile_1.mp3',
  '/sounds/tilePlace/mahjong_tile_2.mp3',
  '/sounds/tilePlace/mahjong_tile_3.mp3',
  '/sounds/tilePlace/mahjong_tile_4.mp3',
  '/sounds/tilePlace/mahjong_tile_5.mp3',
  '/sounds/tilePlace/mahjong_tile_6.mp3',
];

const DICE_ROLL_SOUNDS = [
  '/sounds/diceRoll/roll_two_dice_1.mp3',
  '/sounds/diceRoll/roll_two_dice_2.mp3',
  '/sounds/diceRoll/roll_two_dice_3.mp3',
];

const POINT_TRANSFER_SOUNDS = [
  '/sounds/pointTransfer/take_the_bets_1.mp3',
  '/sounds/pointTransfer/take_the_bets_2.mp3',
  '/sounds/pointTransfer/take_the_bets_3.mp3',
  '/sounds/pointTransfer/take_the_bets_4.mp3',
];

const SHUFFLE_SOUNDS = ['/sounds/shuffle/shuffle_the_mahjong_tiles.mp3'];

const CALLOUT_CHOW_SOUNDS = ['/sounds/callOuts/chow/chow.mp3'];

const CALLOUT_PUNG_SOUNDS = ['/sounds/callOuts/pung/pung.mp3'];

const CALLOUT_KONG_SOUNDS = ['/sounds/callOuts/kong/kong.mp3'];

// ── Audio cache ───────────────────────────────────────────────────────────────
// Pre-decoded HTMLAudioElement per URL. Populated once at module load so the
// browser fetches and decodes every file in the background before the first
// game event fires — eliminating the decode-on-demand stutter on mobile.

const audioCache = new Map<string, HTMLAudioElement>();

function preloadAudio(pools: string[][]): void {
  try {
    for (const pool of pools) {
      for (const url of pool) {
        if (!audioCache.has(url)) {
          audioCache.set(url, new Audio(url));
        }
      }
    }
  } catch {
    // Audio API unavailable (e.g. jsdom in tests) — silently skip
  }
}

preloadAudio([
  TILE_PLACE_SOUNDS,
  DICE_ROLL_SOUNDS,
  POINT_TRANSFER_SOUNDS,
  SHUFFLE_SOUNDS,
  CALLOUT_CHOW_SOUNDS,
  CALLOUT_PUNG_SOUNDS,
  CALLOUT_KONG_SOUNDS,
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function pickRandom(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

function playAudio(url: string): void {
  try {
    const cached = audioCache.get(url);
    // cloneNode lets a second instance start while the original is still playing
    // (e.g. rapid tile placements), without interrupting the in-flight audio.
    const audio = cached ? (cached.cloneNode(true) as HTMLAudioElement) : new Audio(url);
    audio.play().catch(() => {
      // Ignore autoplay policy errors — sound is best-effort
    });
  } catch {
    // Audio API unavailable (e.g. jsdom in tests) — silently skip
  }
}

/**
 * Create a short AudioContext, run fn, then close — avoids leaking
 * AudioContext instances since browsers cap the total allowed.
 */
function once(fn: (ctx: AudioContext) => void): void {
  try {
    const ctx = new AudioContext();
    fn(ctx);
    setTimeout(() => void ctx.close(), 500);
  } catch {
    // AudioContext not available — silently skip
  }
}

/** Ascending two-note chime — used for win announcement. */
function synthesiseChime(ctx: AudioContext): void {
  const notes = [523.25, 783.99]; // C5, G5
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    const start = ctx.currentTime + i * 0.15;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.4);
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSound() {
  const soundEnabled = useThemeStore((s) => s.soundEnabled);

  const playTilePlace = useCallback(() => {
    if (!soundEnabled) return;
    playAudio(pickRandom(TILE_PLACE_SOUNDS));
  }, [soundEnabled]);

  const playDiceRoll = useCallback(() => {
    if (!soundEnabled) return;
    playAudio(pickRandom(DICE_ROLL_SOUNDS));
  }, [soundEnabled]);

  const playPointTransfer = useCallback(() => {
    if (!soundEnabled) return;
    playAudio(pickRandom(POINT_TRANSFER_SOUNDS));
  }, [soundEnabled]);

  const playShuffle = useCallback(() => {
    if (!soundEnabled) return;
    playAudio(pickRandom(SHUFFLE_SOUNDS));
  }, [soundEnabled]);

  const playCallOutChow = useCallback(() => {
    if (!soundEnabled) return;
    playAudio(pickRandom(CALLOUT_CHOW_SOUNDS));
  }, [soundEnabled]);

  const playCallOutPung = useCallback(() => {
    if (!soundEnabled) return;
    playAudio(pickRandom(CALLOUT_PUNG_SOUNDS));
  }, [soundEnabled]);

  const playCallOutKong = useCallback(() => {
    if (!soundEnabled) return;
    playAudio(pickRandom(CALLOUT_KONG_SOUNDS));
  }, [soundEnabled]);

  const playChime = useCallback(() => {
    if (!soundEnabled) return;
    once(synthesiseChime);
  }, [soundEnabled]);

  return {
    playTilePlace,
    playDiceRoll,
    playPointTransfer,
    playShuffle,
    playCallOutChow,
    playCallOutPung,
    playCallOutKong,
    playChime,
  };
}
