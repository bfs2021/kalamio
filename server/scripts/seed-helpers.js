/**
 * Helpers for scripts/seed.js — kept separate so they can be unit-tested without a database.
 */
import { deflateSync } from 'node:zlib';

// ── Safety ──────────────────────────────────────────────────────────────────

// Hostnames the seed may write to: this machine, or docker-compose service names.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'mongo', 'storage']);

/**
 * Hostnames in a MongoDB connection string, without ports or credentials.
 * e.g. "mongodb://u:p@a:27017,b:27018/db?x=1" → ["a", "b"]
 */
export const mongoHosts = (uri) => {
    const afterScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '');
    const hostPart = afterScheme.split('/')[0].split('?')[0];
    const withoutAuth = hostPart.includes('@') ? hostPart.slice(hostPart.lastIndexOf('@') + 1) : hostPart;
    // "[::1]:27017" → "::1" (IPv6 in brackets), "host:27017" → "host"
    return withoutAuth.split(',').map((h) => (h.startsWith('[') ? h.slice(1, h.indexOf(']')) : h.replace(/:\d+$/, '')));
};

/**
 * Throws unless the seed would only touch local services. The seed wipes and fills a database
 * and uploads files, so it must never reach Atlas, real S3, or a production environment.
 */
export const assertLocalTarget = (env) => {
    if (env.NODE_ENV === 'production') {
        throw new Error('NODE_ENV is "production" — the seed only runs against local development services.');
    }
    if (!env.DB_LOCATION) {
        throw new Error('DB_LOCATION is not set. Copy server/.env.example to server/.env first.');
    }
    if (env.DB_LOCATION.startsWith('mongodb+srv://')) {
        throw new Error('DB_LOCATION points at MongoDB Atlas (mongodb+srv://). The seed only runs against the local MongoDB from docker-compose.');
    }
    const remote = mongoHosts(env.DB_LOCATION).filter((h) => !LOCAL_HOSTS.has(h));
    if (remote.length) {
        throw new Error(`DB_LOCATION points at ${remote.join(', ')}. The seed only runs against a local MongoDB (localhost).`);
    }
    if (!env.S3_ENDPOINT) {
        throw new Error('S3_ENDPOINT is not set, so uploads would go to real AWS S3. Use the local storage from server/.env.example.');
    }
    let storageHost;
    try {
        storageHost = new URL(env.S3_ENDPOINT).hostname.replace(/^\[|\]$/g, '');
    } catch {
        throw new Error(`S3_ENDPOINT "${env.S3_ENDPOINT}" is not a valid URL.`);
    }
    if (!LOCAL_HOSTS.has(storageHost)) {
        throw new Error(`S3_ENDPOINT points at ${storageHost}. The seed only uploads to the local storage from docker-compose.`);
    }
};

// ── Tiptap content builders (same JSON the editor produces) ─────────────────

/**
 * Turns a line of light markdown into Tiptap text nodes:
 * **bold**, *italic*, `code` and [label](https://url).
 */
export const inline = (text) => {
    const nodes = [];
    const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((https?:\/\/[^)\s]+)\)/g;
    let last = 0;
    for (const m of text.matchAll(pattern)) {
        if (m.index > last) nodes.push({ type: 'text', text: text.slice(last, m.index) });
        if (m[1]) nodes.push({ type: 'text', text: m[1], marks: [{ type: 'bold' }] });
        else if (m[2]) nodes.push({ type: 'text', text: m[2], marks: [{ type: 'italic' }] });
        else if (m[3]) nodes.push({ type: 'text', text: m[3], marks: [{ type: 'code' }] });
        else nodes.push({ type: 'text', text: m[4], marks: [{ type: 'link', attrs: { href: m[5], target: '_blank' } }] });
        last = m.index + m[0].length;
    }
    if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) });
    return nodes;
};

export const doc = (...content) => ({ type: 'doc', content });
export const p = (text) => ({ type: 'paragraph', content: inline(text) });
export const h2 = (text) => ({ type: 'heading', attrs: { level: 2 }, content: inline(text) });
export const h3 = (text) => ({ type: 'heading', attrs: { level: 3 }, content: inline(text) });
export const quote = (text) => ({ type: 'blockquote', content: [p(text)] });
export const hr = () => ({ type: 'horizontalRule' });
export const code = (language, text) => ({ type: 'codeBlock', attrs: { language }, content: [{ type: 'text', text }] });
const listItems = (items) => items.map((item) => ({ type: 'listItem', content: [p(item)] }));
export const ul = (items) => ({ type: 'bulletList', content: listItems(items) });
export const ol = (items) => ({ type: 'orderedList', attrs: { start: 1 }, content: listItems(items) });

// ── Banner images ───────────────────────────────────────────────────────────

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

export const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
};

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * A banner PNG: a diagonal gradient between two colours with two soft circles,
 * so every seeded article gets a distinct, real image without any network access.
 */
export const bannerPng = (fromHex, toHex, width = 1200, height = 630) => {
    const [a, b] = [hexToRgb(fromHex), hexToRgb(toHex)];
    const circles = [
        { x: width * 0.78, y: height * 0.3, r: height * 0.42 },
        { x: width * 0.18, y: height * 0.85, r: height * 0.3 },
    ];
    const rows = Buffer.alloc((width * 3 + 1) * height);
    let o = 0;
    for (let y = 0; y < height; y++) {
        rows[o++] = 0; // filter: none
        for (let x = 0; x < width; x++) {
            const t = (x / width + y / height) / 2;
            let light = 0;
            for (const c of circles) if ((x - c.x) ** 2 + (y - c.y) ** 2 < c.r ** 2) light += 0.08;
            for (let i = 0; i < 3; i++) {
                const v = a[i] + (b[i] - a[i]) * t;
                rows[o++] = Math.round(v + (255 - v) * light);
            }
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // colour type: RGB
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(rows, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
};

/** A date `days` days (and `hours` hours) before now. */
export const daysAgo = (days, hours = 0) => new Date(Date.now() - (days * 24 + hours) * 3600 * 1000);
