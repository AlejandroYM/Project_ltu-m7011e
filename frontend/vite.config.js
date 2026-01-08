import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/users': 'http://localhost:3001',
      '/api/recipes': 'http://localhost:3002',
      '/api/recommendations': 'http://localhost:3003',
    }
  }
})