import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = '/next-up/'

// https://vite.dev/config/
export default defineConfig({
  base,
  server: {
    allowedHosts: ['node.appaloosa-blues.ts.net']
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'Next Up',
        short_name: 'NextUp',
        description: 'Local-first game rotation board with points and play sessions.',
        theme_color: '#0b0f17',
        background_color: '#0b0f17',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          {
            src: `${base}pwa-192.svg`,
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: `${base}pwa-512.svg`,
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}']
      }
    })
  ],
})
