import { useNavigate } from 'react-router-dom';
import { ScreenShell } from '../../components/ui/screen-shell';
import { useI18n } from '../../i18n';
import type { StringKey } from '../../i18n/strings';

const ACCOUNT_ITEMS: Array<{ key: StringKey; path: string; danger?: boolean }> = [
  { key: 'profileLink', path: '/profile' },
  { key: 'changePasswordLink', path: '/settings/change-password' },
  { key: 'deleteAccountLink', path: '/settings/delete-account', danger: true },
];

export function AccountPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <ScreenShell title={t('accountLink')} onBack={() => navigate('/home')}>
      <div className="px-5 py-6">
        <div className="space-y-2">
          {ACCOUNT_ITEMS.map(({ key, path, danger }) => (
            <button
              key={key}
              onClick={() => navigate(path)}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-[14px] text-sm ${
                danger ? 'text-mj-loss-light' : 'text-mj-bone'
              }`}
              style={{
                background: 'rgba(245,239,223,0.06)',
                border: '1px solid rgba(245,239,223,0.08)',
              }}
            >
              <span>{t(key)}</span>
              <span
                className={danger ? 'text-mj-loss-light/40' : 'text-mj-bone/35'}
                aria-hidden="true"
              >
                ›
              </span>
            </button>
          ))}
        </div>
      </div>
    </ScreenShell>
  );
}
