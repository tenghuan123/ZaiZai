import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: { rollupOptions: { input: resolve('src/main/index.ts'), external: ['better-sqlite3'] } }
  },
  preload: {
    build: { rollupOptions: { input: resolve('src/preload/index.ts'), output: { format: 'cjs' } } }
  },
  renderer: { plugins: [react()] }
})
