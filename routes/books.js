const router   = require('express').Router();
const https    = require('https');
const http     = require('http');
const Book     = require('../models/Book');
const { protect, restrictTo } = require('../middleware/auth');
const { uploadMemory, uploadToCloudinary, deleteFromCloudinary } = require('../middleware/upload');

/*
  PDF DELIVERY FIX — SUMMARY
  ──────────────────────────
  Root cause: Cloudinary blocks PDF/ZIP delivery by default at the
  ACCOUNT level. Fix requires ONE dashboard change:

    Cloudinary Dashboard → Settings → Security →
    "PDF and ZIP files delivery" → Allow → Save

  After that, plain CDN URLs work. No signing needed.
  This file uses the plain pdfUrl from the database for all delivery.
*/

/** Pipe a remote HTTPS/HTTP response into Express */
function proxyStream(remoteUrl, res, onError) {
  const parsed   = new URL(remoteUrl);
  const protocol = parsed.protocol === 'https:' ? https : http;

  const req = protocol.get(remoteUrl, (remote) => {
    if (remote.statusCode >= 400)
      return onError(new Error(`Remote ${remote.statusCode}`));
    if (remote.headers['content-length'])
      res.setHeader('Content-Length', remote.headers['content-length']);
    remote.pipe(res);
  });
  req.on('error', onError);
  req.setTimeout(30000, () => { req.destroy(); onError(new Error('Timeout')); });
}

/* ════════ GET /api/books ════════ */
router.get('/', protect, async (req, res) => {
  const { search, subject, department, year, page = 1, limit = 20 } = req.query;
  const filter = { isActive: true };
  if (subject)    filter.subject    = new RegExp(subject, 'i');
  if (department) filter.department = new RegExp(department, 'i');
  if (year)       filter.year       = Number(year);
  if (search)     filter.$text      = { $search: search };

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await Book.countDocuments(filter);
  const books = await Book.find(filter)
    .populate('uploadedBy', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip).limit(Number(limit))
    .select('-pdfPublicId -coverPublicId');

  res.json({ success: true, total, page: Number(page), books });
});

/* ════════ GET /api/books/:id ════════ */
router.get('/:id', protect, async (req, res) => {
  const book = await Book.findById(req.params.id).populate('uploadedBy', 'name');
  if (!book || !book.isActive)
    return res.status(404).json({ success: false, message: 'Book not found' });
  book.viewCount += 1;
  await book.save({ validateBeforeSave: false });
  res.json({ success: true, book });
});

/* ════════════════════════════════════════════════════════════
   GET /api/books/:id/stream — inline PDF viewer

   Proxies the Cloudinary CDN URL through Express so:
   • We set Content-Type: application/pdf (iframe renders it)
   • We set Content-Disposition: inline  (not a download)
   • No X-Frame-Options blocking the iframe
   • Works once PDF delivery is enabled in Cloudinary dashboard
════════════════════════════════════════════════════════════ */
router.get('/:id/stream', async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);

    if (!book || !book.pdfUrl) {
      return res.status(404).json({ message: 'PDF not found' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=3600');

    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");

    proxyStream(book.pdfUrl, res, (err) => {
      console.error('[STREAM ERROR]', err.message);
      if (!res.headersSent) {
        res.status(503).json({ message: 'PDF unavailable' });
      }
    });

  } catch (err) {
    console.error('[STREAM CRASH]', err);
    res.status(500).json({ message: 'Server error' });
  }
});
/* ════════════════════════════════════════════════════════════
   GET /api/books/:id/download-file — forced download

   Same proxy but with Content-Disposition: attachment so
   the browser saves the file with the book's title as filename.
════════════════════════════════════════════════════════════ */
router.get('/:id/download-file', protect, async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book || !book.isActive)
    return res.status(404).json({ success: false, message: 'Book not found' });

  book.downloadCount += 1;
  await book.save({ validateBeforeSave: false });

  const safeName = (book.title || 'book')
    .replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').substring(0, 80) || 'book';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
  res.setHeader('Cache-Control', 'no-cache');

  proxyStream(book.pdfUrl, res, (err) => {
    console.error('[download-file] error:', err.message);
    if (!res.headersSent)
      res.status(503).json({ success: false, message: 'Download temporarily unavailable' });
  });
});

/* POST /api/books/:id/download (backward compat) */
router.post('/:id/download', protect, async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book || !book.isActive)
    return res.status(404).json({ success: false, message: 'Book not found' });
  book.downloadCount += 1;
  await book.save({ validateBeforeSave: false });
  res.json({ success: true, pdfUrl: book.pdfUrl });
});

/* ════════════════════════════════════════════════════════════
   POST /api/books — admin upload

   access_mode:'public' + Cloudinary PDF delivery enabled =
   plain CDN URLs work with zero authentication headaches.
════════════════════════════════════════════════════════════ */
router.post('/', protect, restrictTo('admin'), uploadMemory, async (req, res) => {
  const { title, author, description, subject, department, year, isbn, edition, tags, pages } = req.body;
  if (!req.files?.pdf?.[0])
    return res.status(400).json({ success: false, message: 'PDF file is required' });

  const pdfBuffer = req.files.pdf[0].buffer;
  const pdfResult = await uploadToCloudinary(pdfBuffer, {
    folder:        'tcet-library/books',
    resource_type: 'raw',
    public_id:     `book-${Date.now()}`,
    format:        'pdf',
    access_mode:   'public',   // always public — no 401/403 on CDN URLs
  });

  let coverUrl = null, coverPublicId = null;
  if (req.files?.cover?.[0]) {
    const r = await uploadToCloudinary(req.files.cover[0].buffer, {
      folder:        'tcet-library/covers',
      resource_type: 'image',
      transformation: [{ width: 400, height: 560, crop: 'fill' }],
    });
    coverUrl = r.secure_url; coverPublicId = r.public_id;
  }

  const book = await Book.create({
    title, author, description, subject,
    department: department || 'General',
    year:  year  ? Number(year)  : undefined,
    pages: pages ? Number(pages) : undefined,
    isbn, edition,
    tags: tags ? tags.split(',').map(t => t.trim()) : [],
    pdfUrl: pdfResult.secure_url, pdfPublicId: pdfResult.public_id,
    coverUrl, coverPublicId,
    fileSize:  pdfBuffer.length,
    uploadedBy: req.user._id,
  });
  res.status(201).json({ success: true, book });
});

/* PATCH /api/books/:id */
router.patch('/:id', protect, restrictTo('admin'), async (req, res) => {
  const allowed = ['title','author','description','subject','department','year','isbn','edition','tags','pages','isActive'];
  const updates = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  const book = await Book.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
  res.json({ success: true, book });
});

/* DELETE /api/books/:id */
router.delete('/:id', protect, restrictTo('admin'), async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
  await deleteFromCloudinary(book.pdfPublicId, 'raw');
  if (book.coverPublicId) await deleteFromCloudinary(book.coverPublicId, 'image');
  await book.deleteOne();
  res.json({ success: true, message: 'Book deleted' });
});

module.exports = router;