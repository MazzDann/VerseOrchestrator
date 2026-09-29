import fs from 'node:fs';
import path from 'node:path';
import type express from 'express';

/**
 * Compressed copies of the built UI (0.12.2). The web build writes `file.br` and `file.gz`
 * next to each file (web/vite.config.ts, `precompress`); this sends the copy the browser takes
 * — brotli first — instead of the full file. Before, every page went out uncompressed: a phone
 * on /follow downloaded the whole script as it is.
 */
const ENCODINGS: [name: string, ext: string][] = [
  ['br', '.br'],
  ['gzip', '.gz'],
];

/** Does an Accept-Encoding header take `name`? A `q=0` refuses it. */
export function accepts(header: string | undefined, name: string): boolean {
  for (const part of (header ?? '').split(',')) {
    const [token, ...params] = part.split(';');
    if (token.trim().toLowerCase() !== name) continue;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    return !q || Number(q.slice(2)) > 0;
  }
  return false;
}

/**
 * Middleware in front of express.static for the built UI: the compressed copy when there is
 * one and the browser takes it, with the same caching as the file itself (`cacheControl`);
 * anything else goes on unchanged.
 */
export function precompressed(
  root: string,
  cacheControl: (file: string) => string,
): express.RequestHandler {
  const base = path.resolve(root);
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let rel: string;
    try {
      rel = decodeURIComponent(req.path);
    } catch {
      return next();
    }
    const file = path.join(base, rel);
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file)) return next();
    for (const [name, ext] of ENCODINGS) {
      if (!fs.existsSync(file + ext)) continue;
      // the answer depends on the header — also when the file goes out as it is
      res.setHeader('Vary', 'Accept-Encoding');
      if (!accepts(req.headers['accept-encoding'], name)) continue;
      res.setHeader('Content-Encoding', name);
      res.setHeader('Cache-Control', cacheControl(file));
      res.type(path.extname(file)); // the file's own type, not the copy's
      res.sendFile(file + ext, { acceptRanges: false, cacheControl: false }, (err) => {
        if (err) next(err);
      });
      return;
    }
    next();
  };
}
