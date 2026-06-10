import { useEffect, useState } from 'react';
import { useSound } from '../../hooks/use-sound';

/**
 * Full-screen result announcement — shown for a few seconds when a hand or the
 * session ends, BEFORE any reveal/score screens (BUG-025). Auto-dismisses after
 * `duration` ms; tapping anywhere skips it immediately.
 *
 * The backdrop is near-opaque because the screens underneath unmount while the
 * announcement is up — there is no game table to peek through.
 */
interface GameWinnerPopupProps {
  /** Big serif headline, e.g. "Mom Wins!" or "Draw — No Winner". */
  title: string;
  /** Optional smaller line under the title, e.g. the last hand's result. */
  subtitle?: string;
  /** Green headline when the viewer is the winner; gold otherwise. */
  isViewer?: boolean;
  duration?: number; // ms before auto-close
  onClose: () => void;
}

export function GameWinnerPopup({
  title,
  subtitle,
  isViewer = false,
  duration = 2800,
  onClose,
}: GameWinnerPopupProps) {
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
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(8,8,8,0.94)', backdropFilter: 'blur(10px)' }}
      onClick={() => setIsVisible(false)}
    >
      <div className="text-center px-8">
        <h1
          className="text-5xl md:text-6xl font-serif font-bold mb-4 leading-tight animate-winner-pop"
          style={{
            color: isViewer ? '#7fc299' : '#c9a961',
            textShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className="text-sm text-mj-bone/70 animate-winner-fade-in"
            style={{ animationDelay: '0.3s', opacity: 0 }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
