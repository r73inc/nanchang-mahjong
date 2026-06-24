/**
 * AiSummaryService — HK-side orchestrator for AI-generated replay commentary.
 *
 * Responsibilities:
 *   1. Extract a compact GameFactsDigest / ChallengeFactsDigest (no raw events to Gemini).
 *   2. Build versioned, bilingual prompts and dispatch to the us-east-1 relay.
 *   3. Manage the AiSummaryItem lifecycle in DynamoDB (none → processing → done/failed).
 *   4. Load replay payloads from S3 and challenge records from DDB on behalf of callers.
 *
 * Phase 3: per-game digests + admin debug endpoint.
 * Phase 4: request queue + admin approval flow.
 * Phase 5: challenge digest extraction + auto-generation on challenge completion.
 */

import {
  Injectable,
  Logger,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBService } from '../database/dynamodb.service';
import { StorageService } from '../storage/storage.service';
import { GeminiRelayClient } from './gemini-relay.client';
import type { AppConfig } from '../config/configuration';
import type {
  ReplayGamePayload,
  ReplayHandData,
  GameEvent,
  TileType,
  SeatWind,
  ChallengeStatus,
} from '@nanchang/shared';
import type {
  GameFactsDigest,
  GameHandDigest,
  DigestPlayer,
  HandOutcome,
  WinMethod,
  AiSummaryItem,
  AiSummaryStatus,
  AiSummaryErrorCode,
  AiRequestItem,
  RelayGenerateRequest,
  ChallengeFactsDigest,
  ChallengeHandDivergence,
  ChallengeDigestParticipant,
} from '@nanchang/shared';

// ── Prompt versioning ─────────────────────────────────────────────────────────

const PROMPT_VERSION_GAME = 'v1-game';
const PROMPT_VERSION_CHALLENGE = 'v1-challenge';

// ── Internal DDB projection type for challenge records ────────────────────────

/** Minimal projection of CHALLENGE#<id>/META that AiSummaryService needs. */
interface ChallengeRecord {
  challengeId: string;
  config: {
    numRounds: number;
    startingScore: number;
    ruleTopBottomJing: boolean;
  };
  participants: Record<
    string,
    {
      sub: string;
      handle: string;
      role: string;
      status: string;
      gameId?: string;
      finalScore?: number;
    }
  >;
  winners?: string[];
  createdAt: string;
  completedAt?: string;
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    en: { type: 'string' },
    zh: { type: 'string' },
  },
  required: ['en', 'zh'],
};

// ── Digest extraction helpers ─────────────────────────────────────────────────

function isJingTile(tile: TileType, primary: TileType | null, secondary: TileType | null): boolean {
  return tile === primary || tile === secondary;
}

function detectRobKong(events: GameEvent[], winIdx: number): boolean {
  for (let j = winIdx - 1; j >= 0; j--) {
    const prev = events[j];
    if (prev.kind === 'draw') continue;
    if (prev.kind === 'kong_added') {
      const winEv = events[winIdx];
      return winEv.kind === 'win' && prev.seat !== winEv.seat;
    }
    return false;
  }
  return false;
}

function lastActionSeat(
  events: GameEvent[],
  beforeIdx: number,
  targetKind: string,
): (0 | 1 | 2 | 3) | undefined {
  for (let j = beforeIdx - 1; j >= 0; j--) {
    const ev = events[j];
    if (ev.kind === targetKind && 'seat' in ev) {
      return (ev as { seat: 0 | 1 | 2 | 3 }).seat;
    }
  }
  return undefined;
}

function countJings(
  events: GameEvent[],
  winnerSeat: 0 | 1 | 2 | 3,
  primary: TileType | null,
  secondary: TileType | null,
): number {
  if (!primary && !secondary) return 0;

  const dealEv = events.find((e) => e.kind === 'deal');
  const initialHand: TileType[] = dealEv && dealEv.kind === 'deal' ? dealEv.hands[winnerSeat] : [];
  let count = initialHand.filter((t) => isJingTile(t, primary, secondary)).length;

  let jingKnown = false;
  for (const ev of events) {
    if (ev.kind === 'jing_indicator') {
      jingKnown = true;
      continue;
    }
    if (!jingKnown) continue;
    if (ev.kind === 'draw' && ev.seat === winnerSeat && isJingTile(ev.tile, primary, secondary)) {
      count++;
    } else if (
      ev.kind === 'discard' &&
      ev.seat === winnerSeat &&
      isJingTile(ev.tile, primary, secondary)
    ) {
      count--;
    }
  }

  return Math.max(0, count);
}

/**
 * Derive per-hand score deltas from authoritative event sources first.
 *
 * Priority order:
 *   1. Sum of all score-bearing events in the hand:
 *        win.paymentResult.scoreDelta  — hand-payment (includes kong payouts embedded in WinPaymentResult)
 *        opening_jing_settlement.scoreDelta — spirit-flip opening bonus
 *        sacking_dealer.scoreDelta           — four-winds-alignment early draw penalty
 *   2. Fallback: (endScores − startingScores) when no scoring events exist
 *        (draw, concede, or any hand that ended without a scoreDelta event).
 *
 * NOTE: intra-hand spirit settlement paid at session layer is NOT emitted as a
 * GameEvent, so event-based sums may undercount for win hands.  The caller
 * logs a reconciliation warning when the aggregate deviates from the terminal
 * game differential so regressions are visible without silently swallowing data.
 */
