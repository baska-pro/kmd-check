import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { toast } from 'sonner';
import App from './App.tsx';
import './index.css';
import './ui-fixes.css';
import { useStore } from './lib/store';
import { bootstrapDataSynchronization, sanitizePersistedServerState } from './lib/bootstrapSync';

sanitizePersistedServerState();

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    toast('Versi baru KMD Check tersedia.', {
      action: {
        label: 'Muat Ulang',
        onClick: () => updateSW(true),
      },
      duration: Infinity,
    });
  },
  onOfflineReady() {
    console.info('[KMD] PWA siap digunakan secara offline.');
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root tidak ditemukan.');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// UI is rendered first. Network/bootstrap work can never block first paint.
queueMicrotask(() => {
  bootstrapDataSynchronization(useStore).catch((error) => {
    console.error('[KMD Bootstrap]', error);
    useStore.setState({ isLoading: false, isUpdating: false });
  });
});
