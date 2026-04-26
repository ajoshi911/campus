/**
 * fix-cloudinary-access.js
 * ─────────────────────────────────────────────────────────
 * Run ONCE to update all existing Cloudinary book PDFs
 * from access_mode:'authenticated' → 'public'.
 *
 * After running this, the plain CDN URL will work without
 * any signatures or proxying.
 *
 * Usage:
 *   node fix-cloudinary-access.js
 *
 * Run from the backend root directory (where .env lives).
 */

require('dotenv').config();
const mongoose   = require('mongoose');
const cloudinary = require('cloudinary').v2;
const Book       = require('./models/Book');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function fixAccessMode() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const books = await Book.find({ isActive: true }).select('title pdfPublicId pdfUrl');
  console.log(`Found ${books.length} books to update\n`);

  let ok = 0, fail = 0;

  for (const book of books) {
    try {
      const result = await cloudinary.api.update(book.pdfPublicId, {
        resource_type: 'raw',
        access_mode:   'public',
      });
      console.log(`✓ "${book.title}" → access_mode: ${result.access_mode}`);
      ok++;
    } catch (e) {
      console.error(`✗ "${book.title}" (${book.pdfPublicId}):`, e.error?.message || e.message);
      fail++;
    }

    // Small delay to avoid Cloudinary API rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nDone — ${ok} updated, ${fail} failed`);
  await mongoose.disconnect();
}

fixAccessMode().catch(e => { console.error(e); process.exit(1); });