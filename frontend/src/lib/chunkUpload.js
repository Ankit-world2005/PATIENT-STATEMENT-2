import { api } from './api.js';

const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB chunks (safely below Vercel's 4.5 MB serverless limit)
export const CHUNK_THRESHOLD = 2.5 * 1024 * 1024; // Use chunked upload if file exceeds 2.5 MB

/** Random v4 UUID; crypto.randomUUID is missing on plain-http LAN addresses, getRandomValues is not. */
function newUploadId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Sends a file in sequential 2 MB pieces and returns the response to the piece that completed it. */
async function sendInChunks(file, endpoint, fields, onProgress) {
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  const uploadId = newUploadId();

  let completedRes = null;
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);

    if (onProgress) onProgress(i + 1, totalChunks);

    const chunkForm = new FormData();
    chunkForm.set('uploadId', uploadId);
    chunkForm.set('chunkIndex', String(i));
    chunkForm.set('totalChunks', String(totalChunks));
    for (const [key, value] of Object.entries(fields)) chunkForm.set(key, value);
    chunkForm.set('chunk', file.slice(start, end), `${file.name}.part${i}`);

    const res = await api(endpoint, { method: 'POST', form: chunkForm });
    if (res?.completed) completedRes = res;
  }
  return completedRes;
}

/**
 * Uploads a statement ZIP in chunks.
 * @param {File} file
 * @param {(currentChunk: number, totalChunks: number) => void} [onProgress]
 * @returns {Promise<string>} The storage key of the assembled file
 */
export async function uploadInChunks(file, onProgress) {
  const res = await sendInChunks(file, '/imports/chunk', {}, onProgress);
  if (!res?.zipKey) {
    throw new Error('Failed to assemble uploaded statement archive. Please try again.');
  }
  return res.zipKey;
}

/**
 * Uploads a remark/request attachment in chunks.
 * @returns {Promise<object>} The saved attachment ({ id, name, contentType, size, url })
 */
export async function uploadAttachmentInChunks(file, onProgress) {
  const res = await sendInChunks(file, '/attachments/chunk', { fileName: file.name }, onProgress);
  if (!res?.attachment) {
    throw new Error(`"${file.name}" didn't finish uploading. Please attach it again.`);
  }
  return res.attachment;
}
