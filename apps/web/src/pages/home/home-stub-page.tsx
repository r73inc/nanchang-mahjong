import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useSignout } from '../../hooks/use-auth';
import { useMyProfile } from '../../hooks/use-profile';
import { ScreenShell } from '../../components/ui/screen-shell';
import { AvatarImg } from '../../components/ui/avatar-img';
import { useI18n } from '../../i18n';
import type { StringKey } from '../../i18n/strings';
import { usePushNotifications } from '../../hooks/use-push-notifications';
import { useThemeStore } from '../../stores/theme.store';
import { useSaves, useLoadAutoSave, useLoadManualSave, useDeleteSave } from '../../hooks/use-saves';
import { useChallenges, useChallenge, useStartChallengeGame } from '../../hooks/use-challenges';
import type { SaveSlotInfo, Challenge } from '@nanchang/shared';

const SEP_DOT = ' · ' as const;

// ── Open Challenges UI ─────────────────────────────────────────────────────────

function OpenChallengeCard({
  challenge,
  mySub,
  isLoading,
}: {
  challenge: Challenge | undefined;
  mySub: string;
  isLoading: boolean;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const startGame = useStartChallengeGame();

  if (isLoading || !challenge) {
    return (
      <div className="w-full px-4 py-4 rounded-[14px] text-xs text-mj-bone/40 bg-mj-bone/6 border border-mj-bone/10">
        …
      </div>
    );
  }

  const myParticipant = challenge.participants.find((p) => p.sub === mySub);
  const myStatus = myParticipant?.status;
  const isCreator = myParticipant?.role === 'creator';
  const canStart = !isCreator && myStatus === 'pending' && challenge.status === 'open';
  const resumeGameId = myParticipant?.gameId;
  const canResume =
    !!resumeGameId && (isCreator ? myStatus !== 'completed' : myStatus === 'accepted');
  const creatorParticipant = challenge.participants.find((p) => p.role === 'creator');
  const creatorHandle = creatorParticipant?.handle ?? '';
  const completedCount = challenge.participants.filter((p) => p.status === 'completed').length;
  const totalCount = challenge.participants.length;

  const difficultyKey =
    challenge.config.botDifficulty === 'easy'
      ? 'challengeBotEasy'
      : challenge.config.botDifficulty === 'hard'
        ? 'challengeBotHard'
        : 'challengeBotNormal';

  // Capture before closures — TypeScript doesn't carry narrowing into closure scope.
  const challengeId = challenge.challengeId;

  async function handleStart() {
    const result = await startGame.mutateAsync(challengeId);
    navigate(`/game/${result.gameId}`);
  }

  function handleResume() {
    if (resumeGameId) navigate(`/game/${resumeGameId}`);
  }

  return (
    <div className="w-full rounded-[14px] overflow-hidden border border-mj-gold/30">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between bg-mj-gold/10">
        <span className="text-xs font-bold text-mj-gold uppercase tracking-wide">
          {t('pointChallenge')}
        </span>
        <span className="text-xs text-mj-bone/50">
          {t('homeChallengeProgress', String(completedCount), String(totalCount))}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 flex flex-col gap-2 bg-mj-bone/4">
        <p className="text-sm text-mj-bone/70">
          {isCreator ? t('challengeYouCreated') : t('challengeCreatedBy', creatorHandle)}
        </p>
        <p className="text-xs text-mj-bone/50">
          {t('challengeRoundsLabel', String(challenge.config.numRounds))}
          {SEP_DOT}
          {t(difficultyKey)}
        </p>

        {canStart && (
          <button
            onClick={() => void handleStart()}
            disabled={startGame.isPending}
            className="mt-1 w-full py-3 rounded-xl font-bold text-sm text-mj-ink btn-heirloom disabled:opacity-70"
          >
            {startGame.isPending ? '…' : t('challengeStartGame')}
          </button>
        )}
        {canResume && (
          <button
            onClick={handleResume}
            className="mt-1 w-full py-3 rounded-xl font-bold text-sm text-mj-ink btn-heirloom"
          >
            {t('challengeResumeGame')}
          </button>
        )}
      </div>
    </div>
  );
}

function UnviewedChallengesBanner() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data: challenges } = useChallenges();

  const unviewedCount = (challenges ?? []).filter(
    (c) => c.status === 'completed' && !c.resultsViewed,
  ).length;

  if (unviewedCount === 0) return null;

  return (
    <button
      onClick={() => navigate('/challenges')}
      className="w-full mb-4 px-4 py-3.5 rounded-[14px] flex items-center justify-between text-left"
      style={{
        background: 'rgba(201,169,97,0.1)',
        border: '1px solid rgba(201,169,97,0.35)',
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className="shrink-0 w-2 h-2 rounded-full"
          style={{ background: '#c9a961' }}
          aria-hidden="true"
        />
        <p className="text-sm font-semibold text-mj-gold truncate">
          {t('homeUnviewedChallengeNotice')}
        </p>
      </div>
      <span className="text-mj-gold/60 text-lg ml-3 shrink-0" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

function OpenChallengesSection() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const mySub = useAuthStore((s) => s.user?.sub ?? '');
  const { data: challenges } = useChallenges();

  const actionable = (challenges ?? [])
    .filter(
      (c) =>
        (c.myStatus === 'pending' || c.myStatus === 'accepted') &&
        c.status !== 'completed' &&
        c.status !== 'cancelled',
    )
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const oldest = actionable[0];

  // Fetch full challenge detail for the card (needs participant gameIds for resume).
  const { data: challenge, isLoading } = useChallenge(oldest?.challengeId ?? '');

  if (!oldest) return null;

  return (
    <div className="mb-6">
      <p className="text-xs font-bold text-mj-bone/50 uppercase tracking-wide mb-2 px-1">
        {t('homeChallengesSection')}
      </p>
      <OpenChallengeCard challenge={challenge} mySub={mySub} isLoading={isLoading} />
      {actionable.length > 1 && (
        <button
          onClick={() => navigate('/challenges')}
          className="mt-2 w-full py-2.5 rounded-[14px] text-xs font-semibold text-mj-gold flex items-center justify-center gap-1 bg-mj-gold/8 border border-mj-gold/20"
        >
          {t('homeChallengeViewAll')}
          <span aria-hidden="true">›</span>
        </button>
      )}
    </div>
  );
}

// ── Saved Games UI ─────────────────────────────────────────────────────────────

function SaveSlotCard({
  info,
  onResume,
  onDelete,
  isLoading,
}: {
  info: SaveSlotInfo;
  onResume: () => void;
  onDelete: () => void;
  isLoading: boolean;
}) {
  const { t } = useI18n();
  const label = info.slot === 'auto' ? t('savedGamesAutoLabel') : t('savedGamesManualLabel');
  const date = new Date(info.savedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <div
      className="w-full px-4 py-3 rounded-[14px] flex items-center gap-3"
      style={{
        background: 'rgba(var(--felt-ink-rgb),0.06)',
        border: '1px solid rgba(var(--felt-ink-rgb),0.1)',
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-mj-gold/80 uppercase tracking-wide">{label}</span>
          {info.challengeId && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
              style={{ background: 'rgba(201,169,97,0.15)', color: '#c9a961' }}
            >
              {t('savedGamesChallenge')}
            </span>
          )}
        </div>
        <p className="text-sm font-semibold text-mj-bone truncate mt-0.5">
          {info.seatNames.filter((n) => !n.startsWith('bot-')).join(', ') || info.seatNames[0]}
        </p>
        <p className="text-xs text-mj-bone/40 mt-0.5">
          {t('savedGamesHandsPlayed', String(info.handsPlayed))}
          {SEP_DOT}
          {date}
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={onDelete}
          disabled={isLoading}
          className="text-xs text-mj-bone/40 px-2 py-1 rounded"
          style={{ border: '1px solid rgba(var(--felt-ink-rgb),0.12)' }}
          aria-label={t('savedGamesDelete')}
        >
          {t('savedGamesDelete')}
        </button>
        <button
          onClick={onResume}
          disabled={isLoading}
          className="text-xs font-bold text-mj-ink px-3 py-1 rounded"
          style={{ background: '#c9a961', opacity: isLoading ? 0.6 : 1 }}
        >
          {isLoading ? t('savedGamesLoading') : t('savedGamesResume')}
        </button>
      </div>
    </div>
  );
}

function SavedGamesSection() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data: saves } = useSaves();
  const loadAuto = useLoadAutoSave();
  const loadManual = useLoadManualSave();
  const deleteSave = useDeleteSave();

  if (!saves || saves.length === 0) return null;

  const autoSave = saves.find((s) => s.slot === 'auto');
  const manualSave = saves.find((s) => s.slot === 'manual');

  const handleResumeAuto = async () => {
    const result = await loadAuto.mutateAsync();
    navigate(`/game/${result.gameId}`);
  };

  const handleResumeManual = async () => {
    const result = await loadManual.mutateAsync();
    // Always navigate directly to the game. For multi-player restores the
    // RestoreWaitingOverlay inside GamePage shows the code and manages the
    // lobby — no intermediate screen needed here.
    navigate(`/game/${result.gameId}`);
  };

  return (
    <div className="mb-6">
      <p className="text-xs font-bold text-mj-bone/50 uppercase tracking-wide mb-2 px-1">
        {t('savedGamesTitle')}
      </p>
      <div className="space-y-2">
        {autoSave && (
          <SaveSlotCard
            info={autoSave}
            onResume={() => void handleResumeAuto()}
            onDelete={() => deleteSave.mutate('auto')}
            isLoading={loadAuto.isPending || deleteSave.isPending}
          />
        )}
        {manualSave && (
          <SaveSlotCard
            info={manualSave}
            onResume={() => void handleResumeManual()}
            onDelete={() => deleteSave.mutate('manual')}
            isLoading={loadManual.isPending || deleteSave.isPending}
          />
        )}
      </div>
    </div>
  );
}

// Defined outside JSX so the no-literal-string rule doesn't flag path strings.
const NAV_ITEMS: Array<{ key: StringKey; path: string; icon: string }> = [
  { key: 'profileLink', path: '/profile', icon: '👤' },
  { key: 'friendsLink', path: '/friends', icon: '👥' },
  { key: 'historyLink', path: '/history', icon: '📜' },
  { key: 'learnLink', path: '/learn', icon: '📖' },
  { key: 'customizeLink', path: '/customize', icon: '🎨' },
];

interface SettingToggleRowProps {
  title: string;
  description: string;
  isToggled: boolean;
  onToggle: () => void;
  show?: boolean;
  disabled?: boolean;
}

const SettingToggleRow = ({
  title,
  description,
  isToggled,
  onToggle,
  show = true,
  disabled = false,
}: SettingToggleRowProps) => {
  if (!show) return null;
  return (
    <div
      className="w-full flex items-center justify-between px-4 py-3.5 rounded-[14px]"
      style={{
        background: 'rgba(var(--felt-ink-rgb),0.06)',
        border: '1px solid rgba(var(--felt-ink-rgb),0.08)',
      }}
    >
      <div className="flex-1 min-w-0 mr-3">
        <p className="text-sm text-mj-bone">{title}</p>
        <p className="text-[11px] text-mj-bone/40 mt-0.5">{description}</p>
      </div>
      <button
        onClick={onToggle}
        disabled={disabled}
        aria-label={title}
        role="switch"
        aria-checked={isToggled}
        className="relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50"
        style={{
          background: isToggled ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.15)',
          border: isToggled ? 'none' : '1px solid rgba(var(--felt-ink-rgb),0.2)',
        }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
          style={{
            transform: isToggled ? 'translateX(20px)' : 'translateX(0)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}
        />
      </button>
    </div>
  );
};

export function HomeStubPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const signout = useSignout();
  const { data: profile } = useMyProfile();
  const { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe } =
    usePushNotifications();
  const soundEnabled = useThemeStore((s) => s.soundEnabled);
  const setSoundEnabled = useThemeStore((s) => s.setSoundEnabled);

  return (
    <ScreenShell title={t('homeTitle')}>
      <div className="px-5 py-6">
        {/* Welcome banner */}
        <div className="mb-8 flex items-center gap-3">
          {/* Avatar circle — links to profile page for easy upload */}
          <button
            onClick={() => navigate('/profile')}
            aria-label={t('profileLink')}
            className="rounded-full flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-mj-gold/50"
          >
            <AvatarImg
              avatarUrl={profile?.avatarUrl}
              seed={user?.sub ?? user?.handle ?? ''}
              size={56}
            />
          </button>
          <div>
            <p className="text-sm text-mj-bone/60">{t('welcomeBack')}</p>
            <h2 className="text-2xl font-bold text-mj-bone">@{user?.handle ?? '—'}</h2>
          </div>
          {user?.role === 'admin' && (
            <span
              className="inline-block mt-2 px-2.5 py-0.5 rounded-md text-[11px] font-bold
                         bg-mj-gold/15 text-mj-gold border border-mj-gold/30"
            >
              {t('adminBadge')}
            </span>
          )}
        </div>

        {/* Unviewed completed challenges — shown when results are waiting to be seen */}
        <UnviewedChallengesBanner />

        {/* Open Challenges — shown above saves when player has challenges to play */}
        <OpenChallengesSection />

        {/* Saved Games — shown when the player has at least one save */}
        <SavedGamesSection />

        {/* Play Nanchang Mahjong — entry to all game modes */}
        <button
          onClick={() => navigate('/play')}
          className="w-full mb-6 px-5 py-5 rounded-2xl font-bold text-lg text-mj-ink flex items-center justify-between btn-heirloom"
          style={{ border: '1px solid rgba(255,255,255,0.3)' }}
        >
          <div className="text-left">
            <div>{t('playNanchang')}</div>
            <div className="text-sm opacity-70 font-normal mt-0.5">{t('playNanchangSub')}</div>
          </div>
          <span className="text-2xl" aria-hidden="true">
            →
          </span>
        </button>

        {/* Learn nudge */}
        <button
          onClick={() => navigate('/learn')}
          className="w-full mb-6 px-4 py-3 rounded-xl flex items-center justify-between text-left"
          style={{
            background: 'rgba(var(--felt-ink-rgb),0.05)',
            border: '1px solid rgba(var(--felt-ink-rgb),0.1)',
          }}
        >
          <div>
            <p className="text-sm font-semibold text-mj-bone/80">{t('learnNudge')}</p>
            <p className="text-xs text-mj-bone/45 mt-0.5">{t('learnNudgeSub')}</p>
          </div>
          <span className="text-mj-bone/30 text-lg ml-4" aria-hidden="true">
            ›
          </span>
        </button>

        {/* Navigation shortcuts */}
        <div className="grid grid-cols-5 gap-2 mb-4">
          {NAV_ITEMS.map(({ key, path, icon }) => (
            <button
              key={key}
              onClick={() => navigate(path)}
              className="flex flex-col items-center gap-1.5 py-4 rounded-[14px] text-sm text-mj-bone/80"
              style={{
                background: 'rgba(var(--felt-ink-rgb),0.06)',
                border: '1px solid rgba(var(--felt-ink-rgb),0.09)',
              }}
            >
              <span className="text-xl" aria-hidden="true">
                {icon}
              </span>
              <span className="text-[11px] font-semibold">{t(key)}</span>
            </button>
          ))}
        </div>

        {/* Admin panel link — only visible to admins */}
        {user?.role === 'admin' && (
          <div className="mb-4">
            <button
              onClick={() => navigate('/admin')}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-[14px] text-sm text-mj-gold"
              style={{
                background: 'rgba(201,169,97,0.08)',
                border: '1px solid rgba(201,169,97,0.2)',
              }}
            >
              <span>{t('adminPanel')}</span>
              <span className="text-mj-gold/50" aria-hidden="true">
                ›
              </span>
            </button>
          </div>
        )}

        {/* Settings actions */}
        <div className="space-y-2 mb-6">
          <SettingToggleRow
            title={t('soundEffects')}
            description={t('soundEffectsDesc')}
            isToggled={soundEnabled}
            onToggle={() => setSoundEnabled(!soundEnabled)}
          />

          <SettingToggleRow
            title={t('pushNotifications')}
            description={permission === 'denied' ? t('pushDenied') : t('pushNotificationsDesc')}
            isToggled={isSubscribed}
            onToggle={() => void (isSubscribed ? unsubscribe() : subscribe())}
            show={isSupported}
            disabled={isLoading || permission === 'denied'}
          />

          <button
            onClick={() => navigate('/account')}
            className="w-full flex items-center justify-between px-4 py-3.5 rounded-[14px] text-sm text-mj-bone"
            style={{
              background: 'rgba(var(--felt-ink-rgb),0.06)',
              border: '1px solid rgba(var(--felt-ink-rgb),0.08)',
            }}
          >
            <span>{t('accountLink')}</span>
            <span className="text-mj-bone/35" aria-hidden="true">
              ›
            </span>
          </button>
        </div>

        {/* Sign out */}
        <button
          onClick={signout}
          className="w-full py-3.5 rounded-[14px] text-sm font-semibold text-mj-bone/70
                     bg-transparent border border-mj-bone/15"
        >
          {t('signOut')}
        </button>
      </div>
    </ScreenShell>
  );
}
