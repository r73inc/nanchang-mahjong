import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useSignout } from '../../hooks/use-auth';
import { ScreenShell } from '../../components/ui/screen-shell';
import { useI18n } from '../../i18n';

export function HomeStubPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const signout = useSignout();

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

        {/* Coming-soon game lobby placeholder */}
        <div
          className="rounded-2xl px-5 py-8 mb-6 text-center"
          style={{
            background: 'rgba(245,239,223,0.04)',
            border: '1px solid rgba(201,169,97,0.12)',
          }}
        >
          <div className="text-4xl mb-3" aria-hidden="true">
            🀄
          </div>
          <p className="text-sm text-mj-bone/55 leading-relaxed">{t('comingSoon')}</p>
        </div>

        {/* Settings actions */}
        <div className="space-y-2 mb-6">
          <button
            onClick={() => navigate('/settings/change-password')}
            className="w-full flex items-center justify-between px-4 py-3.5 rounded-[14px] text-sm text-mj-bone"
            style={{
              background: 'rgba(245,239,223,0.06)',
              border: '1px solid rgba(245,239,223,0.08)',
            }}
          >
            <span>{t('changePasswordLink')}</span>
            <span className="text-mj-bone/35" aria-hidden="true">
              ›
            </span>
          </button>

          <button
            onClick={() => navigate('/settings/delete-account')}
            className="w-full flex items-center justify-between px-4 py-3.5 rounded-[14px] text-sm text-mj-loss-light"
            style={{
              background: 'rgba(245,239,223,0.06)',
              border: '1px solid rgba(245,239,223,0.08)',
            }}
          >
            <span>{t('deleteAccountLink')}</span>
            <span className="text-mj-loss-light/40" aria-hidden="true">
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
