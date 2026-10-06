import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787'
    }
  }
})
