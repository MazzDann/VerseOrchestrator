import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSegments } from './segments.js';

// npm run build:segments [-- libraryPath outDir]
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = process.env.VO_DATA_DIR ?? path.join(root, 'data');
const lib = process.argv[2] ?? process.env.LIBRARY_DB ?? path.join(dataDir, 'library.db');
const out = process.argv[3] ?? path.join(dataDir, 'segments');
const t0 = Date.now();
const m = buildSegments(lib, out);
const mb = (b: number) => (b / 1048576).toFixed(1);
for (const s of m.segments) {
  console.log(
    `[segments] ${s.file.padEnd(16)} ${s.kind.padEnd(11)} ${s.abbr.padEnd(14)} ${mb(s.bytes).padStart(6)} MB gz  (${mb(s.rawBytes)} MB)`,
  );
}
const total = m.segments.reduce((a, s) => a + s.bytes, 0);
const raw = m.segments.reduce((a, s) => a + s.rawBytes, 0);
console.log(
  `[segments] ${m.segments.length} segments, ${mb(total)} MB gz (${mb(raw)} MB raw) -> ${out} in ${((Date.now() - t0) / 1000).toFixed(1)} s`,
);
