/**
 * AiSummaryService — HK-side orchestrator for AI-generated replay commentary.
 *
 * Responsibilities:
 *   1. Extract a compact GameFactsDigest from a ReplayGamePayload (no raw events to Gemini).
 *   2. Build versioned, bilingual prompts and dispatch to the us-east-1 relay.
 *   3. Manage the AiSummaryItem lifecycle in DynamoDB (none → processing → done/failed).
 *   4. Load replay payloads from S3 on behalf of callers.
 *
 * Phase 3 scope: internal only. Exposed via an admin-only debug endpoint.
 * Phase 4 adds the request queue; Phase 5 hooks challenge auto-generation here.
 */

import { Injectable, Logger } from '@nestjs/common';
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
} from '@nanchang/shared';
import type {
  GameFactsDigest,
  GameHandDigest,
  DigestPlayer,
  HandOutcome,
  WinMethod,
  AiSummaryItem,
  AiSummaryErrorCode,
  RelayGenerateRequest,
} from '@nanchang/shared';

// ── Prompt versioning ─────────────────────────────────────────────────────────

const PROMPT_VERSION_GAME = 'v1-game';

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
        status: 'processing',
        requestedBy,
        requestedAt: now,
        approvedBy: 'auto',
        approvedAt: now,
        model,
        promptVersion: PROMPT_VERSION_GAME,
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
      UpdateExpression: 'SET #status = :done, #text = :text, generatedAt = :now, model = :model',
      ExpressionAttributeNames: { '#status': 'status', '#text': 'text' },
      ExpressionAttributeValues: {
        ':done': 'done',
        ':text': text,
        ':now': new Date().toISOString(),
        ':model': model,
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
        'SET #status = :failed, errorCode = :code, errorMessage = :msg, attempts = attempts + :one',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':failed': 'failed',
        ':code': errorCode,
        ':msg': errorMessage,
        ':one': 1,
      },
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
}
