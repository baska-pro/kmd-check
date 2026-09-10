import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { toast } from 'sonner';
import { useStore } from './lib/store';
import { bootstrapDataSynchronization } from './lib/bootstrapSync';

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

const root = createRoot(document.getElementById('root')!);

const renderApp = () => {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};

bootstrapDataSynchronization(useStore)
  .catch((error) => {
    console.error('[Sync] Bootstrap synchronization failed:', error);
  })
  .finally(renderApp);
