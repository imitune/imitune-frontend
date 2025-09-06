import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Set base if deploying under a repo subpath
  // base: '/<REPO_NAME>/',
  plugins: [react(), tailwindcss()],
})
