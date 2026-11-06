import path from 'node:path';

// How remark/request attachments are stored and served. The type always comes
// from the file name plus the file's own bytes, never from the Content-Type the
// uploader's browser sent, so a file can't be served as something it isn't.

const startsWith = (b, bytes, offset = 0) => b.length >= offset + bytes.length && bytes.every((x, i) => b[offset + i] === x);
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));

const isPdf = (b) => startsWith(b, ascii('%PDF-'));
const isPng = (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isJpeg = (b) => startsWith(b, [0xff, 0xd8, 0xff]);
const isGif = (b) => startsWith(b, ascii('GIF87a')) || startsWith(b, ascii('GIF89a'));
const isWebp = (b) => startsWith(b, ascii('RIFF')) && startsWith(b, ascii('WEBP'), 8);
const isBmp = (b) => startsWith(b, ascii('BM'));

// Formats a browser can show directly. They open inline only when the bytes match.
const VIEWABLE = [
  { exts: ['pdf'], mime: 'application/pdf', matches: isPdf },
  { exts: ['png'], mime: 'image/png', matches: isPng },
  { exts: ['jpg', 'jpeg'], mime: 'image/jpeg', matches: isJpeg },
  { exts: ['gif'], mime: 'image/gif', matches: isGif },
  { exts: ['webp'], mime: 'image/webp', matches: isWebp },
  { exts: ['bmp'], mime: 'image/bmp', matches: isBmp },
  // Plain text is safe to show: it's sent as text/plain with nosniff and a script-free CSP.
  { exts: ['txt'], mime: 'text/plain; charset=utf-8', matches: () => true },
];

// Formats that are always downloaded.
const DOWNLOAD_ONLY = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  rtf: 'application/rtf',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  zip: 'application/zip',
};

// Extensions the storage layer's local cache accepts (see lib/storage.js); anything else is stored as .bin.
const STORAGE_EXTS = new Set(['pdf', 'csv', 'xlsx', 'xls', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'doc', 'docx', 'txt', 'zip']);

const extOf = (name) => path.extname(String(name || '')).slice(1).toLowerCase();

/**
 * Decides how a file is stored and served.
 * Returns { mime, inline, storageExt }: inline is true only for formats a browser can
 * safely display whose bytes really are that format.
 */
export function describeFile(name, buffer) {
  const ext = extOf(name);
  const storageExt = STORAGE_EXTS.has(ext) ? ext : 'bin';

  const viewable = VIEWABLE.find((v) => v.exts.includes(ext));
  if (viewable) {
    return viewable.matches(buffer)
      ? { mime: viewable.mime, inline: true, storageExt }
      : { mime: 'application/octet-stream', inline: false, storageExt };
  }
  if (DOWNLOAD_ONLY[ext]) return { mime: DOWNLOAD_ONLY[ext], inline: false, storageExt };

  // No usable extension (e.g. a pasted image called "image"): recognise common formats by their bytes.
  const sniffed = VIEWABLE.find((v) => v.exts[0] !== 'txt' && v.matches(buffer));
  if (sniffed) return { mime: sniffed.mime, inline: true, storageExt: sniffed.exts[0] };
  return { mime: 'application/octet-stream', inline: false, storageExt: 'bin' };
}

/** A safe display name: no folders or control characters, at most 255 characters, extension kept. */
export function cleanFilename(raw) {
  let name = String(raw ?? '').replace(/\\/g, '/').split('/').pop();
  name = name.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!name || name === '.' || name === '..') return 'attachment';
  if (name.length > 255) {
    const ext = path.extname(name).slice(0, 20);
    name = name.slice(0, 255 - ext.length) + ext;
  }
  return name;
}

/** Content-Disposition with an ASCII fallback plus the exact UTF-8 name (RFC 6266 / 5987). */
export function contentDisposition(type, filename) {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
