import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './ui-fixes.css';
import { registerSW } from 'virtual:pwa-register';
import { toast } from 'sonner';
import { useStore } from './lib/store';
import { bootstrapDataSynchronization, sanitizePersistedServerState } from './lib/bootstrapSync';

const updateSW = registerSW({
  onNeedRefresh() {
    toast('Versi baru tersedia', {
      action: {
        label: 'Muat Ulang',
        onClick: () => updateSW(true)
      },
      duration: Infinity
    });
  },
  onOfflineReady() {
    console.log('Aplikasi siap digunakan secara offline');
  },
});

// Prevent yesterday's persisted server state from being re-used as live data,
// but never block the initial React render on a network call.
sanitizePersistedServerState();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root tidak ditemukan.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The store currently shares `isLoading` between background data synchronization
// and authentication. During startup we suppress only background-generated loading
// so the login button never spins before the user actually submits the form.
let bootstrapRunning = true;
let authenticationSubmitted = false;

const markAuthenticationSubmit = (event: Event) => {
  const target = event.target as HTMLFormElement | null;
  if (!target) return;
  const usernameInput = target.querySelector?.('input[name="username"]');
  const passwordInput = target.querySelector?.('input[name="password"]');
  if (usernameInput && passwordInput) authenticationSubmitted = true;
};

document.addEventListener('submit', markAuthenticationSubmit, true);

const unsubscribeBootstrapLoading = useStore.subscribe((state) => {
  if (bootstrapRunning && !authenticationSubmitted && !state.user && state.isLoading) {
    queueMicrotask(() => {
      const current = useStore.getState();
      if (bootstrapRunning && !authenticationSubmitted && !current.user && current.isLoading) {
        useStore.setState({ isLoading: false });
      }
    });
  }
});

// Synchronize with GAS/Spreadsheet after the UI is already visible.
// This avoids a blank screen when GAS is slow, temporarily unreachable, or redirecting.
window.setTimeout(() => {
  bootstrapDataSynchronization(useStore)
    .catch((error) => {
      console.error('[Sync] Bootstrap synchronization failed:', error);
    })
    .finally(() => {
      bootstrapRunning = false;
      unsubscribeBootstrapLoading();
      document.removeEventListener('submit', markAuthenticationSubmit, true);
      // Ensure a completed background bootstrap cannot leave the login UI loading.
      if (!authenticationSubmitted && !useStore.getState().user) {
        useStore.setState({ isLoading: false });
      }
    });
}, 0);