function extractHandScoreDeltas(
  hand: ReplayHandData,
  endScores: [number, number, number, number],
): [number, number, number, number] {
  const delta: [number, number, number, number] = [0, 0, 0, 0];

  for (const ev of hand.events) {
    let ds: readonly [number, number, number, number] | undefined;
    if (ev.kind === 'win') ds = ev.paymentResult.scoreDelta;
    else if (ev.kind === 'opening_jing_settlement') ds = ev.scoreDelta;
    else if (ev.kind === 'sacking_dealer') ds = ev.scoreDelta;
    if (ds) {
      delta[0] += ds[0];
      delta[1] += ds[1];
      delta[2] += ds[2];
      delta[3] += ds[3];
    }
  }

  // No scoring events present — draw/concede/abnormal termination.
  // Fall back to the score-book diff which captures spirit settlement too.
  if (delta[0] === 0 && delta[1] === 0 && delta[2] === 0 && delta[3] === 0) {
    return [
      endScores[0] - hand.startingScores[0],
      endScores[1] - hand.startingScores[1],
      endScores[2] - hand.startingScores[2],
      endScores[3] - hand.startingScores[3],
    ];
  }

  return delta;
}

function extractHandDigest(
  events: GameEvent[],
  handIndex: number,
  dealerSeat: 0 | 1 | 2 | 3,
  roundWind: SeatWind,
  scoreDeltas: [number, number, number, number],
  players: DigestPlayer[],
): GameHandDigest {
  const winIdx = events.findIndex((e) => e.kind === 'win');
  const concedeIdx = events.findIndex((e) => e.kind === 'concede');
  const drawIdx = events.findIndex((e) => e.kind === 'draw_game');

  let outcome: HandOutcome = 'draw';
  let winner: GameHandDigest['winner'];
  let dealInSeat: (0 | 1 | 2 | 3) | undefined;
  let hasRobKong = false;
  const specialHands: string[] = [];
  let jingCount = 0;

  const jingEv = events.find((e) => e.kind === 'jing_indicator');
  const primary = jingEv && jingEv.kind === 'jing_indicator' ? jingEv.jingPrimary : null;
  const secondary = jingEv && jingEv.kind === 'jing_indicator' ? jingEv.jingSecondary : null;

  if (winIdx >= 0) {
    outcome = 'win';
    const winEv = events[winIdx];
    if (winEv.kind !== 'win') throw new Error('unreachable');

    hasRobKong = detectRobKong(events, winIdx);
    const how: WinMethod = winEv.winType === 'tsumo' ? 'tsumo' : hasRobKong ? 'kong' : 'ron';

    const winnerPlayer = players.find((p) => p.seat === winEv.seat);
    winner = { seat: winEv.seat, handle: winnerPlayer?.handle ?? `Seat ${winEv.seat}`, how };

    if (!hasRobKong && winEv.winType === 'ron') {
      dealInSeat = lastActionSeat(events, winIdx, 'discard');
    } else if (hasRobKong) {
      dealInSeat = lastActionSeat(events, winIdx, 'kong_added');
    }

    if (winEv.handType === 'seven_pairs') specialHands.push('Seven Pairs');
    else if (winEv.handType === 'all_triplets') specialHands.push('Seven Pairs (All Triplets)');
    else if (winEv.handType === 'thirteen_misfits') specialHands.push('Thirteen Misfits');
    else if (winEv.handType === 'seven_star_thirteen')
      specialHands.push('Seven Star Thirteen Misfits');

    jingCount = countJings(events, winEv.seat, primary, secondary);
  } else if (concedeIdx >= 0) {
    outcome = 'concede';
  } else if (drawIdx >= 0) {
    outcome = 'draw';
  }

  return {
    handIndex,
    dealerSeat,
    roundWind,
    outcome,
    winner,
    dealInSeat,
    scoreDeltas,
    specialHands,
    jingCount,
    hasRobKong,
    hasConcede: outcome === 'concede',
  };
}

// ── Challenge hand helpers ────────────────────────────────────────────────────

/**
 * Extract outcome, score swing (seat 0 = human in solo challenge games), special
 * hands, and jing count for a single challenge hand from the human player's perspective.
 * Seat 0 is always the human in a challenge solo room (1 human + 3 bots).
 */
