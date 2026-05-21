import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/1/auth': 'http://localhost:3000',
      '/mcp': 'http://localhost:3000',
      '/images': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
      '/refinery_out': { target: 'ws://localhost:3000', ws: true },
      '/otelcol_out': { target: 'ws://localhost:3000', ws: true },
      '/otelcol_stdout': { target: 'ws://localhost:3000', ws: true },
      '/refinery_stdout': { target: 'ws://localhost:3000', ws: true },
      '/otelcol_setup': { target: 'ws://localhost:3000', ws: true },
      '/refinery_setup': { target: 'ws://localhost:3000', ws: true },
      '/mcp_activity': { target: 'ws://localhost:3000', ws: true },
      '/ai_assistant': { target: 'ws://localhost:3000', ws: true },
    },
  },
})
