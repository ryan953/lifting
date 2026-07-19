import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['catalog/catalog.json'],
      manifest: {
        name: 'Lifting',
        short_name: 'Lifting',
        description: 'Weight-lifting progression tracker',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}', 'catalog/catalog.json'],
        // Never serve the SPA shell for Firebase's reserved paths — the auth
        // popup/redirect handler lives at /__/auth/* on this origin.
        navigateFallbackDenylist: [/^\/__\//],
        runtimeCaching: [
          {
            // Exercise demo images: cache-first, they never change for a given path.
            urlPattern: /\/catalog\/images\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'catalog-images',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Firebase owns its own offline story; never SW-cache its RPCs.
            urlPattern: /^https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
