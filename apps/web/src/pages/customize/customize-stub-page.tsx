import { useNavigate } from 'react-router-dom';
import { ScreenShell } from '../../components/ui/screen-shell';
import { useI18n } from '../../i18n';

export function CustomizeStubPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <ScreenShell title={t('customize')} onBack={() => navigate('/home')}>
      <div className="px-5 py-6">
        <div
          className="rounded-2xl px-5 py-12 text-center"
          style={{
            background: 'rgba(245,239,223,0.04)',
            border: '1px solid rgba(201,169,97,0.12)',
          }}
        >
          <div className="text-4xl mb-4" aria-hidden="true">
            🎨
          </div>
          <p className="text-sm text-mj-bone/55 leading-relaxed">{t('customizeComingSoon')}</p>
        </div>
      </div>
    </ScreenShell>
  );
}
