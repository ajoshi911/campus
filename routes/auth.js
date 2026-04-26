const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const User   = require('../models/User');
const { protect } = require('../middleware/auth');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const sendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  res.status(statusCode).json({ success: true, token, user });
};

/* POST /api/auth/register */
router.post('/register', async (req, res) => {
  const { name, email, password, role, rollNumber, department, year } = req.body;

  // Prevent self-registration as admin in production
  const safeRole = role === 'admin' ? 'student' : (role || 'student');

  const user = await User.create({ name, email, password, role: safeRole, rollNumber, department, year });
  sendToken(user, 201, res);
});

/* POST /api/auth/seed-admin  (one-time setup — disable after use) */
router.post('/seed-admin', async (req, res) => {
  const exists = await User.findOne({ role: 'admin' });
  if (exists) return res.status(400).json({ success: false, message: 'Admin already exists' });

  const admin = await User.create({
    name: 'Campus Admin',
    email: process.env.ADMIN_EMAIL || 'admin@tcet.ac.in',
    password: process.env.ADMIN_PASSWORD || 'Admin@1234',
    role: 'admin',
    department: 'Administration',
  });
  sendToken(admin, 201, res);
});

/* POST /api/auth/login */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ success: false, message: 'Email and password required' });

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password)))
    return res.status(401).json({ success: false, message: 'Invalid credentials' });

  if (!user.isActive)
    return res.status(401).json({ success: false, message: 'Account deactivated' });

  sendToken(user, 200, res);
});

/* GET /api/auth/me */
router.get('/me', protect, (req, res) => {
  res.json({ success: true, user: req.user });
});

/* PATCH /api/auth/change-password */
router.patch('/change-password', protect, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');

  if (!(await user.comparePassword(currentPassword)))
    return res.status(401).json({ success: false, message: 'Current password is wrong' });

  user.password = newPassword;
  await user.save();
  sendToken(user, 200, res);
});

module.exports = router;
