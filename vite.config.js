import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Fase 7, Acción 11. Librería nueva autorizada explícitamente por el
    // despacho de Fase 7 (pide PWA instalable) — excepción documentada a la
    // regla de CLAUDE.md de no agregar librerías sin autorización.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg'],
      manifest: {
        name: 'MUVET · App Médico',
        short_name: 'MUVET Médico',
        description: 'App de trabajo del médico veterinario en campo — MUVET.',
        theme_color: '#0A1628',
        background_color: '#FFFFFF',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
