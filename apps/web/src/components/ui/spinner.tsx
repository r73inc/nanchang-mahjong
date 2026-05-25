interface SpinnerProps {
  size?: number;
  className?: string;
}

export function Spinner({ size = 16, className = '' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={className}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        border: '2px solid rgba(31,41,55,0.25)',
        borderTopColor: '#1f2937',
        animation: 'spin 0.9s linear infinite',
      }}
    />
  );
}
