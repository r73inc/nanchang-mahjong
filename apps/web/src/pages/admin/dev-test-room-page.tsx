import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { ScreenShell } from '../../components/ui/screen-shell';
import { DevTestRoomSection } from './dev-test-room-section';

export function DevTestRoomPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <ScreenShell title={t('adminDevTest')} onBack={() => navigate('/home')}>
      <DevTestRoomSection />
    </ScreenShell>
  );
}
