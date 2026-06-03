/**
 * JingRevealStubPage — Phase 6 placeholder for the Jing reveal screen.
 *
 * In Phase 7 this will be replaced by the real animated reveal that reads
 * jingPrimary / jingSecondary from the GameEngine state snapshot delivered
 * via the game socket.
 *
 * For Phase 6 the checkpoint only needs: clicking "Start" in the room
 * navigates here, and the user can then get back to Home.
 */

import { useNavigate, useParams } from 'react-router-dom';
import { ScreenShell } from '../../components/ui/screen-shell';
import { useI18n } from '../../i18n';

export function JingRevealStubPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { id: _gameId } = useParams<{ id: string }>();

  return (
    <ScreenShell title={t('jingRevealTitle')}>
      <div className="flex flex-col items-center justify-center gap-8 min-h-[60vh] px-8 text-center">
        {/* Spirit tile placeholder */}
        <div
          className="w-20 h-28 rounded-xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(165deg,#fffbeb 0%,#f5efdf 55%,#d8cfb3 100%)',
            border: '2px solid #c9a961',
            boxShadow: '0 0 40px rgba(201,169,97,0.4)',
          }}
          aria-label={t('jingRevealTitle')}
        >
          <span
            className="font-serif font-bold"
            style={{ fontSize: 36, color: '#1f2937' }}
            aria-hidden="true"
          >
            {t('jingSymbol')}
          </span>
        </div>

        <div>
          <p className="text-sm text-mj-bone/60 mb-1">{t('jingRevealSubtitle')}</p>
          <p className="text-lg font-bold text-mj-gold">{t('gameLobbyTitle')}</p>
          <p className="text-xs text-mj-bone/50 mt-1">{t('gameLobbyDesc')}</p>
        </div>

        {/* Phase 7 will auto-transition; for now provide a manual button */}
        <button
          onClick={() => navigate('/home')}
          className="px-8 py-3.5 rounded-full font-bold text-sm text-mj-ink"
          style={{
            background: 'linear-gradient(180deg,#c9a961 0%,#a88a45 100%)',
            boxShadow: '0 6px 18px rgba(201,169,97,0.35)',
          }}
        >
          {t('jingRevealBegin')} →
        </button>

        <p className="text-[11px] text-mj-bone/35">{t('phase7Note')}</p>
      </div>
    </ScreenShell>
  );
}
