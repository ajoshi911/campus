require('dotenv').config();
require('express-async-errors');

const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

const authRoutes       = require('./routes/auth');
const bookRoutes       = require('./routes/books');
const attendanceRoutes = require('./routes/attendance');
const userRoutes       = require('./routes/users');

const app  = express();
const PORT = process.env.PORT || 5000;

/* ── Security ─────────────────────────────────────── */
app.use(
  helmet({
    contentSecurityPolicy: false,
    frameguard: false, // 🔥 THIS FIXES YOUR ISSUE
  })
);
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: 'Too many requests' }));

/* ── CORS ─────────────────────────────────────────── */
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("CORS not allowed"));
  },
  credentials: true,
}));

// ✅ IMPORTANT (preflight fix)
app.options('*', cors());

/* ── Parsers ──────────────────────────────────────── */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

/* ── Routes ───────────────────────────────────────── */
app.use('/api/auth',       authRoutes);
app.use('/api/books',      bookRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/users',      userRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'OK', timestamp: new Date() }));

/* ── Global Error Handler ─────────────────────────── */
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

/* ── MongoDB + Start ──────────────────────────────── */
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅  MongoDB connected');
    app.listen(PORT, () => console.log(`🚀  Server running on port ${PORT}`));
  })
  .catch(err => { console.error('MongoDB error:', err); process.exit(1); });
