// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
//
// Read individual members out of a remote ZIP without ever downloading or
// extracting the whole archive.
//
// IP RAPID ships as ONE 1.33 GB ZIP that expands to 9.51 GB across six CSVs,
// with no per-table resource URL. Extracting it on a CI runner is not viable.
// Instead we read the (Zip64) central directory with HTTP Range requests, then
// range-fetch and raw-inflate only the three members we actually aggregate,
// line by line, in constant memory. The 4.2 GB application_events.csv is never
// touched.
//
// Two things this must never do:
//   * cache member byte offsets — they move on every weekly rebuild upstream;
//   * try to seek into the middle of a member — deflate streams are not
//     seekable, so a member is always inflated from its own data start.

import zlib from 'node:zlib';
import { StringDecoder } from 'node:string_decoder';
import { Readable } from 'node:stream';

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64_LOCATOR = 0x07064b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

async function fetchRetry(url, init, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1) ** 2));
    }
  }
  throw lastErr;
}

async function rangeBuf(url, start, end) {
  const res = await fetchRetry(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (res.status !== 206 && res.status !== 200) throw new Error(`range ${start}-${end}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Read the central directory. Returns { size, entries: [{name, method, compSize, uncompSize, localOffset}] }. */
export async function readCentralDirectory(url) {
  const head = await fetchRetry(url, { method: 'HEAD' });
  if (!head.ok) throw new Error(`HEAD ${url}: HTTP ${head.status}`);
  if ((head.headers.get('accept-ranges') || '').toLowerCase() !== 'bytes') {
    // Not fatal — some CDNs omit the header but still honour Range. The first
    // range request below will fail loudly if it genuinely isn't supported.
    process.stderr.write('warn: server did not advertise accept-ranges: bytes\n');
  }
  const size = Number(head.headers.get('content-length'));
  if (!Number.isFinite(size) || size <= 0) throw new Error('no content-length on ZIP');

  const tailLen = Math.min(size, 128 * 1024);
  const tail = await rangeBuf(url, size - tailLen, size - 1);

  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('end-of-central-directory record not found');

  let cdOffset = tail.readUInt32LE(eocd + 16);
  let cdSize = tail.readUInt32LE(eocd + 12);
  let count = tail.readUInt16LE(eocd + 10);

  // Any saturated field means the real values live in the Zip64 EOCD.
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff || count === 0xffff) {
    let loc = -1;
    for (let i = eocd - 20; i >= 0; i--) {
      if (tail.readUInt32LE(i) === SIG_EOCD64_LOCATOR) { loc = i; break; }
    }
    if (loc < 0) throw new Error('zip64 locator not found');
    const z64Off = Number(tail.readBigUInt64LE(loc + 8));
    const z64 = await rangeBuf(url, z64Off, z64Off + 55);
    if (z64.readUInt32LE(0) !== SIG_EOCD64) throw new Error('bad zip64 EOCD signature');
    count = Number(z64.readBigUInt64LE(32));
    cdSize = Number(z64.readBigUInt64LE(40));
    cdOffset = Number(z64.readBigUInt64LE(48));
  }

  const cd = await rangeBuf(url, cdOffset, cdOffset + cdSize - 1);
  const entries = [];
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (cd.readUInt32LE(p) !== SIG_CENTRAL) throw new Error(`bad central header at ${p}`);
    const method = cd.readUInt16LE(p + 10);
    let compSize = cd.readUInt32LE(p + 20);
    let uncompSize = cd.readUInt32LE(p + 24);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    let localOffset = cd.readUInt32LE(p + 42);
    const name = cd.toString('utf8', p + 46, p + 46 + nameLen);

    if (uncompSize === 0xffffffff || compSize === 0xffffffff || localOffset === 0xffffffff) {
      const ex = cd.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
      let q = 0;
      while (q + 4 <= ex.length) {
        const id = ex.readUInt16LE(q);
        const len = ex.readUInt16LE(q + 2);
        if (id === 0x0001) {
          // Zip64 extended info writes only the saturated fields, in this order.
          let r = q + 4;
          if (uncompSize === 0xffffffff) { uncompSize = Number(ex.readBigUInt64LE(r)); r += 8; }
          if (compSize === 0xffffffff) { compSize = Number(ex.readBigUInt64LE(r)); r += 8; }
          if (localOffset === 0xffffffff) { localOffset = Number(ex.readBigUInt64LE(r)); r += 8; }
          break;
        }
        q += 4 + len;
      }
    }
    entries.push({ name, method, compSize, uncompSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { size, entries };
}

/**
 * Stream one member, invoking `onLine(line)` for every CSV line including the
 * header. Returns the number of lines emitted.
 *
 * `onLine` is called for tens of millions of lines — it must stay allocation-
 * light. Throw from it to abort the stream.
 */
export async function streamMemberLines(url, entry, onLine) {
  // The local file header is variable-length, so its own name/extra lengths
  // (which may differ from the central directory's) decide where data starts.
  const lh = await rangeBuf(url, entry.localOffset, entry.localOffset + 29);
  if (lh.readUInt32LE(0) !== SIG_LOCAL) throw new Error(`bad local header for ${entry.name}`);
  const dataStart = entry.localOffset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
  const dataEnd = dataStart + entry.compSize - 1;

  const res = await fetchRetry(url, { headers: { Range: `bytes=${dataStart}-${dataEnd}` } });
  if (res.status !== 206) throw new Error(`member ${entry.name}: expected 206, got ${res.status}`);
  if (!res.body) throw new Error(`member ${entry.name}: no response body`);

  const src = Readable.fromWeb(res.body);
  let out = src;
  if (entry.method === 8) {
    const inflate = zlib.createInflateRaw({ chunkSize: 1 << 20 });
    src.on('error', (e) => inflate.destroy(e));
    out = src.pipe(inflate);
  } else if (entry.method !== 0) {
    throw new Error(`member ${entry.name}: unsupported compression method ${entry.method}`);
  }

  // A StringDecoder, not chunk.toString(): inflate chunk boundaries fall in
  // arbitrary places, and toString() carries no state between calls, so any
  // multi-byte character straddling a boundary becomes two replacement
  // characters. Applicant names are full of them.
  const dec = new StringDecoder('utf8');
  let tail = '';
  let lines = 0;
  for await (const chunk of out) {
    const text = tail + dec.write(chunk);
    let start = 0;
    let nl = text.indexOf('\n', start);
    while (nl !== -1) {
      let line = text.slice(start, nl);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.length) { onLine(line); lines++; }
      start = nl + 1;
      nl = text.indexOf('\n', start);
    }
    tail = text.slice(start);
  }
  tail += dec.end();
  if (tail.length) {
    const line = tail.endsWith('\r') ? tail.slice(0, -1) : tail;
    if (line.length) { onLine(line); lines++; }
  }
  return lines;
}

/** Find a member by exact file name, erroring with the available names. */
export function member(entries, name) {
  const e = entries.find((x) => x.name === name);
  if (!e) throw new Error(`member ${name} not in archive (have: ${entries.map((x) => x.name).join(', ')})`);
  return e;
}
