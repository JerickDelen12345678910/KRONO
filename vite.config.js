import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { pwaLite } from './vite.pwa.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pwaLite()],
})