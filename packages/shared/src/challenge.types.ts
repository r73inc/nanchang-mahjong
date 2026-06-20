/**
 * Point Challenge — shared types for challenge creation, tracking, and display.
 *
 * A Point Challenge lets one player configure a bot-only match, capture the
 * random seed, play through the match, then invite friends to play the same
 * game (same seed, same settings). Scores are compared once all participants
 * have finished or declined.
 */

import type { BotDifficulty } from './room.schemas';

// ── Core types ────────────────────────────────────────────────────────────────

/** Number of wind-rounds to play (1 = East only, 4 = full East+South+West+North). */
export type ChallengeNumRounds = 1 | 2 | 3 | 4;

/** Per-participant status within a challenge. */
export type ChallengeParticipantStatus = 'pending' | 'accepted' | 'declined' | 'completed';

/** Whether the participant created the challenge or was invited. */
export type ChallengeParticipantRole = 'creator' | 'challenged';

/** Overall challenge lifecycle status. */
export type ChallengeStatus = 'awaiting_creator' | 'open' | 'completed' | 'cancelled';

/**
 * Game configuration stored with a challenge.
 * terminationType is always 'rounds' for challenges; the number of rounds is
 * expressed as ChallengeNumRounds rather than the string-based RoomSettings.rounds.
 */
export interface ChallengeConfig {
  numRounds: ChallengeNumRounds;
  botDifficulty: BotDifficulty;
  startingScore: number;
  timerSecs: number;
  viewMode: '2D' | '3D';
  ruleTopBottomJing: boolean;
  claimWindowSecs: number;
}

/** One participant's state within a challenge. */
export interface ChallengeParticipant {
  sub: string;
  handle: string;
  role: ChallengeParticipantRole;
  status: ChallengeParticipantStatus;
  /** The game session the participant played (set when they start the game). */
  gameId?: string;
  /**
   * Final score from the participant's match.
   * Visibility is controlled by the API: only exposed once the requesting
   * user has completed their own game (or the whole challenge is done).
   */
  finalScore?: number;
  completedAt?: string;
}

/** Full challenge record returned from the API. */
export interface Challenge {
  challengeId: string;
  /** Display handle of the creator. */
  creatorHandle: string;
  config: ChallengeConfig;
  participants: ChallengeParticipant[];
  status: ChallengeStatus;
  /** Subs of participants with the highest score (populated when status = 'completed'). */
  winners?: string[];
  createdAt: string;
  completedAt?: string;
  /** Whether the requesting user has already viewed the final scoreboard. */
  resultsViewed: boolean;
}

/** Lightweight summary for list views (no per-participant scores). */
export interface ChallengeSummary {
  challengeId: string;
  creatorHandle: string;
  config: ChallengeConfig;
  status: ChallengeStatus;
  participantCount: number;
  completedCount: number;
  /** The requesting user's own participant status. */
  myStatus: ChallengeParticipantStatus;
  createdAt: string;
  /**
   * Whether the requesting user has opened the final results screen for this
   * challenge. Only meaningful when status = 'completed'. False means the
   * player hasn't viewed the final scoreboard yet.
   */
  resultsViewed: boolean;
}

// ── REST DTO types (used by both API and web) ─────────────────────────────────

export interface CreateChallengeInput {
  /** subs of friends to challenge (1–10). */
  challengedSubs: string[];
  config: ChallengeConfig;
}

export interface CreateChallengeResult {
  challengeId: string;
  /** Game ID for the creator's match — navigate to /game/:gameId immediately. */
  gameId: string;
}

export interface StartChallengeGameResult {
  gameId: string;
}
