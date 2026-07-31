import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Set base for root domain deployment
  base: '/',
  plugins: [react(), tailwindcss()],
  server: {
    headers: {
      'Content-Security-Policy': "frame-src 'self' https://freesound.org https://*.freesound.org;",
    },
    proxy: {
      '/api': {
        target: 'https://api.thatsoundslike.me',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
})
