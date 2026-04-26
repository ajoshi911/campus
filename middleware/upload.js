const cloudinary  = require('cloudinary').v2;
const multer      = require('multer');
const streamifier = require('streamifier');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* In-memory multer (no disk) */
const storage = multer.memoryStorage();

exports.uploadMemory = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF and image files are allowed'));
  },
}).fields([
  { name: 'pdf',   maxCount: 1 },
  { name: 'cover', maxCount: 1 },
]);

/* Upload buffer to Cloudinary */
exports.uploadToCloudinary = (buffer, options = {}) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    streamifier.createReadStream(buffer).pipe(stream);
  });

exports.deleteFromCloudinary = (publicId, resourceType = 'raw') =>
  cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
