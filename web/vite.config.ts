import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Set base if deploying under a repo subpath
  base: '/imitune-frontend/',
  plugins: [react(), tailwindcss()],
  server: {
    headers: {
      'Content-Security-Policy': "frame-src 'self' https://freesound.org https://*.freesound.org;",
    },
    proxy: {
      '/api': {
        target: 'https://imitune-backend-bptzlaz7e-chris-projects-3c0d9932.vercel.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
})
