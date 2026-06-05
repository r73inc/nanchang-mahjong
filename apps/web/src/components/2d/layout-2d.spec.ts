/**
 * layout-2d.spec — unit tests for the 2.5D table coordinate system.
 *
 * Feature: 2DLayout·seat-geometry
 */

import { describe, it, expect } from 'vitest';
import { seatConfig, discardGrid, handLayout, meldLayout, TABLE_ASPECT } from './layout-2d';
import type { SeatRole } from './layout-2d';

const SEAT_INDICES = [0, 1, 2, 3] as const;
const VALID_ROLES: SeatRole[] = ['bottom', 'right', 'top', 'left'];

// ── TABLE_ASPECT ───────────────────────────────────────────────────────────────

describe('TABLE_ASPECT', () => {
  it('is exactly 4/3', () => {
    expect(TABLE_ASPECT).toBeCloseTo(4 / 3, 10);
  });
});

// ── seatConfig ─────────────────────────────────────────────────────────────────

describe('seatConfig · 2DLayout·seat-geometry', () => {
  it('viewer seat always maps to role "bottom"', () => {
    for (const v of SEAT_INDICES) {
      expect(seatConfig(v, v).role).toBe('bottom');
    }
  });

  it('every seat returns a valid role', () => {
    for (const v of SEAT_INDICES) {
      for (const s of SEAT_INDICES) {
        const { role } = seatConfig(s, v);
        expect(VALID_ROLES).toContain(role);
      }
    }
  });

  it('all four roles appear exactly once across the four seats', () => {
    for (const v of SEAT_INDICES) {
      const roles = SEAT_INDICES.map((s) => seatConfig(s, v).role);
      for (const role of VALID_ROLES) {
        expect(roles.filter((r) => r === role)).toHaveLength(1);
      }
    }
  });

  it('offset-1 seat is always "right"', () => {
    for (const v of SEAT_INDICES) {
      const rightSeat = ((v + 1) % 4) as 0 | 1 | 2 | 3;
      expect(seatConfig(rightSeat, v).role).toBe('right');
    }
  });

  it('offset-2 seat is always "top"', () => {
    for (const v of SEAT_INDICES) {
      const topSeat = ((v + 2) % 4) as 0 | 1 | 2 | 3;
      expect(seatConfig(topSeat, v).role).toBe('top');
    }
  });

  it('offset-3 seat is always "left"', () => {
    for (const v of SEAT_INDICES) {
      const leftSeat = ((v + 3) % 4) as 0 | 1 | 2 | 3;
      expect(seatConfig(leftSeat, v).role).toBe('left');
    }
  });

  it('gridArea matches role name for all 16 combinations', () => {
    for (const v of SEAT_INDICES) {
      for (const s of SEAT_INDICES) {
        const cfg = seatConfig(s, v);
        expect(cfg.gridArea).toBe(cfg.role);
      }
    }
  });

  it('bottom role has no containerTransform', () => {
    for (const v of SEAT_INDICES) {
      expect(seatConfig(v, v).containerTransform).toBe('none');
    }
  });

  it('right role container rotates -90deg', () => {
    for (const v of SEAT_INDICES) {
      const rightSeat = ((v + 1) % 4) as 0 | 1 | 2 | 3;
      expect(seatConfig(rightSeat, v).containerTransform).toBe('rotateZ(-90deg)');
    }
  });

  it('top role container rotates 180deg', () => {
    for (const v of SEAT_INDICES) {
      const topSeat = ((v + 2) % 4) as 0 | 1 | 2 | 3;
      expect(seatConfig(topSeat, v).containerTransform).toBe('rotateZ(180deg)');
    }
  });

  it('left role container rotates +90deg', () => {
    for (const v of SEAT_INDICES) {
      const leftSeat = ((v + 3) % 4) as 0 | 1 | 2 | 3;
      expect(seatConfig(leftSeat, v).containerTransform).toBe('rotateZ(90deg)');
    }
  });

  it('explicit spot-checks: viewerSeat=0', () => {
    expect(seatConfig(0, 0).role).toBe('bottom');
    expect(seatConfig(1, 0).role).toBe('right');
    expect(seatConfig(2, 0).role).toBe('top');
    expect(seatConfig(3, 0).role).toBe('left');
  });

  it('explicit spot-checks: viewerSeat=2', () => {
    expect(seatConfig(2, 2).role).toBe('bottom');
    expect(seatConfig(3, 2).role).toBe('right');
    expect(seatConfig(0, 2).role).toBe('top');
    expect(seatConfig(1, 2).role).toBe('left');
  });
});

// ── discardGrid ────────────────────────────────────────────────────────────────

describe('discardGrid · 2DLayout·seat-geometry', () => {
  it('returns consistent spec for all roles', () => {
    for (const role of VALID_ROLES) {
      const spec = discardGrid(role);
      expect(spec.cols).toBeGreaterThan(0);
      expect(spec.tileSize).toBe('sm');
      expect(spec.gap).toBeGreaterThanOrEqual(0);
    }
  });

  it('all roles share the same spec (container carries rotation)', () => {
    const specs = VALID_ROLES.map((r) => discardGrid(r));
    const first = specs[0];
    for (const s of specs.slice(1)) {
      expect(s).toEqual(first);
    }
  });
});

// ── handLayout ─────────────────────────────────────────────────────────────────

describe('handLayout · 2DLayout·seat-geometry', () => {
  it('viewer bottom hand uses large tiles', () => {
    expect(handLayout('bottom').tileSize).toBe('lg');
  });

  it('opponent hands use extra-small tiles', () => {
    for (const role of VALID_ROLES.filter((r) => r !== 'bottom')) {
      expect(handLayout(role).tileSize).toBe('xs');
    }
  });

  it('gap is non-negative for all roles', () => {
    for (const role of VALID_ROLES) {
      expect(handLayout(role).gap).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── meldLayout ─────────────────────────────────────────────────────────────────

describe('meldLayout · 2DLayout·seat-geometry', () => {
  it('uses medium tiles', () => {
    for (const role of VALID_ROLES) {
      expect(meldLayout(role).tileSize).toBe('md');
    }
  });

  it('kongOffset is negative (bonus tile shifts upward)', () => {
    for (const role of VALID_ROLES) {
      expect(meldLayout(role).kongOffset).toBeLessThan(0);
    }
  });

  it('groupGap is greater than within-meld gap', () => {
    for (const role of VALID_ROLES) {
      const s = meldLayout(role);
      expect(s.groupGap).toBeGreaterThan(s.gap);
    }
  });
});
