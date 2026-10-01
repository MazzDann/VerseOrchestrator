import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import rootPkg from '../package.json' with { type: 'json' };
import { STAMP_FILE, uiStamp } from '../server/src/uiStamp.ts';

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

/**
 * Compressed copies next to the built files (0.12.2): `file.br` and `file.gz`, which the server
 * sends to browsers that take them (server/src/precompressed.ts) — what a phone downloads over
 * Wi-Fi shrinks to about a third. Not the browser engines' .wasm/.data: only the control window
 * loads them, from this computer, where the copies would save nothing and add 10 MB to the
 * portable copy.
 */
function precompress(): Plugin {
  const COMPRESSIBLE = /\.(js|css|html|json|svg|txt|ico)$/;
  let outDir = '';
  return {
    name: 'vo-precompress',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const files = (await fs.readdir(outDir, { recursive: true }))
        .map((f) => path.join(outDir, f))
        .filter((f) => COMPRESSIBLE.test(f));
      await Promise.all(
        files.map(async (file) => {
          const data = await fs.readFile(file);
          if (data.length < 1024) return; // a request's headers weigh more than the saving
          const [br, gz] = await Promise.all([
            brotli(data, {
              params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
                [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length,
              },
            }),
            gzip(data, { level: 9 }),
          ]);
          await Promise.all([fs.writeFile(`${file}.br`, br), fs.writeFile(`${file}.gz`, gz)]);
        }),
      );
    },
  };
}

/**
 * Every build says what it was built from (1.4.1): `dist/.vo-version`, the stamp the launcher and
 * the waiter compare with the code before they serve a build (server/src/uiStamp.ts). Before, only
 * the launcher's own build wrote it, and a plain `npm run build --workspace @vo/web` — a step of
 * the check list — left a build that a clone then served after every pull. The stamp is taken
 * from the sources as the build starts to read them, and written once everything is written.
 */
export function stamp(): Plugin {
  let root = '';
  let outDir = '';
  let value = '';
  let written = false;
  return {
    name: 'vo-stamp',
    apply: 'build',
    configResolved(config) {
      root = path.resolve(config.root, '..');
      outDir = path.resolve(config.root, config.build.outDir);
    },
    buildStart() {
      value = uiStamp(root);
      written = false;
    },
    writeBundle() {
      written = true;
    },
    // after the compressed copies (a failed or cut-off build keeps no stamp: it gets rebuilt)
    closeBundle: {
      order: 'post',
      sequential: true,
      async handler() {
        if (written) await fs.writeFile(path.join(outDir, STAMP_FILE), value);
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), precompress(), stamp()],
  // The browser DB engine runs in a module worker (lib/engine/worker.ts).
  worker: { format: 'es' },
  // One version for the whole app (root package.json), shown in the settings panel.
  define: { __APP_VERSION__: JSON.stringify(rootPkg.version) },
  // Ensure single instances across all pre-bundled deps. Duplicated @mantine
  // packages break shared stores (a store created in one copy would not match the
  // component reading it from another).
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
