import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
        manifest: {
          name: 'KMD Check - Koperasi Mitra Dhuafa',
          short_name: 'KMD Check',
          description: 'Monitoring Field Officer & System Status',
          theme_color: '#4f46e5',
          background_color: '#0f172a',
          display: 'standalone',
          icons: [
            {
              src: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT25l4XHSuvlhJIchUegRDneslG2PUL77cGiZvfElcYrk3tW1eF_0YVFQzD&s=10',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT25l4XHSuvlhJIchUegRDneslG2PUL77cGiZvfElcYrk3tW1eF_0YVFQzD&s=10',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/script\.google\.com\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'gas-api-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 7 // 1 week
                },
                networkTimeoutSeconds: 10
              }
            }
          ]
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
