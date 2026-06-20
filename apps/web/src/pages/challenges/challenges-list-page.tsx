import { useNavigate } from 'react-router-dom';
import { ScreenShell } from '../../components/ui/screen-shell';
import { useI18n } from '../../i18n';
import { useChallenges } from '../../hooks/use-challenges';
import type {
  ChallengeSummary,
  ChallengeParticipantStatus,
  ChallengeStatus,
} from '@nanchang/shared';

const BULLET = '·';

export function ChallengesListPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data: challenges, isLoading } = useChallenges();

  return (
    <ScreenShell title={t('challengesListTitle')} onBack={() => navigate('/play/challenges')}>
      <div className="px-4 py-6 flex flex-col gap-3">
        {isLoading ? (
          <div className="text-sm text-mj-bone/50 text-center py-12">…</div>
        ) : !challenges || challenges.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{
              background: 'rgba(var(--felt-ink-rgb),0.04)',
              border: '1px solid rgba(var(--felt-ink-rgb),0.1)',
            }}
          >
            <p className="text-sm text-mj-bone/50">{t('challengesListEmpty')}</p>
          </div>
        ) : (
          challenges.map((c) => (
            <ChallengeRow
              key={c.challengeId}
              challenge={c}
              onClick={() => navigate(`/challenges/${c.challengeId}`)}
            />
          ))
        )}
      </div>
    </ScreenShell>
  );
}

function ChallengeRow({
  challenge,
  onClick,
}: {
  challenge: ChallengeSummary;
  onClick: () => void;
}) {
  const { t } = useI18n();

  const overallStatusColor: Record<ChallengeStatus, string> = {
    awaiting_creator: '#c9a961',
    open: 'rgba(90,175,90,0.9)',
    completed: 'rgba(var(--felt-ink-rgb),0.5)',
    cancelled: 'rgba(192,57,43,0.7)',
  };

  const myStatusColor: Record<ChallengeParticipantStatus, string> = {
    pending: '#c9a961',
    accepted: 'rgba(90,175,90,0.9)',
    completed: 'rgba(var(--felt-ink-rgb),0.5)',
    declined: 'rgba(192,57,43,0.8)',
  };

  const overallStatusKey =
    `challengeOverall${challenge.status.charAt(0).toUpperCase()}${challenge.status.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()).slice(1)}` as never;
  const myStatusKey =
    `challengeStatus${challenge.myStatus.charAt(0).toUpperCase()}${challenge.myStatus.slice(1)}` as never;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-left w-full"
      style={{ background: 'rgba(150,100,200,0.07)', border: '1px solid rgba(150,100,200,0.2)' }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-mj-bone truncate">
          {t('challengeCreatedBy').replace('{{0}}', challenge.creatorHandle)}
        </p>
        <p className="text-xs text-mj-bone/50">
          {t('challengeHandsLabel').replace('{{0}}', String(challenge.config.numRounds))} {BULLET}{' '}
          {challenge.completedCount}/{challenge.participantCount}{' '}
          {t('challengeStatusCompleted').toLowerCase()}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {challenge.status === 'completed' && !challenge.resultsViewed && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-mj-gold/18 text-mj-gold border border-mj-gold/40">
            {t('challengeNewResults')}
          </span>
        )}
        <span
          className="text-[10px] font-bold"
          style={{ color: overallStatusColor[challenge.status] }}
        >
          {t(overallStatusKey)}
        </span>
        <span className="text-xs font-bold" style={{ color: myStatusColor[challenge.myStatus] }}>
          {t(myStatusKey)}
        </span>
      </div>
    </button>
  );
}
