const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Book title is required'],
    trim: true,
    maxlength: 200,
  },
  author: {
    type: String,
    required: [true, 'Author is required'],
    trim: true,
    maxlength: 150,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000,
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true,
  },
  department: {
    type: String,
    trim: true,
    default: 'General',
  },
  year: {
    type: Number,
    min: 1, max: 4,
  },
  isbn: {
    type: String,
    trim: true,
  },
  edition: {
    type: String,
    trim: true,
  },
  tags: [{ type: String, trim: true }],

  /* Cloudinary file references */
  pdfUrl:        { type: String, required: true },
  pdfPublicId:   { type: String, required: true },
  coverUrl:      { type: String, default: null },
  coverPublicId: { type: String, default: null },

  fileSize: { type: Number }, // bytes
  pages:    { type: Number },

  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  downloadCount: { type: Number, default: 0 },
  viewCount:     { type: Number, default: 0 },
  isActive:      { type: Boolean, default: true },
}, { timestamps: true });

bookSchema.index({ title: 'text', author: 'text', subject: 'text', tags: 'text' });

module.exports = mongoose.model('Book', bookSchema);
