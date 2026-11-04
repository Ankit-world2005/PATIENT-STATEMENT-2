import { api } from './api.js';

const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB chunks (safely below Vercel's 4.5 MB serverless limit)
export const CHUNK_THRESHOLD = 2.5 * 1024 * 1024; // Use chunked upload if file exceeds 2.5 MB

/**
 * Uploads a file in sequential 2MB chunks.
 * @param {File} file
 * @param {(currentChunk: number, totalChunks: number) => void} [onProgress]
 * @returns {Promise<string>} The storage key of the assembled file
 */
export async function uploadInChunks(file, onProgress) {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const uploadId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `up_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  let completedRes = null;
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);
    const chunkBlob = file.slice(start, end);

    if (onProgress) {
      onProgress(i + 1, totalChunks);
    }

    const chunkForm = new FormData();
    chunkForm.set('uploadId', uploadId);
    chunkForm.set('chunkIndex', String(i));
    chunkForm.set('totalChunks', String(totalChunks));
    chunkForm.set('chunk', chunkBlob, `${file.name}.part${i}`);

    const res = await api('/imports/chunk', { method: 'POST', form: chunkForm });
    if (res.completed) {
      completedRes = res;
    }
  }

  if (!completedRes?.zipKey) {
    throw new Error('Failed to assemble uploaded statement archive. Please try again.');
  }

  return completedRes.zipKey;
}
