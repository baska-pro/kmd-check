import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { toast } from 'sonner';

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
