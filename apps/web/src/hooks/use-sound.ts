/**
 * use-sound.ts — Web Audio API sound effects hook.
 *
 * Sound is opt-in (soundEnabled defaults false). All sounds are synthesised
 * via the Web Audio API — no audio files are bundled.
 *
 * Usage:
 *   const { playClack, playChime } = useSound();
 *   // call inside a user-gesture handler (e.g. discard button click)
 */

import { useCallback } from 'react';
import { useThemeStore } from '../stores/theme.store';

/**
 * Create a very short audio context, play it, then close — avoids leaking
 * AudioContext instances since browsers allow a limited number.
 */
function once(fn: (ctx: AudioContext) => void): void {
  try {
    const ctx = new AudioContext();
    fn(ctx);
    // Auto-close after 500 ms (well past any sound duration)
    setTimeout(() => void ctx.close(), 500);
  } catch {
    // AudioContext not available (e.g. jsdom in tests) — silently skip
  }
}

/** Short noise burst — used for tile-clack on discard. */
function synthesiseClack(ctx: AudioContext): void {
  const dur = 0.04; // 40 ms
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    // Decaying white noise
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 1.5;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  // Band-pass filter to give it a woody click
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1400;
  bp.Q.value = 1.5;
  const gain = ctx.createGain();
  gain.gain.value = 0.35;
  src.connect(bp);
  bp.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}

/** Ascending two-note chime — used for win. */
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

export function useSound() {
  const soundEnabled = useThemeStore((s) => s.soundEnabled);

  const playClack = useCallback(() => {
    if (!soundEnabled) return;
    once(synthesiseClack);
  }, [soundEnabled]);

  const playChime = useCallback(() => {
    if (!soundEnabled) return;
    once(synthesiseChime);
  }, [soundEnabled]);

  return { playClack, playChime };
}
