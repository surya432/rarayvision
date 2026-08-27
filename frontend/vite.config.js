import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  preview: {
    port: 5001,
    strictPort: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5001,
    allowedHosts: ['localhost', '127.0.0.1']
  }
})
