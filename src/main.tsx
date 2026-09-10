import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
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

// Synchronize with GAS/Spreadsheet after the UI is already visible.
// This avoids a blank screen when GAS is slow, temporarily unreachable, or redirecting.
window.setTimeout(() => {
  bootstrapDataSynchronization(useStore).catch((error) => {
    console.error('[Sync] Bootstrap synchronization failed:', error);
  });
}, 0);
