import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Backend the dev server proxies /api and /ws to. Port 8000 unless overridden, e.g. in the
  // git-ignored .env.development.local: DEV_BACKEND_URL=http://127.0.0.1:7000
  const backend = loadEnv(mode, process.cwd(), '').DEV_BACKEND_URL || 'http://127.0.0.1:8000'
  return {
  plugins: [react(),tailwindcss(),],
  server: {
    // Explicit host - Vite's default "localhost" binding was resolving to
    // the IPv6 loopback only ([::1]) on this machine, so a browser whose
    // resolver tries 127.0.0.1 (IPv4) first - e.g. Chrome via a plain
    // "localhost" URL clicked from an email - got ECONNREFUSED even though
    // the dev server was actually running. Binding to all interfaces makes
    // it reachable via either.
    host: true,
    // Vite rejects requests whose Host header it doesn't recognize (DNS
    // rebinding protection) - which blocks a tunnel domain like
    // *.ngrok-free.dev by default. Dev-only setting; a real production
    // deploy serves a static build instead of this dev server.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: backend,
        changeOrigin: true,
      },
      '/ws': {
        target: backend,
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code !== 'ECONNABORTED' && err.code !== 'ECONNRESET') {
              console.error('ws proxy error:', err);
            }
          });
        },
      },
    },
  },
  }
})
