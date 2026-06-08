// i18n must be initialized before any component renders.
import './i18n/i18n';

// Register service worker for push notifications (best-effort — safe if unsupported).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('SW registration failed:', err));
  });
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { I18nProvider } from './i18n';
import { AppErrorBoundary } from './components/error-boundary';

// Module-level constant avoids i18next/no-literal-string on the context prop.
const APP_CONTEXT = 'App' as const;
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary context={APP_CONTEXT}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </I18nProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
