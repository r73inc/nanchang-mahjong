/**
 * AiSummaryPanel — collapsible AI commentary panel.
 *
 * Collapsed by default. When expanded it shows one of five states:
 *   loading | none | queued | processing | done | failed
 *
 * Consumes the current app language via useI18n() and picks the matching
 * text field (en / zh), falling back to the other language if absent.
 */

import { useState } from 'react';
import { useI18n } from '../i18n';
import type { AiSummaryPublic } from '@nanchang/shared';

// ── Decorative glyphs (module-level — outside JSX to satisfy no-literal-string) ──
const AI_GLYPH = '✦';
const CHEVRON_DOWN = '▾';

interface Props {
  summary: AiSummaryPublic | null | undefined;
  isLoading: boolean;
  isRequesting?: boolean;
  onRequest: () => void;
  /** Optional label that appears above the panel, e.g. participant handle. */
  label?: string;
}

export function AiSummaryPanel({ summary, isLoading, isRequesting, onRequest, label }: Props) {
  const { t, lang } = useI18n();
  const [expanded, setExpanded] = useState(false);

  const summaryText = summary?.text
    ? summary.text[lang as 'en' | 'zh'] || summary.text[lang === 'en' ? 'zh' : 'en']
    : null;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(var(--felt-ink-rgb),0.04)',
        border: '1px solid rgba(201,169,97,0.20)',
      }}
    >
      {/* Header row — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        aria-expanded={expanded}
        aria-label={expanded ? t('aiSummaryCollapse') : t('aiSummaryExpand')}
      >
        <div className="flex items-center gap-2">
          <span className="text-mj-gold text-base leading-none" aria-hidden="true">
            {AI_GLYPH}
          </span>
          <span className="text-xs font-bold text-mj-bone/70 tracking-wider uppercase">
            {label ?? t('aiSummaryTitle')}
          </span>
        </div>
        <span
          className="text-mj-bone/40 text-xs transition-transform duration-150"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          aria-hidden="true"
        >
          {CHEVRON_DOWN}
        </span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4">
          {isLoading && <p className="text-xs text-mj-bone/40 italic">{t('aiSummaryLoading')}</p>}

          {!isLoading && !summary && (
            <button
              onClick={onRequest}
              disabled={isRequesting}
              className="w-full py-2.5 rounded-xl text-xs font-bold"
              style={{
                background: 'rgba(201,169,97,0.12)',
                border: '1px solid rgba(201,169,97,0.35)',
                color: '#c9a961',
              }}
            >
              {isRequesting ? '…' : t('aiSummaryRequest')}
            </button>
          )}

          {!isLoading && summary?.status === 'requested' && (
            <p className="text-xs text-mj-bone/50 italic">{t('aiSummaryPending')}</p>
          )}

          {!isLoading && summary?.status === 'approved' && (
            <p className="text-xs text-mj-bone/50 italic">{t('aiSummaryProcessing')}</p>
          )}

          {!isLoading && summary?.status === 'processing' && (
            <p className="text-xs text-mj-bone/50 italic">{t('aiSummaryProcessing')}</p>
          )}

          {!isLoading && summary?.status === 'done' && summaryText && (
            <p className="text-sm text-mj-bone/80 leading-relaxed">{summaryText}</p>
          )}

          {!isLoading && summary?.status === 'failed' && (
            <p className="text-xs text-red-400/70 italic">{t('aiSummaryFailed')}</p>
          )}
        </div>
      )}
    </div>
  );
}
