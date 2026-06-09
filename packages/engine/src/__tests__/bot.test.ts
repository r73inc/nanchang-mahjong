import { describe, it, expect, vi, afterEach } from 'vitest';
import { getBotDiscard, getBotClaim } from '../bot/bot-engine';
import type { BotClaimOption } from '../bot/bot-engine';
import type { TileType } from '../types';

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Shared claim-option fixtures ──────────────────────────────────────────────

const WIN: BotClaimOption = { kind: 'win' };
const PUNG: BotClaimOption = { kind: 'pung' };
const KONG: BotClaimOption = { kind: 'kong' };
const CHOW: BotClaimOption = {
  kind: 'chow',
  sequences: [['3m', '4m', '5m'] as [TileType, TileType, TileType]],
};

// ── getBotDiscard ─────────────────────────────────────────────────────────────

describe('getBotDiscard', () => {
  describe('easy', () => {
    it('returns a tile that is in the hand', () => {
      const hand: TileType[] = ['1m', '2m', '3p', '5s', 'east'];
      const wildcards: TileType[] = [];
      const discard = getBotDiscard(hand, wildcards, 'easy');
      expect(hand).toContain(discard);
    });

    it('never returns a wildcard when naturals exist', () => {
      // '3p' is the wildcard; hand contains two natural tiles
      const hand: TileType[] = ['1m', '3p', '5s'];
      const wildcards: TileType[] = ['3p'];
      for (let i = 0; i < 30; i++) {
        expect(getBotDiscard(hand, wildcards, 'easy')).not.toBe('3p');
      }
    });

    it('falls back to the first tile when hand is all wildcards', () => {
      const hand: TileType[] = ['2p', '2p', '2p'];
      const wildcards: TileType[] = ['2p'];
      // naturals is empty → must return hand[0]
      expect(getBotDiscard(hand, wildcards, 'easy')).toBe('2p');
    });
  });

  describe('normal', () => {
    it('never returns a wildcard when naturals exist', () => {
      const hand: TileType[] = ['1m', '3p', '5s'];
      const wildcards: TileType[] = ['3p'];
      for (let i = 0; i < 30; i++) {
        expect(getBotDiscard(hand, wildcards, 'normal')).not.toBe('3p');
      }
    });

    it('discards an isolated honor before an isolated simple', () => {
      // east (score 0) vs 5m (score 2) — result is deterministic
      const hand: TileType[] = ['east', '5m'];
      const wildcards: TileType[] = [];
      expect(getBotDiscard(hand, wildcards, 'normal')).toBe('east');
    });

    it('discards an isolated terminal before an isolated simple', () => {
      // 1m (score 1) vs 5p (score 2) — result is deterministic
      const hand: TileType[] = ['1m', '5p'];
      const wildcards: TileType[] = [];
      expect(getBotDiscard(hand, wildcards, 'normal')).toBe('1m');
    });

    it('keeps a pair and discards an isolated simple instead', () => {
      // 3m×2 = pair (score 4), east = isolated honor (score 0) → discard east
      const hand: TileType[] = ['3m', '3m', 'east'];
      const wildcards: TileType[] = [];
      expect(getBotDiscard(hand, wildcards, 'normal')).toBe('east');
    });

    it('falls back to the first tile when hand is all wildcards', () => {
      const hand: TileType[] = ['2p', '2p', '2p'];
      const wildcards: TileType[] = ['2p'];
      expect(getBotDiscard(hand, wildcards, 'normal')).toBe('2p');
    });
  });
});

// ── getBotClaim ───────────────────────────────────────────────────────────────

describe('getBotClaim', () => {
  describe('easy', () => {
    it('always claims win regardless of Math.random', () => {
      // Even with a high random value that would block non-win claims,
      // win is claimed before the random check.
      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      expect(getBotClaim([WIN, PUNG], '1m', 0, 'easy')).toEqual({ kind: 'win' });
    });

    it('returns null when no options are available', () => {
      expect(getBotClaim([], '1m', 0, 'easy')).toBeNull();
    });

    it('returns null when random >= 0.3', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      expect(getBotClaim([PUNG], '2m', 0, 'easy')).toBeNull();
    });

    it('claims pung when random < 0.3', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1);
      expect(getBotClaim([PUNG], '2m', 0, 'easy')).toEqual({ kind: 'pung' });
    });

    it('picks a valid sequence for a chow claim', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1);
      expect(getBotClaim([CHOW], '3m', 0, 'easy')).toEqual({
        kind: 'chow',
        sequence: ['3m', '4m', '5m'],
      });
    });
  });

  describe('normal', () => {
    it('always claims win', () => {
      expect(getBotClaim([WIN, PUNG, KONG], '5m', 0, 'normal')).toEqual({ kind: 'win' });
    });

    it('always claims kong when no win is available', () => {
      expect(getBotClaim([KONG, PUNG], '5m', 0, 'normal')).toEqual({ kind: 'kong' });
    });

    it('always claims pung of a terminal tile', () => {
      // '1m' is a terminal — isTerminalOrHonor returns true → always pung
      for (let i = 0; i < 20; i++) {
        expect(getBotClaim([PUNG], '1m', 0, 'normal')).toEqual({ kind: 'pung' });
      }
    });

    it('always claims pung of an honor tile', () => {
      // 'east' is an honor — isTerminalOrHonor returns true → always pung
      for (let i = 0; i < 20; i++) {
        expect(getBotClaim([PUNG], 'east', 0, 'normal')).toEqual({ kind: 'pung' });
      }
    });

    it('passes on a simple pung when random >= 0.5', () => {
      // '5m' is a simple (2–8) — falls through to the 50 % check
      vi.spyOn(Math, 'random').mockReturnValue(0.7);
      expect(getBotClaim([PUNG], '5m', 0, 'normal')).toBeNull();
    });

    it('claims a simple pung when random < 0.5', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.3);
      expect(getBotClaim([PUNG], '5m', 0, 'normal')).toEqual({ kind: 'pung' });
    });

    it('passes chow when openMeldCount >= 2', () => {
      expect(getBotClaim([CHOW], '3m', 2, 'normal')).toBeNull();
      expect(getBotClaim([CHOW], '3m', 3, 'normal')).toBeNull();
    });

    it('claims chow when openMeldCount < 2 and picks the first sequence', () => {
      expect(getBotClaim([CHOW], '3m', 0, 'normal')).toEqual({
        kind: 'chow',
        sequence: ['3m', '4m', '5m'],
      });
      expect(getBotClaim([CHOW], '3m', 1, 'normal')).toEqual({
        kind: 'chow',
        sequence: ['3m', '4m', '5m'],
      });
    });

    it('returns null when no options are available', () => {
      expect(getBotClaim([], '5m', 0, 'normal')).toBeNull();
    });
  });
});
