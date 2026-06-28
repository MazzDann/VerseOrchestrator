import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Ensure single instances across all pre-bundled deps. Duplicated @mantine
  // packages break shared stores (e.g. the Spotlight store created by
  // createSpotlight would not match the <Spotlight> component's instance).
  resolve: {
    dedupe: ['react', 'react-dom', '@mantine/core', '@mantine/hooks', '@mantine/store'],
  },
  optimizeDeps: {
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
      '/api': 'http://localhost:8787',
    },
  },
});
