import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ScreenShell } from '../../components/ui/screen-shell';
import { useI18n } from '../../i18n';
import {
  useChallenge,
  useStartChallengeGame,
  useDeclineChallenge,
  useMarkChallengeResultsViewed,
} from '../../hooks/use-challenges';
import { useAuthStore } from '../../stores/auth.store';
import type {
  ChallengeParticipant,
  ChallengeParticipantStatus,
  ChallengeStatus,
  StartChallengeGameResult,
} from '@nanchang/shared';

export function ChallengeDetailPage() {
  const { challengeId } = useParams<{ challengeId: string }>();
  const { t } = useI18n();
  const navigate = useNavigate();
  const mySub = useAuthStore((s) => s.user?.sub ?? '');

  const { data: challenge, isLoading, isError } = useChallenge(challengeId!);
  const startGame = useStartChallengeGame();
  const declineChallenge = useDeclineChallenge();
  const markViewed = useMarkChallengeResultsViewed();

  const [confirmDecline, setConfirmDecline] = useState(false);

  // Auto-mark results as viewed when the player opens a completed challenge.
  useEffect(() => {
    if (challenge?.status === 'completed' && challengeId) {
      void markViewed.mutateAsync(challengeId);
    }
  }, [challenge?.status, challengeId]);

  if (isLoading) {
    return (
      <ScreenShell title={t('challengeDetailTitle')} onBack={() => navigate('/lobby')}>
        <div className="flex items-center justify-center h-60 text-mj-bone/50 text-sm">…</div>
      </ScreenShell>
    );
  }

  if (isError || !challenge) {
    return (
      <ScreenShell title={t('challengeDetailTitle')} onBack={() => navigate('/lobby')}>
        <div className="flex items-center justify-center h-60 text-red-400 text-sm">
          {t('error')}
        </div>
      </ScreenShell>
    );
  }

  const myParticipant = challenge.participants.find((p) => p.sub === mySub);
  const myStatus: ChallengeParticipantStatus | undefined = myParticipant?.status;
  const isCreator = myParticipant?.role === 'creator';
  const challengeStatus: ChallengeStatus = challenge.status;
  const canStart = !isCreator && myStatus === 'pending' && challengeStatus === 'open';
  const canResume = !isCreator && myStatus === 'accepted' && myParticipant?.gameId;
  const canDecline = !isCreator && myStatus === 'pending' && challengeStatus === 'open';
  const canSeeScores = myStatus === 'completed' || isCreator;

  async function handleStart() {
    const result: StartChallengeGameResult = await startGame.mutateAsync(challengeId!);
    navigate(`/game/${result.gameId}`);
  }

  async function handleResume() {
    navigate(`/game/${myParticipant!.gameId}`);
  }

  async function handleDecline() {
    await declineChallenge.mutateAsync(challengeId!);
    navigate('/lobby');
  }

  const roundsLabel = t('challengeRoundsLabel').replace(
    '{{0}}',
    String(challenge.config.numRounds),
  );
  const creatorParticipant = challenge.participants.find((p) => p.role === 'creator');
  const creatorHandle = creatorParticipant?.handle ?? '';

  return (
    <ScreenShell title={t('challengeDetailTitle')} onBack={() => navigate('/lobby')}>
      <div className="px-4 py-6 flex flex-col gap-5">
        {/* ── Challenge header ─────────────────────────────────────────────── */}
        <div
          className="rounded-2xl px-5 py-4 flex flex-col gap-1"
          style={{ background: 'rgba(201,169,97,0.08)', border: '1px solid rgba(201,169,97,0.25)' }}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold tracking-wider text-mj-gold uppercase">
              {t('pointChallenge')}
            </span>
            <StatusBadge status={challengeStatus} />
          </div>
          <p className="text-sm text-mj-bone/70">
            {isCreator
              ? t('challengeYouCreated')
              : t('challengeCreatedBy').replace('{{0}}', creatorHandle)}
          </p>
        </div>

        {/* ── Configuration ────────────────────────────────────────────────── */}
        <Section title={t('challengeConfig')}>
          <ConfigRow label={t('challengeRoundsLabel').replace('{{0}}', '')} value={roundsLabel} />
          <ConfigRow
            label={t('challengeBotDifficulty')}
            value={t(
              challenge.config.botDifficulty === 'easy' ? 'challengeBotEasy' : 'challengeBotNormal',
            )}
          />
          <ConfigRow
            label={t('challengeStartingScore')}
            value={String(challenge.config.startingScore)}
          />
          <ConfigRow
            label={t('challengeRuleTopBottomJing')}
            value={challenge.config.ruleTopBottomJing ? t('ruleOn') : t('ruleOff')}
          />
        </Section>

        {/* ── Scoreboard ───────────────────────────────────────────────────── */}
        <Section title={t('challengeParticipants')}>
          {!canSeeScores && challengeStatus !== 'completed' && (
            <p className="text-xs text-mj-bone/50 mb-3">{t('challengeScoreHidden')}</p>
          )}
          <div className="flex flex-col gap-2">
            {challenge.participants.map((p, idx) => (
              <ParticipantRow
                key={p.sub}
                participant={p}
                rank={canSeeScores && p.status === 'completed' ? idx + 1 : undefined}
                isSelf={p.sub === mySub}
                showScore={canSeeScores}
                isWinner={challenge.winners?.includes(p.sub) ?? false}
              />
            ))}
          </div>
        </Section>

        {/* ── My score callout (after completing) ─────────────────────────── */}
        {myStatus === 'completed' && myParticipant?.finalScore !== undefined && (
          <div
            className="rounded-2xl px-5 py-4 text-center"
            style={{ background: 'rgba(201,169,97,0.1)', border: '1px solid rgba(201,169,97,0.3)' }}
          >
            <p className="text-xs text-mj-bone/60 mb-1">{t('challengeMyScore')}</p>
            <p className="text-3xl font-bold text-mj-gold">
              {myParticipant.finalScore.toLocaleString()}
            </p>
          </div>
        )}

        {/* ── CTA buttons ──────────────────────────────────────────────────── */}
        {canStart && (
          <button
            onClick={handleStart}
            disabled={startGame.isPending}
            className="w-full py-4 rounded-[14px] font-bold text-sm text-mj-ink"
            style={{
              background: 'linear-gradient(180deg,#c9a961 0%,#a88a45 100%)',
              boxShadow: '0 6px 18px rgba(201,169,97,0.3)',
            }}
          >
            {startGame.isPending ? '…' : t('challengeStartGame')}
          </button>
        )}

        {canResume && (
          <button
            onClick={handleResume}
            className="w-full py-4 rounded-[14px] font-bold text-sm text-mj-ink"
            style={{
              background: 'linear-gradient(180deg,#c9a961 0%,#a88a45 100%)',
              boxShadow: '0 6px 18px rgba(201,169,97,0.3)',
            }}
          >
            {t('challengeResumeGame')}
          </button>
        )}

        {canDecline && !confirmDecline && (
          <button
            onClick={() => setConfirmDecline(true)}
            className="w-full py-3.5 rounded-[14px] font-semibold text-sm"
            style={{
              background: 'rgba(var(--felt-ink-rgb),0.05)',
              border: '1px solid rgba(var(--felt-ink-rgb),0.12)',
              color: 'rgba(var(--felt-ink-rgb),0.6)',
            }}
          >
            {t('challengeDecline')}
          </button>
        )}

        {confirmDecline && (
          <div
            className="rounded-2xl p-4 flex flex-col gap-3"
            style={{ background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.3)' }}
          >
            <p className="text-sm font-semibold text-red-400 text-center">
              {t('challengeDeclineConfirm')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDecline(false)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-mj-bone/70"
                style={{
                  background: 'rgba(var(--felt-ink-rgb),0.06)',
                  border: '1px solid rgba(var(--felt-ink-rgb),0.12)',
                }}
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleDecline}
                disabled={declineChallenge.isPending}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white"
                style={{ background: '#c0392b' }}
              >
                {declineChallenge.isPending ? '…' : t('challengeDecline')}
              </button>
            </div>
          </div>
        )}

        {startGame.isError && (
          <div className="text-sm text-red-400 text-center">{String(startGame.error)}</div>
        )}
      </div>
    </ScreenShell>
  );
}

// Decorative non-translatable symbol extracted so the i18n linter ignores it.
const STAR_SYMBOL = '★';

// ── Internal helpers ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold text-mj-bone/50 uppercase tracking-wider mb-2">{title}</p>
      <div
        className="rounded-2xl px-5 py-4"
        style={{
          background: 'rgba(var(--felt-ink-rgb),0.04)',
          border: '1px solid rgba(var(--felt-ink-rgb),0.1)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-black/[0.06] last:border-0">
      <span className="text-xs text-mj-bone/60">{label}</span>
      <span className="text-xs font-semibold text-mj-bone/90">{value}</span>
    </div>
  );
}

function ParticipantRow({
  participant,
  rank,
  isSelf,
  showScore,
  isWinner,
}: {
  participant: ChallengeParticipant;
  rank: number | undefined;
  isSelf: boolean;
  showScore: boolean;
  isWinner: boolean;
}) {
  const { t } = useI18n();
  const statusKey = `challengeStatus${capitalize(participant.status)}` as never;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{
        background: isSelf ? 'rgba(201,169,97,0.08)' : 'rgba(var(--felt-ink-rgb),0.03)',
        border: isSelf
          ? '1px solid rgba(201,169,97,0.2)'
          : '1px solid rgba(var(--felt-ink-rgb),0.07)',
      }}
    >
      {/* Rank badge */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
        style={{
          background: isWinner ? 'rgba(201,169,97,0.3)' : 'rgba(var(--felt-ink-rgb),0.08)',
          color: isWinner ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.5)',
        }}
      >
        {rank ?? '—'}
      </div>

      {/* Handle */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-mj-bone truncate">
          {participant.handle}
          {isSelf && <span className="ml-1.5 text-xs text-mj-bone/50">({t('challengeYou')})</span>}
          {isWinner && (
            <span className="ml-1.5 text-xs text-mj-gold" aria-hidden="true">
              {STAR_SYMBOL}
            </span>
          )}
        </p>
        <p className="text-xs text-mj-bone/50">{t(statusKey)}</p>
      </div>

      {/* Score */}
      {showScore && participant.finalScore !== undefined ? (
        <span className="text-sm font-bold text-mj-bone tabular-nums">
          {participant.finalScore.toLocaleString()}
        </span>
      ) : participant.status !== 'completed' ? (
        <span className="text-xs text-mj-bone/40">—</span>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: ChallengeStatus }) {
  const { t } = useI18n();
  const key = `challengeOverall${capitalize(
    status === 'awaiting_creator' ? 'Awaiting' : status,
  )}` as never;

  const color =
    status === 'completed'
      ? { bg: 'rgba(39,174,96,0.12)', border: 'rgba(39,174,96,0.35)', text: '#27ae60' }
      : status === 'cancelled'
        ? { bg: 'rgba(192,57,43,0.1)', border: 'rgba(192,57,43,0.3)', text: '#e74c3c' }
        : { bg: 'rgba(201,169,97,0.12)', border: 'rgba(201,169,97,0.35)', text: '#c9a961' };

  return (
    <span
      className="text-xs font-bold px-2.5 py-1 rounded-full"
      style={{ background: color.bg, border: `1px solid ${color.border}`, color: color.text }}
    >
      {t(key)}
    </span>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
