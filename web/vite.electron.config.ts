import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Critical for file:// loading in Electron packaged app
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist-electron',
    emptyOutDir: true,
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
})