function extractChallengeHandMeta(
  hand: ReplayHandData,
  endScores: [number, number, number, number],
): {
  outcome: HandOutcome;
  scoreSwing: number;
  specialHands: string[];
  jingCount: number;
} {
  const delta = extractHandScoreDeltas(hand, endScores);
  const winIdx = hand.events.findIndex((e) => e.kind === 'win');
  const concedeIdx = hand.events.findIndex((e) => e.kind === 'concede');

  let outcome: HandOutcome = 'draw';
  if (winIdx >= 0) outcome = 'win';
  else if (concedeIdx >= 0) outcome = 'concede';

  const specialHands: string[] = [];
  let jingCount = 0;

  if (winIdx >= 0) {
    const winEv = hand.events[winIdx];
    if (winEv.kind === 'win') {
      if (winEv.handType === 'seven_pairs') specialHands.push('Seven Pairs');
      else if (winEv.handType === 'all_triplets') specialHands.push('Seven Pairs (All Triplets)');
      else if (winEv.handType === 'thirteen_misfits') specialHands.push('Thirteen Misfits');
      else if (winEv.handType === 'seven_star_thirteen')
        specialHands.push('Seven Star Thirteen Misfits');

      // Count jings only when the human player (seat 0) won the hand.
      if (winEv.seat === 0) {
        const jingEv = hand.events.find((e) => e.kind === 'jing_indicator');
        const primary = jingEv?.kind === 'jing_indicator' ? jingEv.jingPrimary : null;
        const secondary = jingEv?.kind === 'jing_indicator' ? jingEv.jingSecondary : null;
        jingCount = countJings(hand.events, 0, primary, secondary);
      }
    }
  }

  return { outcome, scoreSwing: delta[0], specialHands, jingCount };
}

// ── Prompt building ───────────────────────────────────────────────────────────

function formatPlacement(rank: 1 | 2 | 3 | 4): string {
  return rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : '4th';
}

function formatWind(wind: SeatWind): string {
  const map: Record<SeatWind, string> = {
    east: 'East',
    south: 'South',
    west: 'West',
    north: 'North',
  };
  return map[wind] ?? wind;
}

