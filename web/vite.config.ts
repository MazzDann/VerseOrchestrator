import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import rootPkg from '../package.json' with { type: 'json' };

export default defineConfig({
  plugins: [react()],
  // The browser DB engine runs in a module worker (lib/engine/worker.ts).
  worker: { format: 'es' },
  // One version for the whole app (root package.json), shown in the settings panel.
  define: { __APP_VERSION__: JSON.stringify(rootPkg.version) },
  // Ensure single instances across all pre-bundled deps. Duplicated @mantine
  // packages break shared stores (e.g. the Spotlight store created by
  // createSpotlight would not match the <Spotlight> component's instance).
  resolve: {
    dedupe: ['react', 'react-dom', '@mantine/core', '@mantine/hooks', '@mantine/store'],
  },
  optimizeDeps: {
    // The official SQLite WASM build and PGlite load their .wasm (and PGlite its data
    // bundle) relative to their own module files — pre-bundling would move the JS away.
    exclude: ['@sqlite.org/sqlite-wasm', '@electric-sql/pglite'],
    include: [
      'react',
      'react-dom',
      '@mantine/core',
      '@mantine/hooks',
      '@mantine/store',
      '@mantine/notifications',
      'framer-motion',
    ],
  },
  server: {
    port: 5173,
    // Bind to all interfaces so phones on the same Wi-Fi can reach the app for
    // audience follow-along (the QR points at the machine's LAN IP).
    host: true,
    proxy: {
      // The API listens on loopback only (127.0.0.1, not `localhost`, which may resolve
      // to ::1). `xfwd` passes the real client IP so the server can keep LAN viewers
      // read-only.
      // `ws: true` also forwards the live hub's WebSocket (/api/ws) to the API process.
      '/api': { target: 'http://127.0.0.1:8787', xfwd: true, ws: true },
    },
  },
});
