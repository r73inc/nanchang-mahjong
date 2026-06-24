/**
 * AI Replay Commentary — shared types for the Gemini-powered summary feature.
 *
 * Phase 1: types and DK key helpers only. No runtime behaviour yet.
 *
 * Summary item status machine (stored on GAME#<id>/AI_SUMMARY and CHALLENGE#<id>/AI_SUMMARY):
 *   none → requested → approved → processing → done   (terminal)
 *                                 processing → failed  (retryable by admin-ai-features holder)
 *
 * Request queue item (AIREQ#<id>/META):
 *   pending → approved (→ triggers generation job)
 *           → rejected (request record resolved, game/challenge stays without summary)
 */

import type { SeatWind } from './game.events';

// ── Bilingual text ─────────────────────────────────────────────────────────────

/** Every generated text payload carries both languages atomically. */
export interface BilingualText {
  en: string;
  zh: string;
}

// ── Summary status machine ────────────────────────────────────────────────────

/**
 * Lifecycle of a GAME or CHALLENGE summary item in DynamoDB.
 * The item does not exist until a request/auto-trigger creates it (representing 'none').
 */
export type AiSummaryStatus = 'requested' | 'approved' | 'processing' | 'done' | 'failed';

/** Error codes surfaced in the failed-jobs admin screen. */
export type AiSummaryErrorCode = '403' | '404' | '5xx' | 'timeout' | 'validation' | 'parse';

/** Shape of a GAME#<id>/AI_SUMMARY or CHALLENGE#<id>/AI_SUMMARY DynamoDB item. */
export interface AiSummaryItem {
  PK: string; // GAME#<id> or CHALLENGE#<id>
  SK: 'AI_SUMMARY';
  status: AiSummaryStatus;
  /** Present when status = 'done'. Both languages always populated together. */
  text?: BilingualText;
  requestedBy: string; // user sub, or 'auto' for challenge auto-generation
  requestedAt: string;
  approvedBy?: string; // user sub, or 'auto'
  approvedAt?: string;
  model?: string; // Gemini model id used
  promptVersion?: string; // for reproducibility
  generatedAt?: string;
  attempts: number;
  errorCode?: AiSummaryErrorCode;
  errorMessage?: string;
}

// ── Request queue ─────────────────────────────────────────────────────────────

/** Status of a user-initiated AI summary request awaiting admin decision. */
export type AiRequestStatus = 'pending' | 'approved' | 'rejected';

/**
 * AIREQ#<reqId>/META DynamoDB item.
 * A user who cannot auto-approve creates one of these; an admin-ai-features
 * holder then approves or rejects it. One open request per target enforced.
 */
export interface AiRequestItem {
  PK: string; // AIREQ#<reqId>
  SK: 'META';
  gsi1pk: string; // AIREQ_STATUS#<status> — mirrors invite status GSI pattern
  gsi1sk: string; // <reqId>
  status: AiRequestStatus;
  /** 'game' or 'challenge' */
  targetType: 'game' | 'challenge';
  /** The game or challenge id. */
  targetId: string;
  requestedBy: string; // user sub
  requestedAt: string;
  resolvedBy?: string; // sub of the admin-ai-features holder who approved/rejected
  resolvedAt?: string;
}

// ── Facts digest (compact structured input to Gemini) ─────────────────────────
//
// The HK API extracts these from ReplayGamePayload before dispatching to the
// relay. Keeping digests compact controls token cost and improves consistency.

/** Outcome of a single hand. */
export type HandOutcome = 'win' | 'draw' | 'bust' | 'concede';

/** How the winning player won their hand. */
export type WinMethod = 'tsumo' | 'ron' | 'kong';

/** Compact per-hand summary for the facts digest. */
export interface GameHandDigest {
  handIndex: number;
  dealerSeat: 0 | 1 | 2 | 3;
  roundWind: SeatWind;
  outcome: HandOutcome;
  /** Present when outcome = 'win'. */
  winner?: {
    seat: 0 | 1 | 2 | 3;
    handle: string;
    how: WinMethod;
  };
  /** Seat of the player whose discard was claimed on a ron. */
  dealInSeat?: 0 | 1 | 2 | 3;
  /** Score change per seat for this hand (positive = gain, negative = loss). */
  scoreDeltas: [number, number, number, number];
  /** Named special hands e.g. "Seven Pairs", "Thirteen Misfits". */
  specialHands: string[];
  /** Number of Jing (spirit/wildcard) tiles involved in the winning hand. */
  jingCount: number;
  hasRobKong: boolean;
  hasConcede: boolean;
}

