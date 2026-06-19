import { useNavigate } from 'react-router-dom';
import { ScreenShell } from '../../components/ui/screen-shell';
import { useI18n } from '../../i18n';

interface PlayModeCardProps {
  title: string;
  subtitle: string;
  accent: string;
  accentBg: string;
  accentBorder: string;
  onClick: () => void;
  badge?: string;
  primary?: boolean;
}

function PlayModeCard({
  title,
  subtitle,
  accent,
  accentBg,
  accentBorder,
  onClick,
  badge,
  primary = false,
}: PlayModeCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full px-5 py-5 rounded-2xl font-bold text-left flex items-center justify-between${primary ? ' btn-heirloom' : ''}`}
      style={
        primary
          ? {
              border: '1px solid rgba(255,255,255,0.3)',
              color: '#1a1a1a',
            }
          : {
              background: accentBg,
              border: `1px solid ${accentBorder}`,
            }
      }
    >
      <div>
        <div className="flex items-center gap-2">
          <span className={primary ? 'text-base font-bold' : 'text-base font-bold text-mj-bone'}>
            {title}
          </span>
          {badge && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{
                background: primary ? 'rgba(0,0,0,0.15)' : `${accentBorder}33`,
                color: primary ? '#1a1a1a' : accent,
              }}
            >
              {badge}
            </span>
          )}
        </div>
        <div
          className="text-sm font-normal mt-0.5"
          style={{ color: primary ? 'rgba(26,26,26,0.7)' : 'rgba(var(--felt-ink-rgb),0.5)' }}
        >
          {subtitle}
        </div>
      </div>
      <span
        className="text-2xl ml-4 flex-shrink-0"
        aria-hidden="true"
        style={{ color: primary ? '#1a1a1a' : accent }}
      >
        →
      </span>
    </button>
  );
}

// Mode color palettes — constants avoid i18next/no-literal-string on JSX prop values
const FRIENDS_ACCENT = '#c9a961' as const;
const FRIENDS_BG = 'rgba(201,169,97,0.08)' as const;
const FRIENDS_BORDER = 'rgba(201,169,97,0.3)' as const;
const SOLO_ACCENT = '#7ab5cc' as const;
const SOLO_BG = 'rgba(90,125,140,0.08)' as const;
const SOLO_BORDER = 'rgba(90,125,140,0.3)' as const;
const CHALLENGE_ACCENT = 'rgba(190,150,240,0.95)' as const;
const CHALLENGE_BG = 'rgba(90,60,120,0.08)' as const;
const CHALLENGE_BORDER = 'rgba(150,100,200,0.3)' as const;

export function PlayPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <ScreenShell title={t('playNanchang')} onBack={() => navigate('/home')}>
      <div className="px-5 py-6 flex flex-col gap-4">
        <PlayModeCard
          title={t('playModeWithFriends')}
          subtitle={t('playModeWithFriendsSub')}
          accent={FRIENDS_ACCENT}
          accentBg={FRIENDS_BG}
          accentBorder={FRIENDS_BORDER}
          onClick={() => navigate('/lobby')}
          primary
        />

        <PlayModeCard
          title={t('playModeSolo')}
          subtitle={t('playModeSoloSub')}
          accent={SOLO_ACCENT}
          accentBg={SOLO_BG}
          accentBorder={SOLO_BORDER}
          onClick={() => navigate('/play/solo')}
        />

        <PlayModeCard
          title={t('playModeChallenges')}
          subtitle={t('playModeChallengesSub')}
          accent={CHALLENGE_ACCENT}
          accentBg={CHALLENGE_BG}
          accentBorder={CHALLENGE_BORDER}
          onClick={() => navigate('/play/challenges')}
        />
      </div>
    </ScreenShell>
  );
}
