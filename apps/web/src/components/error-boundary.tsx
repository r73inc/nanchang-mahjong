/**
 * AppErrorBoundary — React class error boundary that catches render crashes.
 *
 * Without this, any unhandled render exception causes the entire React tree to
 * unmount. Since `body { background: #0a0a0a }` (near-black), unmounting the
 * tree looks like a solid black screen — giving users no feedback and no way
 * out. This boundary converts those crashes into a visible error screen with:
 *   - The error message (so we can diagnose the root cause)
 *   - A stack trace (visible in dev; hidden in prod)
 *   - A "Back to Lobby" / "Reload" button
 *
 * Usage:
 *   <AppErrorBoundary>
 *     <YourComponent />
 *   </AppErrorBoundary>
 *
 * The `context` prop is an optional label (e.g. "GamePage") shown in the
 * error header so you know which boundary caught the crash.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

// Module-level string constants avoid i18next/no-literal-string on JSX text nodes.
// The error boundary is intentionally untranslated — it must render even if i18n
// fails, and its audience is developers reading crash reports, not end users.
const MSG_REACT_ERROR = 'React Error' as const;
const MSG_SOMETHING_WRONG = 'Something went wrong' as const;
const MSG_COMPONENT_CRASHED =
  'A component crashed. The error below can help diagnose the issue.' as const;
const MSG_BACK_TO_LOBBY = 'Back to Lobby' as const;
const MSG_RELOAD = 'Reload Page' as const;

interface Props {
  children: ReactNode;
  /** Short label shown in the error card — e.g. "GamePage", "App". */
  context?: string;
  /** Optional fallback rendered instead of the default error card. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ errorInfo: info });
    // Always log to console — visible in DevTools even when the UI is blank.
    console.error(
      `[AppErrorBoundary${this.props.context ? ` / ${this.props.context}` : ''}] Unhandled render error:`,
      error,
      info.componentStack,
    );
  }

  reset = () => {
    this.setState({ error: null, errorInfo: null });
  };

  override render() {
    const { error, errorInfo } = this.state;
    const { children, fallback, context } = this.props;

    if (error) {
      if (fallback) return fallback(error, this.reset);

      const isDev = import.meta.env.DEV;

      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: '#0a0a0a',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            fontFamily: 'system-ui, sans-serif',
            color: '#f5efdf',
            overflowY: 'auto',
          }}
        >
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 24, maxWidth: 480 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#c9a961',
                marginBottom: 8,
              }}
            >
              {context ? `${context} — ` : ''}
              {MSG_REACT_ERROR}
            </p>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              {MSG_SOMETHING_WRONG}
            </h1>
            <p style={{ fontSize: 13, color: 'rgba(245,239,223,0.5)', lineHeight: 1.5 }}>
              {MSG_COMPONENT_CRASHED}
            </p>
          </div>

          {/* Error message card */}
          <div
            style={{
              width: '100%',
              maxWidth: 560,
              background: 'rgba(245,239,223,0.04)',
              border: '1px solid rgba(201,169,97,0.3)',
              borderRadius: 10,
              padding: '14px 16px',
              marginBottom: 20,
            }}
          >
            <p
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#e88080',
                marginBottom: isDev && errorInfo ? 10 : 0,
                wordBreak: 'break-word',
                fontFamily: 'monospace',
              }}
            >
              {error.name}: {error.message}
            </p>

            {/* Stack trace — dev only */}
            {isDev && errorInfo && (
              <pre
                style={{
                  fontSize: 10,
                  color: 'rgba(245,239,223,0.35)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  margin: 0,
                  maxHeight: 200,
                  overflowY: 'auto',
                  lineHeight: 1.5,
                }}
              >
                {errorInfo.componentStack}
              </pre>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => {
                window.location.href = '/lobby';
              }}
              style={{
                padding: '12px 24px',
                borderRadius: 999,
                fontWeight: 700,
                fontSize: 13,
                color: '#0a0a0a',
                background: 'linear-gradient(180deg,#c9a961 0%,#a88a45 100%)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {MSG_BACK_TO_LOBBY}
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 24px',
                borderRadius: 999,
                fontWeight: 700,
                fontSize: 13,
                color: 'rgba(245,239,223,0.7)',
                background: 'transparent',
                border: '1px solid rgba(245,239,223,0.2)',
                cursor: 'pointer',
              }}
            >
              {MSG_RELOAD}
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}
