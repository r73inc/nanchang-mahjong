const GLYPH = 'ⓘ' as const;

interface InfoIconButtonProps {
  onClick: () => void;
  ariaLabel: string;
  /** Diameter in px. Defaults to 14. */
  size?: number;
  borderColor?: string;
  color?: string;
}

/**
 * Tiny circular info-glyph button used beside setting labels and section headers.
 * Centralises the repeated inline-style block so callers stay clean.
 */
export function InfoIconButton({
  onClick,
  ariaLabel,
  size = 14,
  borderColor = 'rgba(var(--felt-ink-rgb),0.25)',
  color = 'rgba(var(--felt-ink-rgb),0.35)',
}: InfoIconButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className="inline-flex items-center justify-center shrink-0 rounded-full text-[9px] font-bold leading-none bg-transparent cursor-pointer"
      style={{
        width: size,
        height: size,
        border: `1px solid ${borderColor}`,
        color,
      }}
    >
      {GLYPH}
    </button>
  );
}
