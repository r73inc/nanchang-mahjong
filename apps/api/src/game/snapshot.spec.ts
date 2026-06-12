/**
 * snapshot.spec — unit tests for toClientSnapshot redaction.
 *
 * Feature: Gameplay·snapshot-redaction
 * Invariant: Spectators and opponents never receive concealed hand tiles.
 */

import { GameEngine } from '@nanchang/engine';
import { toClientSnapshot } from './snapshot';
import type { ConnState } from './game-session';

// ── Helpers ───────────────────────────────────────────────────────────────────

const GAME_ID = 'game-test-1';

function makeConnState(
  overrides: Partial<ConnState>[] = [],
): [ConnState, ConnState, ConnState, ConnState] {
  return [0, 1, 2, 3].map(
    (_, i): ConnState => ({
      connected: true,
      lastSeenAt: Date.now(),
      afk: false,
      ...overrides[i],
    }),
  ) as [ConnState, ConnState, ConnState, ConnState];
}

function dealedEngine(): GameEngine {
  return GameEngine.create(42).deal();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('snapshot · Gameplay·snapshot-redaction', () => {
  const connState = makeConnState();

  describe('player viewer', () => {
    it('viewer seat has full hand revealed', () => {
      const engine = dealedEngine();
      const snap = toClientSnapshot(engine.state, GAME_ID, 0, connState);

      // Seat 0 is the viewer — full hand
      expect(snap.seats[0].hand).not.toBeNull();
      expect(snap.seats[0].hand!.length).toBe(snap.seats[0].handCount);
      expect(snap.seats[0].hand!.length).toBeGreaterThan(0);
    });

    it('opponent seats have null hand', () => {
      const engine = dealedEngine();
      const snap = toClientSnapshot(engine.state, GAME_ID, 0, connState);

      for (let i = 1; i <= 3; i++) {
        expect(snap.seats[i].hand).toBeNull();
        expect(snap.seats[i].handCount).toBeGreaterThan(0); // count is still present
      }
    });

    it('handCount always equals the true hand length regardless of viewer', () => {
      const engine = dealedEngine();
      const state = engine.state;

      for (let viewer = 0; viewer < 4; viewer++) {
        const snap = toClientSnapshot(state, GAME_ID, viewer as 0 | 1 | 2 | 3, connState);
        for (let i = 0; i < 4; i++) {
          // handCount must equal the actual hand length in all snapshots
          expect(snap.seats[i].handCount).toBe(state.seats[i].hand.length);
        }
      }
    });

    it('viewer seat 2 sees only seat 2 hand', () => {
      const engine = dealedEngine();
      const snap = toClientSnapshot(engine.state, GAME_ID, 2, connState);

      expect(snap.seats[2].hand).not.toBeNull();
      expect(snap.seats[0].hand).toBeNull();
      expect(snap.seats[1].hand).toBeNull();
      expect(snap.seats[3].hand).toBeNull();
    });
  });

  describe('spectator viewer (null)', () => {
    it('all seats have null hand', () => {
      const engine = dealedEngine();
      const snap = toClientSnapshot(engine.state, GAME_ID, null, connState);

      for (let i = 0; i < 4; i++) {
        // Gameplay·spectator-cannot-see-concealed
        expect(snap.seats[i].hand).toBeNull();
        expect(snap.seats[i].handCount).toBeGreaterThan(0);
      }
    });

    it('viewerSeat is null in snapshot', () => {
      const engine = dealedEngine();
      const snap = toClientSnapshot(engine.state, GAME_ID, null, connState);
      expect(snap.viewerSeat).toBeNull();
    });
  });

  describe('wall redaction', () => {
    it('tile identities are never included — only counts and public positions', () => {
      const engine = dealedEngine();
      const snap = toClientSnapshot(engine.state, GAME_ID, 0, connState);

      // The redacted wall must NOT carry drawOrder (the tile identities)
      expect(snap.wall).not.toBeNull();
      expect('drawOrder' in (snap.wall as object)).toBe(false);
      expect(snap.wallCount).toBeGreaterThan(0);
      // Public positional state is present
      expect(snap.wall!.wallSelectionDice).toHaveLength(2);
      expect(snap.wall!.dealStartDice).toHaveLength(2);
      expect(snap.wall!.drawPtr).toBe(53);
      expect(snap.wall!.kongDraws).toBe(0);
    });
  });

  describe('pendingRoll', () => {
    it('passes pendingRoll through to the snapshot', () => {
      const engine = dealedEngine();
      const snap = toClientSnapshot(
        engine.state,
        GAME_ID,
        0,
        connState,
        '2D',
        false,
        'hands',
        undefined,
        undefined,
        undefined,
        { purpose: 'jing_reveal', roller: 0 },
      );
      expect(snap.pendingRoll).toEqual({ purpose: 'jing_reveal', roller: 0 });
    });

    it('defaults pendingRoll to null when not provided', () => {
      const engine = dealedEngine();
      const snap = toClientSnapshot(engine.state, GAME_ID, 0, connState);
      expect(snap.pendingRoll).toBeNull();
    });

    it('Gameplay·dice-roll-pause: dealing preGamePhase is included in snapshot', () => {
      const engine = GameEngine.create(42); // not dealt yet
      const snap = toClientSnapshot(engine.state, GAME_ID, 0, connState, '2D', false, 'dealing');
      expect(snap.preGamePhase).toBe('dealing');
    });
  });

  describe('connection state', () => {
    it('reflects per-seat connected / afk flags', () => {
      const engine = dealedEngine();
      const conn = makeConnState([
        { connected: true, afk: false },
        { connected: false, afk: true },
        { connected: true, afk: false },
        { connected: true, afk: false },
      ]);
      const snap = toClientSnapshot(engine.state, GAME_ID, 0, conn);

      expect(snap.seats[0].connected).toBe(true);
      expect(snap.seats[1].connected).toBe(false);
      expect(snap.seats[1].afk).toBe(true);
    });
  });

  describe('static fields', () => {
    it('gameId, phase, currentSeat are present', () => {
      const engine = dealedEngine();
      const snap = toClientSnapshot(engine.state, GAME_ID, 0, connState);

      expect(snap.gameId).toBe(GAME_ID);
      expect(snap.phase).toBe('jing_reveal');
      expect(typeof snap.currentSeat).toBe('number');
    });

    it('jing fields are null before reveal', () => {
      const engine = dealedEngine();
      const snap = toClientSnapshot(engine.state, GAME_ID, 0, connState);

      // jingIndicator is set during deal but jingPrimary/Secondary after revealJing
      expect(snap.jingPrimary).toBeNull();
      expect(snap.jingSecondary).toBeNull();
    });

    it('jing fields are non-null after reveal', () => {
      const engine = dealedEngine().revealJing();
      const snap = toClientSnapshot(engine.state, GAME_ID, 0, connState);

      expect(snap.jingPrimary).not.toBeNull();
      expect(snap.jingSecondary).not.toBeNull();
    });
  });
});