function buildHandLine(
  hand: GameHandDigest,
  players: DigestPlayer[],
  endScores: [number, number, number, number],
): string {
  const dealerHandle =
    players.find((p) => p.seat === hand.dealerSeat)?.handle ?? `Seat ${hand.dealerSeat}`;
  let line = `Hand ${hand.handIndex + 1} | ${formatWind(hand.roundWind)} round | Dealer: ${dealerHandle}`;

  if (hand.outcome === 'win' && hand.winner) {
    const howStr =
      hand.winner.how === 'tsumo' ? 'self-draw' : hand.winner.how === 'kong' ? 'rob-kong' : 'ron';
    let detail = `${hand.winner.handle} won by ${howStr}`;
    if (hand.dealInSeat !== undefined) {
      const dealInHandle =
        players.find((p) => p.seat === hand.dealInSeat)?.handle ?? `Seat ${hand.dealInSeat}`;
      detail += ` (${dealInHandle} dealt in)`;
    }
    if (hand.specialHands.length > 0) detail += ` [${hand.specialHands.join(', ')}]`;
    if (hand.jingCount > 0)
      detail += ` • ${hand.jingCount} spirit tile${hand.jingCount > 1 ? 's' : ''} in hand`;
    if (hand.hasRobKong) detail += ' • ROB-KONG';
    line += ` | ${detail}`;
  } else if (hand.outcome === 'concede') {
    line += ' | concede (player surrendered)';
  } else {
    line += ' | draw (wall exhausted)';
  }

  const swings = hand.scoreDeltas
    .map((d, i) => `${players[i]?.handle ?? `S${i}`}: ${d >= 0 ? '+' : ''}${d}`)
    .join(', ');
  line += `\n  Score swing: ${swings}`;
  line += `\n  Scores after: ${players.map((p, i) => `${p.handle}: ${endScores[i]}`).join(', ')}`;

  return line;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class AiSummaryService {
  private readonly logger = new Logger(AiSummaryService.name);

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly db: DynamoDBService,
    private readonly storage: StorageService,
    private readonly relay: GeminiRelayClient,
  ) {}

  // ── Digest extraction (public for testing) ──────────────────────────────────

  extractGameDigest(payload: ReplayGamePayload): GameFactsDigest {
    const players: DigestPlayer[] = payload.seatMap.map((sub, i) => ({
      seat: i as 0 | 1 | 2 | 3,
      sub,
      handle: payload.seatNames?.[i] ?? `Seat ${i}`,
      isBot: sub.startsWith('bot-'),
    }));

    const hands: GameHandDigest[] = payload.hands.map((hand, i) => {
      const endScores: [number, number, number, number] =
        i + 1 < payload.hands.length ? payload.hands[i + 1].startingScores : payload.finalScores;

      const scoreDeltas = extractHandScoreDeltas(hand, endScores);

      return extractHandDigest(
        hand.events,
        i,
        hand.dealerSeat,
        hand.roundWind,
        scoreDeltas,
        players,
      );
    });

    // Reconciliation guard: warn if per-hand delta sum diverges from terminal game differential.
    // A gap here means spirit settlement (not emitted as a GameEvent) was not captured.
    if (payload.hands.length > 0) {
      const netDelta = hands.reduce<[number, number, number, number]>(
        (acc, h) => [
          acc[0] + h.scoreDeltas[0],
          acc[1] + h.scoreDeltas[1],
          acc[2] + h.scoreDeltas[2],
          acc[3] + h.scoreDeltas[3],
        ],
        [0, 0, 0, 0],
      );
      const terminalDelta: [number, number, number, number] = [
        payload.finalScores[0] - payload.hands[0].startingScores[0],
        payload.finalScores[1] - payload.hands[0].startingScores[1],
        payload.finalScores[2] - payload.hands[0].startingScores[2],
        payload.finalScores[3] - payload.hands[0].startingScores[3],
      ];
      if (netDelta.some((v, i) => v !== terminalDelta[i])) {
        this.logger.warn(
          `Score delta mismatch for game ${payload.gameId}: ` +
            `event sum [${netDelta}] ≠ terminal diff [${terminalDelta}]. ` +
            `Spirit settlement points are likely missing from event log.`,
        );
      }
    }

    return {
      gameId: payload.gameId,
      players,
      settings: {
        rounds: payload.settings.rounds,
        terminationType: payload.settings.terminationType,
        startingScore: payload.settings.startingScore,
        ruleTopBottomJing: payload.settings.ruleTopBottomJing,
      },
      startedAt: payload.startedAt,
      endedAt: payload.endedAt,
      finalScores: payload.finalScores,
      placement: payload.placement,
      result: payload.result,
      hands,
    };
  }

  /**
   * Build a ChallengeFactsDigest from a completed challenge record.
   * Async: loads each completed participant's replay from S3 to extract
   * hand-by-hand divergence (same deal, different decisions).
   */
  async extractChallengeDigest(
    challengeId: string,
    record: ChallengeRecord,
  ): Promise<ChallengeFactsDigest> {
    const completed = Object.values(record.participants).filter(
      (p) => p.status === 'completed' && typeof p.finalScore === 'number' && p.gameId,
    );

    // Rank participants by final score desc; tied scores share the same rank.
    const sorted = [...completed].sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
    const placementMap = new Map<string, number>();
    let rank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i].finalScore !== sorted[i - 1].finalScore) rank = i + 1;
      placementMap.set(sorted[i].sub, rank);
    }

    const participants: ChallengeDigestParticipant[] = completed.map((p) => ({
      sub: p.sub,
      handle: p.handle,
      gameId: p.gameId!,
      finalScore: p.finalScore!,
      placement: Math.min(placementMap.get(p.sub) ?? 1, 4) as 1 | 2 | 3 | 4,
    }));

    // Load every completed participant's replay concurrently.
    const replayResults = await Promise.allSettled(
      participants.map((p) => this.storage.getReplay(p.gameId)),
    );

    const available: Array<{
      participant: ChallengeDigestParticipant;
      replay: ReplayGamePayload;
    }> = [];
    for (let i = 0; i < replayResults.length; i++) {
      const r = replayResults[i];
      if (r.status === 'fulfilled') {
        available.push({ participant: participants[i], replay: r.value });
      } else {
        this.logger.warn(
          `Challenge ${challengeId}: replay load failed for ${participants[i].gameId}: ${r.reason}`,
        );
      }
    }

    const numHands = available.reduce((max, { replay }) => Math.max(max, replay.hands.length), 0);

    // Build hand-by-hand divergence across participants.
    const divergence: ChallengeHandDivergence[] = [];
    for (let h = 0; h < numHands; h++) {
      const participantOutcomes: ChallengeHandDivergence['participantOutcomes'] = [];

      for (const { participant, replay } of available) {
        if (h >= replay.hands.length) continue;
        const hand = replay.hands[h];
        const endScores: [number, number, number, number] =
          h + 1 < replay.hands.length ? replay.hands[h + 1].startingScores : replay.finalScores;

        const { outcome, scoreSwing, specialHands, jingCount } = extractChallengeHandMeta(
          hand,
          endScores,
        );

        participantOutcomes.push({
          sub: participant.sub,
          handle: participant.handle,
          outcome,
          isWinner: record.winners?.includes(participant.sub) ?? false,
          scoreSwing,
          specialHands,
          jingCount,
        });
      }

      if (participantOutcomes.length > 0) {
        divergence.push({ handIndex: h, participantOutcomes });
      }
    }

    return { challengeId, participants, numHands, divergence };
  }

  buildGameRequest(digest: GameFactsDigest): RelayGenerateRequest {
    const model = this.config.get('geminiRelay.model', { infer: true });

    const playerList = digest.players
      .map((p) => `  Seat ${p.seat}: ${p.handle}${p.isBot ? ' (bot)' : ''}`)
      .join('\n');

    const rankList = [...digest.players]
      .sort((a, b) => digest.placement[a.seat] - digest.placement[b.seat])
      .map(
        (p) =>
          `  ${formatPlacement(digest.placement[p.seat])}: ${p.handle} — ${digest.finalScores[p.seat]} pts`,
      )
      .join('\n');

    // Rebuild end-scores per hand
    const startingScoresByHand: [number, number, number, number][] = [];
    // We'd need startingScores per hand, but digest doesn't carry them.
    // Build them from deltas:
    let running: [number, number, number, number] = [
      digest.finalScores[0],
      digest.finalScores[1],
      digest.finalScores[2],
      digest.finalScores[3],
    ];
    for (let i = digest.hands.length - 1; i >= 0; i--) {
      startingScoresByHand[i] = [
        running[0] - digest.hands[i].scoreDeltas[0],
        running[1] - digest.hands[i].scoreDeltas[1],
        running[2] - digest.hands[i].scoreDeltas[2],
        running[3] - digest.hands[i].scoreDeltas[3],
      ];
      running = startingScoresByHand[i];
    }

    const handsSummary = digest.hands
      .map((h, i) => {
        const endScores: [number, number, number, number] =
          i + 1 < digest.hands.length ? startingScoresByHand[i + 1] : digest.finalScores;
        return buildHandLine(h, digest.players, endScores);
      })
      .join('\n\n');

    const systemInstruction = [
      'You are a lively Nanchang Mahjong match reporter and play-breakdown commentator.',
      'Nanchang Mahjong is a regional tile game from Nanchang, Jiangxi, China.',
      'Write engaging, accurate, personality-filled commentary based ONLY on the facts provided.',
      'Rules: (1) Never reference Japanese/Riichi, Hong Kong, or any other Mahjong variant.',
      '(2) No minimum-fan requirement — every valid hand wins unconditionally.',
      '(3) Output MUST be a JSON object with "en" (English) and "zh" (Chinese) fields.',
      'Each language: 3–12 sentences scaled to game length. Narrative, not a stat dump.',
    ].join(' ');

    const userPrompt = [
      '=== NANCHANG MAHJONG GAME SUMMARY ===',
      `Game ID: ${digest.gameId}`,
      `Players:\n${playerList}`,
      `Settings: ${digest.settings.rounds} rounds, ${digest.settings.terminationType} termination, starting score ${digest.settings.startingScore}${digest.settings.ruleTopBottomJing ? ', spirit flip rule active' : ''}`,
      `Duration: ${digest.hands.length} hand${digest.hands.length !== 1 ? 's' : ''} | ${digest.startedAt} → ${digest.endedAt}`,
      `Result: ${digest.result}`,
      `Final standings:\n${rankList}`,
      '',
      '=== HAND-BY-HAND ===',
      handsSummary,
    ].join('\n');

    return {
      model,
      promptVersion: PROMPT_VERSION_GAME,
      systemInstruction,
      userPrompt,
      responseSchema: RESPONSE_SCHEMA,
    };
  }

  buildChallengeRequest(digest: ChallengeFactsDigest, wordCap: number): RelayGenerateRequest {
    const model = this.config.get('geminiRelay.model', { infer: true });

    const standings = [...digest.participants]
      .sort((a, b) => a.placement - b.placement)
      .map((p) => `  ${formatPlacement(p.placement)}: ${p.handle} — ${p.finalScore} pts`)
      .join('\n');

    const handLines = digest.divergence
      .map((hand) => {
        const header = `Hand ${hand.handIndex + 1}`;
        const outcomes = hand.participantOutcomes
          .map((o) => {
            const swing = `${o.scoreSwing >= 0 ? '+' : ''}${o.scoreSwing} pts`;
            let line =
              o.outcome === 'win'
                ? `  ${o.handle}: Win ${swing}`
                : o.outcome === 'concede'
                  ? `  ${o.handle}: Concede ${swing}`
                  : `  ${o.handle}: Draw ${swing}`;
            if (o.specialHands.length > 0) line += ` [${o.specialHands.join(', ')}]`;
            if (o.jingCount > 0)
              line += ` • ${o.jingCount} spirit tile${o.jingCount > 1 ? 's' : ''}`;
            if (o.isWinner) line += ' ★';
            return line;
          })
          .join('\n');
        return `${header}\n${outcomes}`;
      })
      .join('\n\n');

    const systemInstruction = [
      'You are a lively Nanchang Mahjong Point Challenge commentator.',
      'A Point Challenge gives all participants the same pre-determined deal; your job is to compare how they navigated it.',
      'Rules: (1) Never reference Japanese/Riichi, Hong Kong, or any other Mahjong variant.',
      '(2) No minimum-fan requirement — every valid hand wins unconditionally.',
      '(3) Output MUST be a JSON object with "en" (English) and "zh" (Chinese) fields.',
      `Each language: 3–8 sentences (target ≤ ${wordCap} words). Focus on divergence moments and drama, not a stat dump.`,
    ].join(' ');

    const userPrompt = [
      '=== NANCHANG MAHJONG POINT CHALLENGE ===',
      `Challenge ID: ${digest.challengeId}`,
      `Participants: ${digest.participants.length} | Hands played: ${digest.numHands}`,
      '',
      'Final standings:',
      standings,
      '',
      '=== HAND-BY-HAND COMPARISON ===',
      handLines,
    ].join('\n');

    return {
      model,
      promptVersion: PROMPT_VERSION_CHALLENGE,
      systemInstruction,
      userPrompt,
      responseSchema: RESPONSE_SCHEMA,
      wordCap,
    };
  }

  // ── DynamoDB summary item lifecycle ─────────────────────────────────────────

  async getSummary(pk: string): Promise<AiSummaryItem | null> {
    const result = await this.db.get({ Key: { PK: pk, SK: 'AI_SUMMARY' } });
    return (result.Item as AiSummaryItem | undefined) ?? null;
  }

  private async writeSummaryProcessing(
    pk: string,
    requestedBy: string,
    model: string,
    attempts: number,
    promptVersion = PROMPT_VERSION_GAME,
  ): Promise<void> {
    const now = new Date().toISOString();
    // Idempotency guard: refuse to overwrite an in-flight item.
    // attribute_not_exists(PK) covers first-ever write;
    // #status <> :processing covers retries on done/failed items.
    // A concurrent caller hitting an in-flight item gets ConditionalCheckFailedException.
    await this.db.put({
      Item: {
        PK: pk,
        SK: 'AI_SUMMARY',
        gsi1pk: 'AISUMMARY_STATUS#processing',
        gsi1sk: pk,
        status: 'processing',
        requestedBy,
        requestedAt: now,
        approvedBy: 'auto',
        approvedAt: now,
        model,
        promptVersion,
        attempts,
      },
      ConditionExpression: 'attribute_not_exists(PK) OR #status <> :processing',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':processing': 'processing' },
    });
  }

  private async writeSummaryDone(
    pk: string,
    text: { en: string; zh: string },
    model: string,
  ): Promise<void> {
    await this.db.update({
      Key: { PK: pk, SK: 'AI_SUMMARY' },
      UpdateExpression:
        'SET #status = :done, #text = :text, generatedAt = :now, model = :model, gsi1pk = :gsi',
      ExpressionAttributeNames: { '#status': 'status', '#text': 'text' },
      ExpressionAttributeValues: {
        ':done': 'done',
        ':text': text,
        ':now': new Date().toISOString(),
        ':model': model,
        ':gsi': 'AISUMMARY_STATUS#done',
      },
    });
  }

  private async writeSummaryFailed(
    pk: string,
    errorCode: AiSummaryErrorCode,
    errorMessage: string,
  ): Promise<void> {
    await this.db.update({
      Key: { PK: pk, SK: 'AI_SUMMARY' },
      UpdateExpression:
        'SET #status = :failed, errorCode = :code, errorMessage = :msg, attempts = attempts + :one, gsi1pk = :gsi',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':failed': 'failed',
        ':code': errorCode,
        ':msg': errorMessage,
        ':one': 1,
        ':gsi': 'AISUMMARY_STATUS#failed',
      },
    });
  }

  private async writeSummaryRequested(pk: string, requestedBy: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.put({
      Item: {
        PK: pk,
        SK: 'AI_SUMMARY',
        gsi1pk: 'AISUMMARY_STATUS#requested',
        gsi1sk: pk,
        status: 'requested',
        requestedBy,
        requestedAt: now,
        attempts: 0,
      },
      ConditionExpression: 'attribute_not_exists(PK) OR #status = :failed',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':failed': 'failed' },
    });
  }

  // ── Generation orchestration ─────────────────────────────────────────────────

  /**
   * Generate and store an AI summary for a single game.
   *
   * Full lifecycle: write processing → call relay → write done/failed.
   * Called by the admin debug endpoint (Phase 3) and the approval handler (Phase 4).
   */
  async generateGameSummary(gameId: string, requestedBy: string): Promise<AiSummaryItem> {
    const pk = `GAME#${gameId}`;
    const model = this.config.get('geminiRelay.model', { infer: true });

    const existing = await this.getSummary(pk);
    const attempts = (existing?.attempts ?? 0) + 1;

    try {
      await this.writeSummaryProcessing(pk, requestedBy, model, attempts);
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        this.logger.warn(`AI summary for ${pk} is already processing — concurrent run skipped`);
        return (await this.getSummary(pk))!;
      }
      throw err;
    }

    if (!this.relay.isEnabled) {
      await this.writeSummaryFailed(pk, '5xx', 'Gemini relay not configured');
      return (await this.getSummary(pk))!;
    }

    let payload: ReplayGamePayload;
    try {
      payload = await this.storage.getReplay(gameId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to load replay for game ${gameId}: ${msg}`);
      await this.writeSummaryFailed(pk, '5xx', `Replay load failed: ${msg}`);
      return (await this.getSummary(pk))!;
    }

    const digest = this.extractGameDigest(payload);
    const request = this.buildGameRequest(digest);

    const result = await this.relay.generate(request);

    if (result.ok) {
      await this.writeSummaryDone(pk, result.data.text, result.data.model);
      this.logger.log(`AI summary generated for game ${gameId} (${result.data.model})`);
    } else {
      await this.writeSummaryFailed(pk, result.errorCode, result.message);
      this.logger.warn(
        `AI summary failed for game ${gameId}: [${result.errorCode}] ${result.message}`,
      );
    }

    return (await this.getSummary(pk))!;
  }

  // ── Challenge generation (Phase 5) ──────────────────────────────────────────

  private async fetchChallengeRecord(challengeId: string): Promise<ChallengeRecord | null> {
    const result = await this.db.get({ Key: { PK: `CHALLENGE#${challengeId}`, SK: 'META' } });
    return (result.Item as ChallengeRecord | undefined) ?? null;
  }

  /**
   * Generate and store an AI summary for a completed Point Challenge.
   *
   * Full lifecycle: write processing → load replays → call relay → write done/failed.
   * Called automatically when a challenge completes ('auto' requestedBy) and when
   * an admin approves a queued challenge request.
   */
  async generateChallengeSummary(challengeId: string, requestedBy: string): Promise<AiSummaryItem> {
    const pk = `CHALLENGE#${challengeId}`;
    const model = this.config.get('geminiRelay.model', { infer: true });
    const { challengeWordCap } = this.config.get('geminiRelay', { infer: true });

    const existing = await this.getSummary(pk);
    const attempts = (existing?.attempts ?? 0) + 1;

    try {
      await this.writeSummaryProcessing(pk, requestedBy, model, attempts, PROMPT_VERSION_CHALLENGE);
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        this.logger.warn(
          `AI challenge summary for ${pk} is already processing — concurrent run skipped`,
        );
        return (await this.getSummary(pk))!;
      }
      throw err;
    }

    if (!this.relay.isEnabled) {
      await this.writeSummaryFailed(pk, '5xx', 'Gemini relay not configured');
      return (await this.getSummary(pk))!;
    }

    const record = await this.fetchChallengeRecord(challengeId);
    if (!record) {
      await this.writeSummaryFailed(pk, '5xx', `Challenge ${challengeId} not found in DDB`);
      return (await this.getSummary(pk))!;
    }

    let digest: ChallengeFactsDigest;
    try {
      digest = await this.extractChallengeDigest(challengeId, record);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Challenge ${challengeId}: digest extraction failed: ${msg}`);
      await this.writeSummaryFailed(pk, '5xx', `Digest extraction failed: ${msg}`);
      return (await this.getSummary(pk))!;
    }

    if (digest.participants.length === 0) {
      await this.writeSummaryFailed(pk, '5xx', 'No completed participants in challenge');
      return (await this.getSummary(pk))!;
    }

    const request = this.buildChallengeRequest(digest, challengeWordCap);
    const result = await this.relay.generate(request);

    if (result.ok) {
      await this.writeSummaryDone(pk, result.data.text, result.data.model);
      this.logger.log(`AI challenge summary generated for ${challengeId} (${result.data.model})`);
    } else {
      await this.writeSummaryFailed(pk, result.errorCode, result.message);
      this.logger.warn(
        `AI challenge summary failed for ${challengeId}: [${result.errorCode}] ${result.message}`,
      );
    }

    return (await this.getSummary(pk))!;
  }

  // ── Request queue (Phase 4) ──────────────────────────────────────────────────

  /**
   * User-facing entry point to request a game AI summary.
   *
   * hasAutoApprove callers (admin / admin-ai-features holders) bypass the queue and
   * trigger generation immediately.  All others create a pending request item so an
   * admin-ai-features holder can approve it later.
   *
   * Throws ConflictException if a non-failed summary is already in flight or done.
   */
  async requestGameSummary(
    gameId: string,
    requestedBy: string,
    hasAutoApprove: boolean,
  ): Promise<{ queued: boolean; reqId?: string; summary?: AiSummaryItem }> {
    const pk = `GAME#${gameId}`;
    const existing = await this.getSummary(pk);
    const blockingStatuses: AiSummaryStatus[] = ['requested', 'approved', 'processing', 'done'];
    if (existing && blockingStatuses.includes(existing.status)) {
      throw new ConflictException(
        `AI summary already in progress or completed (status: ${existing.status})`,
      );
    }

    if (hasAutoApprove) {
      const summary = await this.generateGameSummary(gameId, requestedBy);
      return { queued: false, summary };
    }

    try {
      await this.writeSummaryRequested(pk, requestedBy);
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        throw new ConflictException(
          'A concurrent AI summary request is already in progress for this game',
        );
      }
      throw err;
    }
    const reqId = await this.createAiRequestItem('game', gameId, requestedBy);
    return { queued: true, reqId };
  }

  /**
   * User-facing entry point to request a challenge AI summary.
   *
   * Rejects immediately if the challenge is not yet completed — summaries are only
   * meaningful once all participants have finished their games.
   *
   * Challenge generation (Phase 5) is not yet implemented, so all requests —
   * including from auto-approve holders — enter the pending queue. Phase 5 will
   * hook into `approveAiRequest` to trigger challenge generation automatically.
   */
  async requestChallengeSummary(
    challengeId: string,
    requestedBy: string,
    challengeStatus: ChallengeStatus,
  ): Promise<{ queued: boolean; reqId: string }> {
    if (challengeStatus !== 'completed') {
      throw new BadRequestException(
        `AI summary can only be requested for completed challenges (status: ${challengeStatus})`,
      );
    }

    const pk = `CHALLENGE#${challengeId}`;
    const existing = await this.getSummary(pk);
    const blockingStatuses: AiSummaryStatus[] = ['requested', 'approved', 'processing', 'done'];
    if (existing && blockingStatuses.includes(existing.status)) {
      throw new ConflictException(
        `AI summary already in progress or completed (status: ${existing.status})`,
      );
    }

    try {
      await this.writeSummaryRequested(pk, requestedBy);
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        throw new ConflictException(
          'A concurrent AI summary request is already in progress for this challenge',
        );
      }
      throw err;
    }
    const reqId = await this.createAiRequestItem('challenge', challengeId, requestedBy);
    return { queued: true, reqId };
  }

  private async createAiRequestItem(
    targetType: 'game' | 'challenge',
    targetId: string,
    requestedBy: string,
  ): Promise<string> {
    // Deterministic key — one AIREQ row per target forever.
    // ConditionExpression blocks overwriting a live pending/approved item;
    // only allows re-creation after a rejection (completing the re-request flow).
    const reqId = `${targetType}:${targetId}`;
    const now = new Date().toISOString();
    await this.db.put({
      Item: {
        PK: `AIREQ#${reqId}`,
        SK: 'META',
        gsi1pk: 'AIREQ_STATUS#pending',
        gsi1sk: reqId,
        status: 'pending',
        targetType,
        targetId,
        requestedBy,
        requestedAt: now,
      },
      ConditionExpression: 'attribute_not_exists(PK) OR #status = :rejected',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':rejected': 'rejected' },
    });
    return reqId;
  }

  async getAiRequest(reqId: string): Promise<AiRequestItem | null> {
    const result = await this.db.get({ Key: { PK: `AIREQ#${reqId}`, SK: 'META' } });
    return (result.Item as AiRequestItem | undefined) ?? null;
  }

  /**
   * Approve a pending request and trigger generation immediately.
   *
   * For game requests: runs generateGameSummary and returns the resulting item.
   * For challenge requests: marks summary as 'approved' — Phase 5 will add generation.
   */
  async approveAiRequest(reqId: string, approvedBy: string): Promise<AiSummaryItem> {
    const req = await this.getAiRequest(reqId);
    if (!req) throw new NotFoundException(`AI request ${reqId} not found`);
    if (req.status !== 'pending') {
      throw new ConflictException(
        `Cannot approve request with status '${req.status}' — only pending requests can be approved`,
      );
    }

    const now = new Date().toISOString();
    await this.db.update({
      Key: { PK: `AIREQ#${reqId}`, SK: 'META' },
      UpdateExpression:
        'SET #status = :approved, resolvedBy = :by, resolvedAt = :now, gsi1pk = :gsi',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':approved': 'approved',
        ':by': approvedBy,
        ':now': now,
        ':gsi': 'AIREQ_STATUS#approved',
      },
    });

    if (req.targetType === 'game') {
      // Pass the original requester — approvedBy is already tracked in resolvedBy on the AIREQ item.
      return this.generateGameSummary(req.targetId, req.requestedBy);
    }

    // Challenge: trigger generation (Phase 5).
    return this.generateChallengeSummary(req.targetId, req.requestedBy);
  }

  /** Reject a pending request. Leaves the summary item at 'requested'. */
  async rejectAiRequest(reqId: string, resolvedBy: string): Promise<void> {
    const req = await this.getAiRequest(reqId);
    if (!req) throw new NotFoundException(`AI request ${reqId} not found`);
    if (req.status !== 'pending') {
      throw new BadRequestException(
        `Cannot reject request with status '${req.status}' — only pending requests can be rejected`,
      );
    }

    await this.db.update({
      Key: { PK: `AIREQ#${reqId}`, SK: 'META' },
      UpdateExpression:
        'SET #status = :rejected, resolvedBy = :by, resolvedAt = :now, gsi1pk = :gsi',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':rejected': 'rejected',
        ':by': resolvedBy,
        ':now': new Date().toISOString(),
        ':gsi': 'AIREQ_STATUS#rejected',
      },
    });
  }

  /** List all pending AI summary requests (admin queue view). */
  async listPendingRequests(): Promise<AiRequestItem[]> {
    const result = await this.db.query({
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: { ':pk': 'AIREQ_STATUS#pending' },
    });
    return (result.Items ?? []) as AiRequestItem[];
  }

  /** List all failed AI summary jobs (for the admin failed-jobs screen). */
  async listFailedJobs(): Promise<AiSummaryItem[]> {
    const result = await this.db.query({
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: { ':pk': 'AISUMMARY_STATUS#failed' },
    });
    return (result.Items ?? []) as AiSummaryItem[];
  }

  /**
   * Admin retry of a failed summary.
   * Delegates to generateGameSummary for games; challenge retry is Phase 5.
   */
  async retryFailedSummary(
    targetType: 'game' | 'challenge',
    targetId: string,
    retriedBy: string,
  ): Promise<AiSummaryItem> {
    if (targetType === 'game') {
      return this.generateGameSummary(targetId, retriedBy);
    }
    return this.generateChallengeSummary(targetId, retriedBy);
  }
}
