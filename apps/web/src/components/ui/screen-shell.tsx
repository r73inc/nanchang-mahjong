import type { ReactNode } from 'react';
import { LangToggle } from '../../i18n';

interface ScreenShellProps {
  children: ReactNode;
  title?: string;
  onBack?: () => void;
  /** Extra element rendered on the right of the header (next to LangToggle). */
  headerRight?: ReactNode;
}

/**
 * Full-screen mobile shell with a sticky header, matching the Handoff Sheet §05 chrome.
 * On wide viewports it's constrained to `max-w-viewport` and centred.
 */
export function ScreenShell({ children, title, onBack, headerRight }: ScreenShellProps) {
  return (
    <div className="fixed inset-0 flex justify-center bg-mj-jade-deep">
      <div
        className="relative w-full max-w-viewport flex flex-col"
        style={{
          background:
            'linear-gradient(180deg, var(--felt-top, #0d3b2e) 0%, var(--felt-bottom, #051a13) 100%)',
          color: '#f5efdf',
          fontFamily: '-apple-system, system-ui, sans-serif',
        }}
      >
        {/* Sticky header */}
        {title !== undefined && (
          <div
            className="sticky top-0 z-10 flex items-center gap-2 px-4 pb-3"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
              background: 'var(--felt-header, rgba(8,30,23,0.6))',
              backdropFilter: 'blur(12px)',
              borderBottom: '1px solid rgba(201,169,97,0.15)',
            }}
          >
            {onBack && (
              <button
                onClick={onBack}
                aria-label="Go back"
                className="w-8 h-8 rounded-sm flex items-center justify-center text-mj-gold text-xl"
                style={{ background: 'rgba(201,169,97,0.12)', border: 'none' }}
              >
                ←
              </button>
            )}
            <h1 className="flex-1 text-[17px] font-bold text-mj-bone">{title}</h1>
            {headerRight}
            <LangToggle />
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto pb-10">{children}</div>
      </div>
    </div>
  );
}
