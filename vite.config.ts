import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { fakeCloud } from './tools/fakeCloudPlugin.ts'

// The app is served from https://<user>.github.io/foodwishus/ in production.
export default defineConfig(({ command, mode, isPreview }) => ({
  base: command === 'build' || isPreview ? (process.env.FOODWISHUS_BASE ?? '/foodwishus/') : '/',
  plugins: [react(), tailwindcss(), ...(mode === 'production' ? [] : [fakeCloud()])],
  build: { target: 'es2022', sourcemap: true },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
  },
}))
