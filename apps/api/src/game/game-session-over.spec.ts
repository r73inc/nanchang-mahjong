/**
 * game-session-over.spec — unit tests for GameService.isSessionOver() (private).
 *
 * isSessionOver() is a pure function of the session state, so we access it via
 * (service as any) after constructing GameService with fully-mocked deps.
 *
 * Feature coverage:
 *  SessionOver·bust·mid-round-negative    — negative score mid-round does NOT end session
 *  SessionOver·bust·round-end-negative    — negative score at round end DOES end session
 *  SessionOver·bust·round-end-all-positive — all positive at round end does NOT end session
 *  SessionOver·bust·round-end-all-zero    — zero scores at round end does NOT end session
 *  SessionOver·rounds·east-mid-round      — east-only, mid-round does NOT end
 *  SessionOver·rounds·east-round-complete — east-only ends when east round completes
 *  SessionOver·rounds·east+south-east-done — east+south does NOT end after east completes
 *  SessionOver·rounds·east+south-south-done — east+south ends when south round completes
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { GameService } from './game.service';
import { GameSavesService } from './game-saves.service';
import { DynamoDBService } from '../database/dynamodb.service';
import { StatsService } from './stats.service';
import { StorageService } from '../storage/storage.service';
import { PushService } from '../push/push.service';
import type { RoomSettings } from '@nanchang/shared';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_SETTINGS: RoomSettings = {
  rounds: 'east',
  terminationType: 'rounds',
  maxHands: 1,
  startingScore: 0,
  timerSecs: 30,
  viewMode: '3D',
  ruleTopBottomJing: false,
  claimWindowSecs: 8,
};

function makeSession(
  terminationType: 'rounds' | 'bust',
  rounds: 'east' | 'east+south',
  scores: [number, number, number, number],
  roundWind: 'east' | 'south' = 'east',
): {
  settings: RoomSettings;
  cumulativeScores: [number, number, number, number];
  engine: { state: { roundWind: string } };
} {
  return {
    settings: { ...BASE_SETTINGS, terminationType, rounds },
    cumulativeScores: scores,
    engine: { state: { roundWind } },
  };
}

function nextInfo(
  roundComplete: boolean,
  roundWind: 'east' | 'south' | 'west' | 'north' = 'east',
): {
  dealerSeat: 0 | 1 | 2 | 3;
  roundWind: 'east' | 'south' | 'west' | 'north';
  roundComplete: boolean;
} {
  return { dealerSeat: 0, roundWind, roundComplete };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyService = any;

describe('GameService.isSessionOver', () => {
  let svc: AnyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameService,
        { provide: DynamoDBService, useValue: {} },
        { provide: StatsService, useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: PushService, useValue: {} },
        { provide: GameSavesService, useValue: {} },
        { provide: ModuleRef, useValue: {} },
      ],
    }).compile();

    svc = module.get(GameService);
  });

  // ── Bust mode ──────────────────────────────────────────────────────────────

  it('SessionOver·bust·mid-round-negative — does NOT end when score negative but round not complete', () => {
    const session = makeSession('bust', 'east', [20, -3, 5, 8]);
    expect(svc.isSessionOver(session, nextInfo(false))).toBe(false);
  });

  it('SessionOver·bust·round-end-negative — DOES end when round completes and a score is negative', () => {
    const session = makeSession('bust', 'east', [20, -3, 5, 8]);
    expect(svc.isSessionOver(session, nextInfo(true))).toBe(true);
  });

  it('SessionOver·bust·round-end-all-positive — does NOT end when round completes with all positive', () => {
    const session = makeSession('bust', 'east', [18, 22, 15, 25]);
    expect(svc.isSessionOver(session, nextInfo(true))).toBe(false);
  });

  it('SessionOver·bust·round-end-all-zero — does NOT end when round completes with all at zero', () => {
    const session = makeSession('bust', 'east', [0, 0, 0, 0]);
    expect(svc.isSessionOver(session, nextInfo(true))).toBe(false);
  });

  // ── Rounds mode ────────────────────────────────────────────────────────────

  it('SessionOver·rounds·east-mid-round — does NOT end east-only mid-round', () => {
    const session = makeSession('rounds', 'east', [0, 0, 0, 0]);
    expect(svc.isSessionOver(session, nextInfo(false, 'east'))).toBe(false);
  });

  it('SessionOver·rounds·east-round-complete — ends east-only when east round completes', () => {
    const session = makeSession('rounds', 'east', [0, 0, 0, 0]);
    expect(svc.isSessionOver(session, nextInfo(true, 'south'))).toBe(true);
  });

  it('SessionOver·rounds·east+south-east-done — does NOT end east+south when east round completes', () => {
    const session = makeSession('rounds', 'east+south', [0, 0, 0, 0]);
    expect(svc.isSessionOver(session, nextInfo(true, 'south'))).toBe(false);
  });

  it('SessionOver·rounds·east+south-south-done — ends east+south when south round completes', () => {
    const session = makeSession('rounds', 'east+south', [0, 0, 0, 0], 'south');
    expect(svc.isSessionOver(session, nextInfo(true, 'west'))).toBe(true);
  });

  // ── Fixed hand count (Point Challenge numRounds) ──────────────────────────

  it('SessionOver·target-hands·not-reached — does NOT end when handsPlayed < targetHands', () => {
    const session = {
      ...makeSession('rounds', 'east', [0, 0, 0, 0]),
      targetHands: 3,
      handsPlayed: 2,
    };
    expect(svc.isSessionOver(session, nextInfo(false))).toBe(false);
  });

  it('SessionOver·target-hands·reached — DOES end when handsPlayed === targetHands', () => {
    const session = {
      ...makeSession('rounds', 'east', [0, 0, 0, 0]),
      targetHands: 3,
      handsPlayed: 3,
    };
    expect(svc.isSessionOver(session, nextInfo(false))).toBe(true);
  });

  it('SessionOver·target-hands·overrides-wind-round — ends after 1 hand even when roundComplete is false', () => {
    // numRounds:1 challenge must end after 1 hand regardless of dealer rotation.
    const session = {
      ...makeSession('rounds', 'east', [0, 0, 0, 0]),
      targetHands: 1,
      handsPlayed: 1,
    };
    expect(svc.isSessionOver(session, nextInfo(false))).toBe(true);
  });

  it('SessionOver·target-hands·single-hand-not-yet — 1-hand challenge does NOT end before first hand completes', () => {
    const session = {
      ...makeSession('rounds', 'east', [0, 0, 0, 0]),
      targetHands: 1,
      handsPlayed: 0,
    };
    expect(svc.isSessionOver(session, nextInfo(false))).toBe(false);
  });
});
