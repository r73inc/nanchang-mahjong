import { useEffect, useState } from 'react';
import { useSound } from '../../hooks/use-sound';
import { useI18n } from '../../i18n';

interface GameWinnerPopupProps {
  winnerName: string;
  isViewer: boolean;
  duration?: number; // ms before auto-close
  onClose: () => void;
}

export function GameWinnerPopup({
  winnerName,
  isViewer,
  duration = 3000,
  onClose,
}: GameWinnerPopupProps) {
  const { t } = useI18n();
  const { playChime } = useSound();
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    playChime();
  }, [playChime]);

  useEffect(() => {
    if (!isVisible) {
      onClose();
      return;
    }

    const timer = setTimeout(() => {
      setIsVisible(false);
    }, duration);

    return () => clearTimeout(timer);
  }, [isVisible, duration, onClose]);

  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 bg-black/40"
      onClick={() => setIsVisible(false)}
    >
      <div className="text-center px-8" onClick={(e) => e.stopPropagation()}>
        <h1
          className="text-5xl md:text-6xl font-serif font-bold mb-4 leading-tight animate-winner-pop"
          style={{
            color: isViewer ? '#7fc299' : '#c9a961',
            textShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          {isViewer ? t('gameWinnerPopupYou') : t('gameWinnerPopupOther', winnerName)}
        </h1>
        <p
          className="text-sm text-mj-bone/70 animate-winner-fade-in"
          style={{ animationDelay: '0.3s', opacity: 0 }}
        >
          {t('gameWinnerPopupWaiting')}
        </p>
      </div>
    </div>
  );
}
