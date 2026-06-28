import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@qa': fileURLToPath(new URL('../shared/qa', import.meta.url)),
    },
  },
  server: {
    fs: {
      allow: ['..'],
    },
    proxy: {
      '/api': {
        target: process.env.QA_SERVER_URL ?? 'http://127.0.0.1:4319',
      },
    },
  },
  preview: {
    proxy: {
      '/api': {
        target: process.env.QA_SERVER_URL ?? 'http://127.0.0.1:4319',
      },
    },
  },
})
