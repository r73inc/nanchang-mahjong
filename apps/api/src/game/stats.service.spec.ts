/**
 * StatsService unit tests.
 *
 * Feature coverage:
 *  - Stats·streak: consecutive wins increment streak; a loss resets to 0.
 *  - Stats·rating-delta: correct DDB update expression applied per player.
 */

import { StatsService } from './stats.service';
import { EloService } from './elo.service';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    PK: 'USER#u1',
    SK: 'PROFILE',
    sub: 'u1',
    email: 'a@test.com',
    handle: 'player1',
    role: 'user',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    disabled: false,
    rating: 1500,
    streak: 0,
    gamesPlayed: 0,
    gamesWon: 0,
    ...overrides,
  };
}

function makeDb(profilesByKey: Record<string, Record<string, unknown>>) {
  const updateCalls: Array<{
    Key: Record<string, unknown>;
    ExpressionAttributeValues: Record<string, unknown>;
  }> = [];

  return {
    get: jest.fn().mockImplementation((params: { Key: Record<string, unknown> }) => {
      const pk = params.Key.PK as string;
      const item = profilesByKey[pk];
      return Promise.resolve({ Item: item ?? undefined });
    }),
    update: jest.fn().mockImplementation((params: unknown) => {
      updateCalls.push(params as (typeof updateCalls)[0]);
      return Promise.resolve({});
    }),
    calls: updateCalls,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('StatsService', () => {
  const seatMap: [string, string, string, string] = ['u0', 'u1', 'u2', 'u3'];

  it('Stats·streak — win increments streak', async () => {
    const db = makeDb({
      'USER#u0': makeProfile({ sub: 'u0', streak: 3, rating: 1500 }),
      'USER#u1': makeProfile({ sub: 'u1', streak: 1, rating: 1500 }),
      'USER#u2': makeProfile({ sub: 'u2', streak: 0, rating: 1500 }),
      'USER#u3': makeProfile({ sub: 'u3', streak: 0, rating: 1500 }),
    });
    const elo = new EloService();
    const svc = new StatsService(db as never, elo);

    // Seat 0 wins (placement 1)
    await svc.updateAfterGame(seatMap, [1, 2, 3, 4]);

    // Seat 0's update call should set streak = 4 (3 + 1)
    const seat0Call = db.calls.find((c) => c.Key?.PK === 'USER#u0');
    expect(seat0Call?.ExpressionAttributeValues[':newStreak']).toBe(4);
  });

  it('Stats·streak — loss resets streak to 0', async () => {
    const db = makeDb({
      'USER#u0': makeProfile({ sub: 'u0', streak: 5, rating: 1500 }),
      'USER#u1': makeProfile({ sub: 'u1', streak: 0, rating: 1500 }),
      'USER#u2': makeProfile({ sub: 'u2', streak: 0, rating: 1500 }),
      'USER#u3': makeProfile({ sub: 'u3', streak: 0, rating: 1500 }),
    });
    const elo = new EloService();
    const svc = new StatsService(db as never, elo);

    // Seat 0 comes 2nd (not 1st) → streak resets
    await svc.updateAfterGame(seatMap, [2, 1, 3, 4]);

    const seat0Call = db.calls.find((c) => c.Key?.PK === 'USER#u0');
    expect(seat0Call?.ExpressionAttributeValues[':newStreak']).toBe(0);
  });

  it('Stats·rating-delta — winner gets positive delta, last-place gets negative', async () => {
    const db = makeDb({
      'USER#u0': makeProfile({ sub: 'u0', rating: 1500 }),
      'USER#u1': makeProfile({ sub: 'u1', rating: 1500 }),
      'USER#u2': makeProfile({ sub: 'u2', rating: 1500 }),
      'USER#u3': makeProfile({ sub: 'u3', rating: 1500 }),
    });
    const elo = new EloService();
    const svc = new StatsService(db as never, elo);

    const deltas = await svc.updateAfterGame(seatMap, [1, 2, 3, 4]);

    expect(deltas[0]).toBeGreaterThan(0); // winner gains
    expect(deltas[3]).toBeLessThan(0); // last place loses

    // Verify the DDB update for the winner includes the correct delta
    const seat0Call = db.calls.find((c) => c.Key?.PK === 'USER#u0');
    expect(seat0Call?.ExpressionAttributeValues[':delta']).toBe(deltas[0]);
    expect(seat0Call?.ExpressionAttributeValues[':wonDelta']).toBe(1);
  });

  it('Stats·rating-delta — gamesPlayed incremented for all seats', async () => {
    const db = makeDb({
      'USER#u0': makeProfile({ sub: 'u0' }),
      'USER#u1': makeProfile({ sub: 'u1' }),
      'USER#u2': makeProfile({ sub: 'u2' }),
      'USER#u3': makeProfile({ sub: 'u3' }),
    });
    const elo = new EloService();
    const svc = new StatsService(db as never, elo);

    await svc.updateAfterGame(seatMap, [1, 2, 3, 4]);

    expect(db.calls).toHaveLength(4);
    for (const call of db.calls) {
      expect(call.ExpressionAttributeValues[':one']).toBe(1);
    }
  });

  it('Stats·streak — missing profile defaults to streak=0 then increments on win', async () => {
    const db = makeDb({}); // all profiles missing
    const elo = new EloService();
    const svc = new StatsService(db as never, elo);

    // No crash even if profiles are missing
    await expect(svc.updateAfterGame(seatMap, [1, 2, 3, 4])).resolves.toBeDefined();
    // Seat 0 wins from zero streak → should be 1
    const seat0Call = db.calls.find((c) => c.Key?.PK === 'USER#u0');
    expect(seat0Call?.ExpressionAttributeValues[':newStreak']).toBe(1);
  });
});
