import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/facilities': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
      '/county-brief': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/representatives': { target: 'http://127.0.0.1:8003', changeOrigin: true },
      '/generate-letter': { target: 'http://127.0.0.1:8003', changeOrigin: true },
    }
  }
})
