import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accepts, precompressed } from './precompressed';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-precompressed-'));
const script = 'console.log("VerseOrchestrator");\n'.repeat(200);
let server: http.Server;
let base = '';

/** A raw GET — no automatic decoding, so the headers and bytes are what went out. */
function get(p: string, acceptEncoding?: string) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>(
    (resolve, reject) => {
      const req = http.get(
        `${base}${p}`,
        { headers: acceptEncoding === undefined ? {} : { 'accept-encoding': acceptEncoding } },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: Buffer.concat(chunks),
            }),
          );
        },
      );
      req.on('error', reject);
    },
  );
}

beforeAll(async () => {
  fs.mkdirSync(path.join(dir, 'assets'));
  const js = path.join(dir, 'assets', 'app.js');
  fs.writeFileSync(js, script);
  fs.writeFileSync(`${js}.br`, zlib.brotliCompressSync(script));
  fs.writeFileSync(`${js}.gz`, zlib.gzipSync(script));
  fs.writeFileSync(path.join(dir, 'assets', 'plain.css'), 'body{}');
  const app = express();
  app.use(precompressed(dir, () => 'public, max-age=31536000, immutable'));
  app.use(express.static(dir));
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('compressed copies of the built UI (0.12.2)', () => {
  it('reads Accept-Encoding the way browsers write it', () => {
    expect(accepts('gzip, deflate, br, zstd', 'br')).toBe(true);
    expect(accepts('gzip, deflate', 'br')).toBe(false);
    expect(accepts('gzip;q=0, br', 'gzip')).toBe(false);
    expect(accepts('GZIP;q=0.5', 'gzip')).toBe(true);
    expect(accepts(undefined, 'gzip')).toBe(false);
  });

  it('sends brotli first, then gzip, with the file’s own type and caching', async () => {
    const br = await get('/assets/app.js', 'gzip, deflate, br, zstd');
    expect(br.headers['content-encoding']).toBe('br');
    expect(br.headers['content-type']).toMatch(/javascript/);
    expect(br.headers['vary']).toBe('Accept-Encoding');
    expect(br.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(zlib.brotliDecompressSync(br.body).toString()).toBe(script);
    expect(br.body.length).toBeLessThan(script.length / 10);

    const gz = await get('/assets/app.js', 'gzip, deflate');
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(zlib.gunzipSync(gz.body).toString()).toBe(script);
  });

  it('leaves the rest to the static files as they are', async () => {
    const identity = await get('/assets/app.js', 'identity');
    expect(identity.headers['content-encoding']).toBeUndefined();
    expect(identity.headers['vary']).toBe('Accept-Encoding');
    expect(identity.body.toString()).toBe(script);
    const noCopy = await get('/assets/plain.css', 'gzip, br');
    expect(noCopy.headers['content-encoding']).toBeUndefined();
    expect(noCopy.headers['vary']).toBeUndefined();
    expect(noCopy.body.toString()).toBe('body{}');
    expect((await get('/assets/missing.js', 'br')).status).toBe(404);
    expect((await get('/assets/..%2F..%2Fetc%2Fpasswd', 'br')).status).toBe(404);
  });
});
