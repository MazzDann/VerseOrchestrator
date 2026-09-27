// After `vite build`: turn web/dist into a SERVER-LESS deployment.
//  - copies the library segments (data/segments: manifest + *.vodb.gz) to dist/segments/,
//    where the app looks when /api is absent (api.segments → STATIC_SEGMENTS);
//  - adds 404.html = index.html, the usual SPA fallback so /presenter, /stage … load on
//    static hosts that serve 404.html for unknown paths (e.g. GitHub Pages).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(web, 'dist');
const src = process.env.SEGMENTS_DIR ?? path.join(web, '..', 'data', 'segments');
const out = path.join(dist, 'segments');

if (!fs.existsSync(path.join(src, 'manifest.json'))) {
  console.error(`[static] no segments in ${src} — run: npm run build:segments`);
  process.exit(1);
}
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
let bytes = 0;
for (const f of fs.readdirSync(src)) {
  if (!/\.vodb\.gz$|^manifest\.json$/.test(f)) continue;
  fs.copyFileSync(path.join(src, f), path.join(out, f));
  bytes += fs.statSync(path.join(out, f)).size;
}
fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'));
console.log(`[static] ${(bytes / 1048576).toFixed(0)} MB of segments → ${out}; 404.html added`);