/** Seat-level player info included in every digest. */
export interface DigestPlayer {
  seat: 0 | 1 | 2 | 3;
  sub: string;
  handle: string;
  isBot: boolean;
}

/**
 * Facts digest for a single game (normal match overview or per-player challenge breakdown).
 * Built from ReplayGamePayload by AiSummaryService.
 */
export interface GameFactsDigest {
  gameId: string;
  players: DigestPlayer[];
  /** Subset of room settings relevant to commentary. */
  settings: {
    rounds: string;
    terminationType: string;
    startingScore: number;
    ruleTopBottomJing: boolean;
  };
  startedAt: string;
  endedAt: string;
  finalScores: [number, number, number, number];
  placement: [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4];
  result: 'win' | 'draw' | 'concede' | 'bust';
  hands: GameHandDigest[];
}

/** Per-hand divergence across participants in a Point Challenge. */
export interface ChallengeHandDivergence {
  handIndex: number;
  /** One entry per participant (only 'completed' participants). */
  participantOutcomes: Array<{
    sub: string;
    handle: string;
    outcome: HandOutcome;
    isWinner: boolean;
    /** Score swing for this seat in this hand. */
    scoreSwing: number;
    specialHands: string[];
    jingCount: number;
  }>;
}

/** Participant summary for the challenge facts digest. */
export interface ChallengeDigestParticipant {
  sub: string;
  handle: string;
  gameId: string;
  finalScore: number;
  placement: 1 | 2 | 3 | 4;
}

/**
 * Facts digest for a Point Challenge overview.
 * Aligns all completed participants' games by hand index using shared seeds.
 */
export interface ChallengeFactsDigest {
  challengeId: string;
  participants: ChallengeDigestParticipant[];
  numHands: number;
  /** Hand-by-hand divergence across participants (same deal, different decisions). */
  divergence: ChallengeHandDivergence[];
}

// ── Gemini relay contract (provider-agnostic) ─────────────────────────────────
//
// The HK API owns prompt content; the us-east-1 Lambda relay owns only the
// Gemini API mechanics (endpoint, auth, request/response mapping).
// This contract keeps them decoupled: prompt changes require no relay redeploy.

/**
 * Request sent from the HK API to the us-east-1 Gemini relay Lambda.
 * The relay maps this to the Gemini generateContent request body.
 */
export interface RelayGenerateRequest {
  /** Gemini model id to invoke (e.g. 'gemini-1.5-flash'). */
  model: string;
  /** Opaque version tag for auditing / A-B prompt comparison. */
  promptVersion: string;
  /** System instruction sent to Gemini. */
  systemInstruction: string;
  /** User-turn prompt containing the facts digest. */
  userPrompt: string;
  /**
   * JSON Schema object describing the expected response.
   * Must declare 'en' and 'zh' as required string properties so Gemini
   * returns a single-pass bilingual JSON object.
   */
  responseSchema: object;
  /** Word cap for challenge overviews (absent for per-game overviews). */
  wordCap?: number;
}

/**
 * Successful response from the Gemini relay.
 * Both language fields are always populated together (atomic single-pass generation).
 */
export interface RelayGenerateResponse {
  text: BilingualText;
  /** Actual model id used (may differ if the relay normalises it). */
  model: string;
  promptVersion: string;
}

/**
 * Error response from the Gemini relay (returned as a 4xx/5xx body).
 * Surfaces in the failed-jobs admin screen.
 */
export interface RelayErrorResponse {
  errorCode: AiSummaryErrorCode;
  message: string;
}

// ── Summary payload shapes returned to the frontend ──────────────────────────

/**
 * The AI summary info included in replay/challenge API responses.
 * Only the status and (when done) the bilingual text are client-visible.
 */
export interface AiSummaryPublic {
  status: AiSummaryStatus;
  text?: BilingualText;
  errorCode?: AiSummaryErrorCode;
}

/**
 * Admin view of an AI request queue item.
 * Returned by GET /admin/ai-requests.
 */
export interface AiRequestPublic {
  reqId: string;
  status: AiRequestStatus;
  targetType: 'game' | 'challenge';
  targetId: string;
  requestedBy: string;
  requestedAt: string;
}

/**
 * Admin view of a failed AI job.
 * Returned by GET /admin/ai-jobs?status=failed.
 */
export interface AiJobFailedPublic {
  targetType: 'game' | 'challenge';
  targetId: string;
  attempts: number;
  errorCode?: AiSummaryErrorCode;
  errorMessage?: string;
  requestedBy: string;
  requestedAt: string;
}
