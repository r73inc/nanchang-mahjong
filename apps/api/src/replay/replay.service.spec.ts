/**
 * replay.service.spec — unit tests for ReplayService.
 *
 * Feature coverage:
 *  - Replay·permission: non-player non-friend gets ForbiddenException
 *  - Replay·share-auth: game not found gives NotFoundException
 *  - Replay·permission: player in seatMap gets the payload
 *  - Replay·permission: accepted friend of a player gets the payload
 */

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReplayService } from './replay.service';
import type { ReplayGamePayload } from '@nanchang/shared';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEAT_MAP: [string, string, string, string] = ['p0', 'p1', 'p2', 'p3'];

function makeDb(seatMap?: [string, string, string, string]) {
  return {
    get: jest.fn().mockResolvedValue(seatMap ? { Item: { seatMap } } : { Item: undefined }),
  };
}

function makeStorage(payload?: ReplayGamePayload) {
  return {
    getReplay: jest.fn().mockResolvedValue(payload ?? ({ gameId: 'g1' } as ReplayGamePayload)),
  };
}

function makeFriends(isFriend: boolean) {
  return {
    areFriends: jest.fn().mockResolvedValue(isFriend),
  };
}

function makeService(
  db: ReturnType<typeof makeDb>,
  storage: ReturnType<typeof makeStorage>,
  friends: ReturnType<typeof makeFriends>,
) {
  return new ReplayService(db as never, storage as never, friends as never);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReplayService', () => {
  it('Replay·share-auth — throws NotFoundException when game does not exist', async () => {
    const svc = makeService(makeDb(undefined), makeStorage(), makeFriends(false));
    await expect(svc.getReplayForViewer('missing-game', 'viewer')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('Replay·permission — player in seatMap receives the payload', async () => {
    const payload = { gameId: 'g1', seatMap: SEAT_MAP } as ReplayGamePayload;
    const storage = makeStorage(payload);
    const svc = makeService(makeDb(SEAT_MAP), storage, makeFriends(false));

    const result = await svc.getReplayForViewer('g1', 'p2'); // p2 is seat 2
    expect(result).toEqual(payload);
    expect(storage.getReplay).toHaveBeenCalledWith('g1');
  });

  it('Replay·permission — accepted friend of a player receives the payload', async () => {
    const payload = { gameId: 'g1' } as ReplayGamePayload;
    const storage = makeStorage(payload);
    const friends = makeFriends(true); // viewer IS a friend
    const svc = makeService(makeDb(SEAT_MAP), storage, friends);

    const result = await svc.getReplayForViewer('g1', 'friend-of-p0');
    expect(result).toEqual(payload);
    expect(friends.areFriends).toHaveBeenCalledWith('friend-of-p0', SEAT_MAP);
  });

  it('Replay·permission — non-player non-friend gets ForbiddenException', async () => {
    const svc = makeService(makeDb(SEAT_MAP), makeStorage(), makeFriends(false));
    await expect(svc.getReplayForViewer('g1', 'stranger')).rejects.toThrow(ForbiddenException);
  });

  it('Replay·permission — friend check is skipped when viewer is a player', async () => {
    const friends = makeFriends(false);
    const svc = makeService(makeDb(SEAT_MAP), makeStorage(), friends);

    await svc.getReplayForViewer('g1', 'p0'); // p0 is a player
    expect(friends.areFriends).not.toHaveBeenCalled();
  });
});
