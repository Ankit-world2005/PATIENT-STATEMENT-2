import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import { storage } from '../lib/storage.js';
import { query } from '../db/pool.js';
import { badRequest, notFound } from '../lib/errors.js';

export const attachmentsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB limit
});

// POST /api/attachments - Upload an attachment (photo, pdf, excel, etc.)
attachmentsRouter.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('No file uploaded.');

  let ext = path.extname(req.file.originalname).slice(1).toLowerCase();
  if (!ext || !/^[a-z0-9]+$/.test(ext)) {
    if (req.file.mimetype.includes('image/png')) ext = 'png';
    else if (req.file.mimetype.includes('image/jpeg')) ext = 'jpg';
    else if (req.file.mimetype.includes('pdf')) ext = 'pdf';
    else ext = 'bin';
  }

  const id = crypto.randomUUID();
  const storageKey = `attachments/${id}.${ext}`;

  await storage.put(storageKey, req.file.buffer);

  await query(
    `INSERT INTO attachment (id, filename, content_type, size_bytes, storage_key, uploader_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, req.file.originalname || `attachment-${id.slice(0, 8)}.${ext}`, req.file.mimetype || 'application/octet-stream', req.file.size, storageKey, req.user.id],
  );

  res.status(201).json({
    ok: true,
    attachment: {
      id,
      name: req.file.originalname || `attachment-${id.slice(0, 8)}.${ext}`,
      contentType: req.file.mimetype || 'application/octet-stream',
      size: req.file.size,
      url: `/api/attachments/${id}`,
    },
  });
});

// GET /api/attachments/:id - Retrieve or download an attachment
attachmentsRouter.get('/:id', async (req, res) => {
  const { id } = req.params;
  const { rows } = await query('SELECT * FROM attachment WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('Attachment not found.');
  const att = rows[0];

  const buffer = await storage.get(att.storage_key);
  if (!buffer) throw notFound('Attachment file not found.');

  const isDownload = req.query.download === '1' || req.query.download === 'true';
  const dispositionType = isDownload ? 'attachment' : 'inline';

  res.setHeader('Content-Type', att.content_type || 'application/octet-stream');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Content-Disposition', `${dispositionType}; filename="${encodeURIComponent(att.filename)}"`);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(buffer);
});
