import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { toast } from 'sonner';
import App from './App.tsx';
import './index.css';
import './ui-fixes.css';
import { useStore } from './lib/store';
import {
  bootstrapDataSynchronization,
  sanitizePersistedServerState,
  clearOperationalClientState,
} from './lib/bootstrapSync';

sanitizePersistedServerState();
clearOperationalClientState(useStore);

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
    console.info('[KMD] App shell PWA siap. Data operasional tetap hanya dari GAS/Spreadsheet.');
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root tidak ditemukan.');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

queueMicrotask(() => {
  bootstrapDataSynchronization(useStore).catch((error) => {
    console.error('[KMD Bootstrap]', error);
    useStore.setState({
      isLoading: false,
      isUpdating: false,
      error: error?.message || 'Gagal terhubung ke Spreadsheet.',
    });
  });
});
