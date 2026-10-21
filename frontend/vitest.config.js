import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Dedicated test config (kept separate from vite.config.js so the app's build
// chunking doesn't affect tests). Vitest runs on the project's own Vite.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Production-like origin so useSeo's dev/localhost noindex guard is off by
    // default (API calls use absolute URLs, so this doesn't affect MSW).
    environmentOptions: { jsdom: { url: 'https://kalamio.com/' } },
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    css: false,
    clearMocks: true,
    // Give api.js a real base URL so it doesn't hit the missing-env guard and
    // so MSW handlers can target a concrete origin.
    env: {
      VITE_SERVER_DOMAIN: 'http://localhost:8080/',
    },
  },
})
