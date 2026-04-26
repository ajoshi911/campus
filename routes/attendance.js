const router = require('express').Router();
const { LabSession, Attendance } = require('../models/Attendance');
const { protect, restrictTo }   = require('../middleware/auth');

/* ══ LAB SESSIONS ══════════════════════════════════ */

/* GET  /api/attendance/sessions  — all sessions */
router.get('/sessions', protect, async (req, res) => {
  const { department, year, lab, open } = req.query;
  const filter = {};
  if (department) filter.department = new RegExp(department, 'i');
  if (year)       filter.year       = Number(year);
  if (lab)        filter.lab        = lab;
  if (open === 'true') filter.isOpen = true;

  const sessions = await LabSession.find(filter)
    .populate('createdBy', 'name')
    .sort({ date: -1, startTime: 1 });

  res.json({ success: true, sessions });
});

/* GET  /api/attendance/sessions/:id */
router.get('/sessions/:id', protect, async (req, res) => {
  const session = await LabSession.findById(req.params.id).populate('createdBy', 'name');
  if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
  res.json({ success: true, session });
});

/* POST /api/attendance/sessions  — admin create */
router.post('/sessions', protect, restrictTo('admin'), async (req, res) => {
  const session = await LabSession.create({ ...req.body, createdBy: req.user._id });
  res.status(201).json({ success: true, session });
});

/* PATCH /api/attendance/sessions/:id  — admin toggle open/close or edit */
router.patch('/sessions/:id', protect, restrictTo('admin'), async (req, res) => {
  const session = await LabSession.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
  res.json({ success: true, session });
});

/* DELETE /api/attendance/sessions/:id */
router.delete('/sessions/:id', protect, restrictTo('admin'), async (req, res) => {
  await LabSession.findByIdAndDelete(req.params.id);
  await Attendance.deleteMany({ session: req.params.id });
  res.json({ success: true, message: 'Session deleted' });
});

/* ══ ATTENDANCE RECORDS ════════════════════════════ */

/* POST /api/attendance/mark  — student marks attendance */
router.post('/mark', protect, restrictTo('student'), async (req, res) => {
  const { sessionId, remarks } = req.body;

  const session = await LabSession.findById(sessionId);
  if (!session)  return res.status(404).json({ success: false, message: 'Session not found' });
  if (!session.isOpen) return res.status(400).json({ success: false, message: 'Session is not open for attendance' });

  // Check if already marked
  const existing = await Attendance.findOne({ session: sessionId, student: req.user._id });
  if (existing)  return res.status(400).json({ success: false, message: 'Attendance already marked' });

  // Determine if late (compare current time to session endTime)
  const now = new Date();
  const [h, m] = session.startTime.split(':').map(Number);
  const sessionStart = new Date(session.date);
  sessionStart.setHours(h, m, 0, 0);
  const diffMin = (now - sessionStart) / 60000;
  const status  = diffMin > 30 ? 'late' : 'present';

  const record = await Attendance.create({
    session: sessionId,
    student: req.user._id,
    status,
    remarks,
  });

  res.status(201).json({ success: true, record, status });
});

/* GET /api/attendance/my  — student's own records */
router.get('/my', protect, restrictTo('student'), async (req, res) => {
  const records = await Attendance.find({ student: req.user._id })
    .populate({ path: 'session', populate: { path: 'createdBy', select: 'name' } })
    .sort({ markedAt: -1 });

  res.json({ success: true, records });
});

/* GET /api/attendance/session/:id  — admin view all attendees for a session */
router.get('/session/:id', protect, restrictTo('admin'), async (req, res) => {
  const records = await Attendance.find({ session: req.params.id })
    .populate('student', 'name email rollNumber department year')
    .sort({ markedAt: 1 });

  res.json({ success: true, total: records.length, records });
});

/* GET /api/attendance/stats  — admin overall stats */
router.get('/stats', protect, restrictTo('admin'), async (req, res) => {
  const totalSessions   = await LabSession.countDocuments();
  const openSessions    = await LabSession.countDocuments({ isOpen: true });
  const totalAttendance = await Attendance.countDocuments();

  const byStatus = await Attendance.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  res.json({ success: true, totalSessions, openSessions, totalAttendance, byStatus });
});

module.exports = router;
