const router = require('express').Router();
const User   = require('../models/User');
const { protect, restrictTo } = require('../middleware/auth');

/* GET /api/users  — admin list all users */
router.get('/', protect, restrictTo('admin'), async (req, res) => {
  const { role, department, search } = req.query;
  const filter = {};
  if (role)       filter.role       = role;
  if (department) filter.department = new RegExp(department, 'i');
  if (search)     filter.$or = [
    { name:       new RegExp(search, 'i') },
    { email:      new RegExp(search, 'i') },
    { rollNumber: new RegExp(search, 'i') },
  ];

  const users = await User.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, total: users.length, users });
});

/* GET /api/users/:id  — admin get single user */
router.get('/:id', protect, restrictTo('admin'), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, user });
});

/* PATCH /api/users/:id  — admin update user */
router.patch('/:id', protect, restrictTo('admin'), async (req, res) => {
  const allowed = ['name', 'department', 'year', 'rollNumber', 'isActive'];
  const updates = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, user });
});

/* DELETE /api/users/:id  — admin delete user */
router.delete('/:id', protect, restrictTo('admin'), async (req, res) => {
  if (req.params.id === req.user._id.toString())
    return res.status(400).json({ success: false, message: 'Cannot delete yourself' });

  await User.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'User deleted' });
});

module.exports = router;
