import type { Request, Response, RequestHandler } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { uploadToR2 } from '../storage.js';
import * as booksService from '../features/books/service.js';

/**
 * Multer configuration — store files in memory
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Only .txt files are allowed'));
    }
  },
});

export const uploadMiddleware: RequestHandler = upload.single('file');

/**
 * POST /api/upload
 * Upload book file, create book record, dispatch splitChapters job
 */
export async function handleUpload(req: Request, res: Response) {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const title = req.body.title as string;
    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    // Upload to R2
    const fileKey = `uploads/${req.userId}/${randomUUID()}.txt`;
    const fileUrl = await uploadToR2(fileKey, req.file.buffer, req.file.mimetype);

    // Create book and dispatch job
    const book = await booksService.createBook(
      req.app.locals.db,
      req.app.locals.queue,
      req.userId,
      title,
      fileUrl
    );

    res.json({ book });
  } catch (error) {
    req.log.error(error, 'Upload failed');
    res.status(500).json({ error: 'Upload failed' });
  }
}
