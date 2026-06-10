import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useSignout } from '../../hooks/use-auth';
import { ScreenShell } from '../../components/ui/screen-shell';
import { useI18n } from '../../i18n';
import type { StringKey } from '../../i18n/strings';
import { usePushNotifications } from '../../hooks/use-push-notifications';

// Defined outside JSX so the no-literal-string rule doesn't flag path strings.
const NAV_ITEMS: Array<{ key: StringKey; path: string; icon: string }> = [
  { key: 'profileLink', path: '/profile', icon: '👤' },
  { key: 'friendsLink', path: '/friends', icon: '👥' },
  { key: 'learnLink', path: '/learn', icon: '📖' },
  { key: 'customizeLink', path: '/customize', icon: '🎨' },
];

export function HomeStubPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const signout = useSignout();
  const { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe } =
    usePushNotifications();

  return (
    <ScreenShell title={t('homeTitle')}>
      <div className="px-5 py-6">
        {/* Welcome banner */}
        <div className="mb-8">
          <p className="text-sm text-mj-bone/60 mb-0.5">{t('welcomeBack')}</p>
          <h2 className="text-2xl font-bold text-mj-bone">{user?.displayName ?? '—'}</h2>
          <p className="text-sm text-mj-bone/50 mt-0.5">@{user?.handle}</p>
          {user?.role === 'admin' && (
            <span
              className="inline-block mt-2 px-2.5 py-0.5 rounded-md text-[11px] font-bold
                         bg-mj-gold/15 text-mj-gold border border-mj-gold/30"
            >
              {t('adminBadge')}
            </span>
          )}
        </div>

        {/* Play with Friends — now live (Phase 6) */}
        <button
          onClick={() => navigate('/lobby')}
          className="w-full mb-6 px-5 py-5 rounded-2xl font-bold text-lg text-mj-ink flex items-center justify-between"
          style={{
            background: 'linear-gradient(180deg,#c9a961 0%,#a88a45 100%)',
            border: '1px solid rgba(255,255,255,0.3)',
            boxShadow: '0 8px 24px rgba(201,169,97,0.35)',
          }}
        >
          <div className="text-left">
            <div>{t('playFriends')}</div>
            <div className="text-sm opacity-70 font-normal mt-0.5">{t('playFriendsSub')}</div>
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
            background: 'rgba(245,239,223,0.05)',
            border: '1px solid rgba(245,239,223,0.1)',
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
        <div className="grid grid-cols-4 gap-2 mb-4">
          {NAV_ITEMS.map(({ key, path, icon }) => (
            <button
              key={key}
              onClick={() => navigate(path)}
              className="flex flex-col items-center gap-1.5 py-4 rounded-[14px] text-sm text-mj-bone/80"
              style={{
                background: 'rgba(245,239,223,0.06)',
                border: '1px solid rgba(245,239,223,0.09)',
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
          {/* Push notification toggle — only shown when browser supports it */}
          {isSupported && (
            <div
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-[14px]"
              style={{
                background: 'rgba(245,239,223,0.06)',
                border: '1px solid rgba(245,239,223,0.08)',
              }}
            >
              <div className="flex-1 min-w-0 mr-3">
                <p className="text-sm text-mj-bone">{t('pushNotifications')}</p>
                {permission === 'denied' ? (
                  <p className="text-[11px] text-mj-loss-light/80 mt-0.5">{t('pushDenied')}</p>
                ) : (
                  <p className="text-[11px] text-mj-bone/40 mt-0.5">{t('pushNotificationsDesc')}</p>
                )}
              </div>
              {permission === 'denied' ? (
                <span className="text-[11px] text-mj-bone/30 shrink-0">{t('pushDenied')}</span>
              ) : (
                <button
                  onClick={() => void (isSubscribed ? unsubscribe() : subscribe())}
                  disabled={isLoading}
                  aria-pressed={isSubscribed}
                  className="relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50"
                  style={{
                    background: isSubscribed ? '#c9a961' : 'rgba(245,239,223,0.15)',
                    border: isSubscribed ? 'none' : '1px solid rgba(245,239,223,0.2)',
                  }}
                >
                  <span
                    className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                    style={{
                      transform: isSubscribed ? 'translateX(20px)' : 'translateX(0)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }}
                  />
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => navigate('/account')}
            className="w-full flex items-center justify-between px-4 py-3.5 rounded-[14px] text-sm text-mj-bone"
            style={{
              background: 'rgba(245,239,223,0.06)',
              border: '1px solid rgba(245,239,223,0.08)',
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
