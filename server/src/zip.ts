import fsp from 'node:fs/promises';
import { promisify } from 'node:util';
import zlib from 'node:zlib';

/**
 * A small zip writer and reader (1.5.0, the backup): Node's own deflate and CRC-32, no package.
 * A backup is a .zip so that Explorer, Finder or any archiver opens it to look inside. Enough of
 * the format for that: deflate or stored entries, UTF-8 names, under 4 GB (no zip64), no
 * encryption, no spanning. Deflate and inflate run on the thread pool (async): a backup of
 * pictures takes seconds of CPU, and the hub — phones, remotes, the output windows' commands —
 * must not stop meanwhile (review of #47).
 */

export interface ZipEntry {
  name: string;
  data: Buffer;
}

const deflateRaw = promisify(zlib.deflateRaw);
/** a turn of the event loop between entries: the hub's frames get through (review of #47) */
const breathe = () => new Promise<void>((r) => setImmediate(r));
const inflateRaw = promisify(zlib.inflateRaw);

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
/** general purpose flag: the name is UTF-8 */
const UTF8 = 0x0800;

/** MS-DOS time and date of `d` (local time, two-second steps) — what zip stores. */
function dosTime(d: Date): [number, number] {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date =
    ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [time, date];
}

/**
 * One entry packed: its local header, name and body (what goes at `offset`) and its central
 * directory record. Deflated unless `store` says it is compressed already or deflating makes it
 * larger.
 */
async function packEntry(
  entryName: string,
  data: Buffer,
  storeIt: boolean,
  [time, date]: [number, number],
  offset: number,
): Promise<{ local: Buffer[]; central: Buffer[]; bytes: number }> {
  const name = Buffer.from(entryName, 'utf8');
  const deflated = storeIt ? null : await deflateRaw(data, { level: 6 });
  if (!deflated) await breathe();
  const store = !deflated || deflated.length >= data.length;
  const body = store ? data : deflated;
  const crc = zlib.crc32(data);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(LOCAL, 0);
  head.writeUInt16LE(20, 4); // version needed: 2.0
  head.writeUInt16LE(UTF8, 6);
  head.writeUInt16LE(store ? 0 : 8, 8);
  head.writeUInt16LE(time, 10);
  head.writeUInt16LE(date, 12);
  head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(body.length, 18);
  head.writeUInt32LE(data.length, 22);
  head.writeUInt16LE(name.length, 26);
  head.writeUInt16LE(0, 28);
  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(CENTRAL, 0);
  dir.writeUInt16LE(20, 4); // made by: 2.0
  dir.writeUInt16LE(20, 6);
  dir.writeUInt16LE(UTF8, 8);
  dir.writeUInt16LE(store ? 0 : 8, 10);
  dir.writeUInt16LE(time, 12);
  dir.writeUInt16LE(date, 14);
  dir.writeUInt32LE(crc, 16);
  dir.writeUInt32LE(body.length, 20);
  dir.writeUInt32LE(data.length, 24);
  dir.writeUInt16LE(name.length, 28);
  dir.writeUInt32LE(offset, 42);
  return {
    local: [head, name, body],
    central: [dir, name],
    bytes: head.length + name.length + body.length,
  };
}

/** The end of central directory record. */
function endRecord(count: number, dirBytes: number, offset: number): Buffer {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END, 0);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(dirBytes, 12);
  end.writeUInt32LE(offset, 16);
  return end;
}

/**
 * A .zip of `entries`: each deflated unless `stored(name)` says it is compressed already (a
 * JPEG, a PNG: deflating them costs CPU and saves nothing) or deflating makes it larger.
 */
export async function zip(
  entries: ZipEntry[],
  when = new Date(),
  stored: (name: string) => boolean = () => false,
): Promise<Buffer> {
  const at = dosTime(when);
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const p = await packEntry(e.name, e.data, stored(e.name), at, offset);
    parts.push(...p.local);
    central.push(...p.central);
    offset += p.bytes;
  }
  const dirBytes = central.reduce((n, b) => n + b.length, 0);
  return Buffer.concat([...parts, ...central, endRecord(entries.length, dirBytes, offset)]);
}

/**
 * A .zip written to `file` one entry at a time (1.12.0-beta.3, the automatic backups): an entry
 * given by its `file` is read only when its turn comes, so memory holds one picture, never the
 * whole backup — it runs in the server, next to the hub, every day. Written to a temp file and
 * renamed: never half a backup under its name. Returns the size written.
 */
export async function zipToFile(
  file: string,
  entries: { name: string; data?: Buffer; file?: string }[],
  when = new Date(),
  stored: (name: string) => boolean = () => false,
): Promise<number> {
  const at = dosTime(when);
  const tmp = `${file}.${process.pid}.tmp`;
  const out = await fsp.open(tmp, 'w');
  const central: Buffer[] = [];
  let offset = 0;
  try {
    for (const e of entries) {
      const data = e.data ?? (e.file ? await fsp.readFile(e.file) : Buffer.alloc(0));
      const p = await packEntry(e.name, data, stored(e.name), at, offset);
      for (const b of p.local) await out.write(b);
      central.push(...p.central);
      offset += p.bytes;
    }
    const dirBytes = central.reduce((n, b) => n + b.length, 0);
    for (const b of [...central, endRecord(entries.length, dirBytes, offset)]) await out.write(b);
    await out.close();
    await fsp.rename(tmp, file);
    return offset + dirBytes + 22;
  } catch (e) {
    await out.close().catch(() => undefined);
    await fsp.rm(tmp, { force: true });
    throw e;
  }
}

/** Why a file isn't a zip this reader takes. */
export class ZipError extends Error {}

/**
 * The entries of a .zip (directories left out). Refuses what it can't read whole and right:
 * a damaged or foreign file, a method other than store / deflate, a wrong CRC, or more than
 * `maxBytes` unpacked (a zip bomb). Sizes come from the central directory, so a zip whose
 * local headers leave them to a data descriptor (bit 3 — Explorer, Archive Utility) reads too.
 */
export async function unzip(buf: Buffer, maxBytes = 2 * 1024 ** 3): Promise<ZipEntry[]> {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === END) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipError('not a zip');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out: ZipEntry[] = [];
  let total = 0;
  for (let k = 0; k < count; k++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL) throw new ZipError('damaged');
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const packed = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== LOCAL) throw new ZipError('damaged');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const body = buf.subarray(start, start + packed);
    if (body.length !== packed) throw new ZipError('damaged');
    total += size;
    if (total > maxBytes) throw new ZipError('too big');
    await breathe();
    let data: Buffer;
    try {
      if (method === 0) data = Buffer.from(body);
      else if (method === 8) data = await inflateRaw(body, { maxOutputLength: size + 1 });
      else throw new ZipError('method');
    } catch (e) {
      throw e instanceof ZipError ? e : new ZipError('damaged');
    }
    if (data.length !== size || zlib.crc32(data) !== crc) throw new ZipError('damaged');
    out.push({ name, data });
  }
  return out;
}
