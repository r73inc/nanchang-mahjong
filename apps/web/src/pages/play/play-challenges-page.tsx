import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScreenShell } from '../../components/ui/screen-shell';
import { InfoIconButton } from '../../components/ui/info-icon-button';
import { useI18n } from '../../i18n';
import { useChallenges } from '../../hooks/use-challenges';
import type { ChallengeSummary, ChallengeParticipantStatus } from '@nanchang/shared';

const BULLET = '·';
const CHALLENGE_INFO_BORDER = 'rgba(150,100,200,0.4)' as const;
const CHALLENGE_INFO_COLOR = 'rgba(150,100,200,0.7)' as const;

export function PlayChallengesPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [showInfo, setShowInfo] = useState(false);
  const { data: challenges } = useChallenges();

  const actionableChallenges = (challenges ?? [])
    .filter(
      (c) =>
        c.status === 'open' &&
        (c.myStatus === 'pending' || c.myStatus === 'accepted' || c.myStatus === 'completed'),
    )
    .slice(0, 3);

  return (
    <ScreenShell title={t('playChallengesTitle')} onBack={() => navigate('/play')}>
      <div className="px-4 py-6 flex flex-col gap-4">
        {/* Point Challenge card */}
        <div
          className="rounded-2xl p-5"
          style={{
            background: 'rgba(90,60,120,0.08)',
            border: '1px solid rgba(150,100,200,0.25)',
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-bold text-mj-bone">
                {t('playChallengesPointChallengeTitle')}
              </h2>
              <InfoIconButton
                onClick={() => setShowInfo(true)}
                ariaLabel={t('pointChallengeInfoLabel')}
                size={15}
                borderColor={CHALLENGE_INFO_BORDER}
                color={CHALLENGE_INFO_COLOR}
              />
            </div>
            <button
              onClick={() => navigate('/challenges')}
              className="text-xs font-semibold"
              style={{ color: 'rgba(150,100,200,0.9)' }}
            >
              {t('playChallengesViewAll')}
            </button>
          </div>
          <p className="text-xs text-mj-bone/60 mb-4">{t('playChallengesPointChallengeSub')}</p>

          {actionableChallenges.length > 0 && (
            <div className="flex flex-col gap-2 mb-4">
              {actionableChallenges.map((c) => (
                <ChallengeSummaryRow
                  key={c.challengeId}
                  challenge={c}
                  onClick={() => navigate(`/challenges/${c.challengeId}`)}
                />
              ))}
            </div>
          )}

          <button
            onClick={() => navigate('/challenges/create')}
            className="w-full py-3.5 rounded-[14px] font-bold text-sm"
            style={{
              background: 'rgba(150,100,200,0.15)',
              border: '1px solid rgba(150,100,200,0.4)',
              color: 'rgba(190,150,240,0.95)',
            }}
          >
            {t('playChallengesStart')}
          </button>
        </div>

        {/* Future challenge modes placeholder */}
        <div
          className="rounded-2xl px-5 py-4 flex items-center justify-center"
          style={{
            background: 'rgba(var(--felt-ink-rgb),0.03)',
            border: '1px dashed rgba(var(--felt-ink-rgb),0.12)',
          }}
        >
          <p className="text-xs text-mj-bone/35 font-semibold tracking-wide text-center">
            {t('playChallengesMoreSoon')}
          </p>
        </div>
      </div>

      {/* Info modal */}
      {showInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(10,10,10,0.6)', backdropFilter: 'blur(12px)' }}
          onClick={() => setShowInfo(false)}
        >
          <div
            className="w-full max-w-sm mx-4 rounded-xl p-6 flex flex-col gap-3"
            style={{ background: '#1c1c1c', border: '1px solid rgba(150,100,200,0.2)' }}
            role="dialog"
            aria-modal="true"
            aria-label={t('pointChallengeInfoLabel')}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-mj-bone">
              {t('playChallengesPointChallengeTitle')}
            </h3>
            <p className="text-sm text-mj-bone/70 leading-relaxed">{t('pointChallengeInfo')}</p>
            <button
              onClick={() => setShowInfo(false)}
              className="self-end px-4 py-2 rounded-xl text-xs font-bold"
              style={{
                background: 'rgba(150,100,200,0.15)',
                border: '1px solid rgba(150,100,200,0.3)',
                color: 'rgba(190,150,240,0.9)',
              }}
            >
              {t('settingInfoClose')}
            </button>
          </div>
        </div>
      )}
    </ScreenShell>
  );
}

// ── Internal helper ───────────────────────────────────────────────────────────

function ChallengeSummaryRow({
  challenge,
  onClick,
}: {
  challenge: ChallengeSummary;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const myStatusKey =
    `challengeStatus${challenge.myStatus.charAt(0).toUpperCase()}${challenge.myStatus.slice(1)}` as never;
  const statusColor: Record<ChallengeParticipantStatus, string> = {
    pending: '#c9a961',
    accepted: 'rgba(90,175,90,0.9)',
    completed: 'rgba(var(--felt-ink-rgb),0.5)',
    declined: 'rgba(192,57,43,0.8)',
  };

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 rounded-xl text-left w-full"
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
      <span
        className="text-xs font-bold flex-shrink-0"
        style={{ color: statusColor[challenge.myStatus] }}
      >
        {t(myStatusKey)}
      </span>
    </button>
  );
}
