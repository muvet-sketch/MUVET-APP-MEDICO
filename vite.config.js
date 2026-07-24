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
    //
    // SUPUESTO: la tarea de empaquetado TWA pide un /public/manifest.json
    // estático. Este repo ya tenía el manifest declarado aquí (fuente única
    // de verdad) y vite-plugin-pwa lo genera + inyecta como
    // /manifest.webmanifest en cada build (ver dist/index.html). Mantener
    // esa arquitectura en vez de duplicar un manifest.json estático en
    // /public: un archivo estático quedaría sin usar (index.html no lo
    // referencia) o, si se referenciara a mano, generaría dos manifests
    // desincronizados. Bubblewrap lee el manifest sirviéndolo por URL
    // (https://.../manifest.webmanifest), no por nombre de archivo, así que
    // esto no bloquea el empaquetado.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg'],
      manifest: {
        name: 'MUVET App Médico',
        short_name: 'MUVET',
        description: 'App de trabajo del médico veterinario en campo — MUVET.',
        theme_color: '#0A1628',
        background_color: '#FFFFFF',
        display: 'standalone',
        start_url: '/',
        icons: [
          // TODO: reemplazar con ícono definitivo EMK (placeholders con
          // wordmark tipográfico "MUVET", conforme a D-014 — sin logo
          // gráfico hasta registro de marca).
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // D-negocio implícita del despacho: datos de Supabase siempre
        // frescos, sin cache agresivo. Cache-first solo aplica (por
        // defecto, vía precacheAndRoute) a JS/CSS/fonts/iconos del build.
        // Regla explícita de red-only para cualquier request a la API de
        // Supabase, para que quede documentado y no dependa del
        // comportamiento implícito de "ruta no registrada = pasa a red".
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
})
