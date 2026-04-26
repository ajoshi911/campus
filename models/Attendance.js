const mongoose = require('mongoose');

/* Lab Session */
const labSessionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Session name is required'],
    trim: true,
    maxlength: 150,
  },
  lab: {
    type: String,
    required: true,
    enum: ['Lab 1', 'Lab 2', 'Lab 3', 'Lab 4', 'Lab 5', 'Lab 6', 'Lab 7', 'Lab 8'],
  },
  subject: { type: String, required: true, trim: true },
  department: { type: String, trim: true },
  year: { type: Number, min: 1, max: 4 },
  instructor: { type: String, trim: true },

  date: { type: Date, required: true },
  startTime: { type: String, required: true }, // "09:00"
  endTime:   { type: String, required: true }, // "11:00"

  isOpen: { type: Boolean, default: false }, // admin controls this
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, { timestamps: true });

/* Attendance Record */
const attendanceSchema = new mongoose.Schema({
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LabSession',
    required: true,
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  markedAt: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ['present', 'late'],
    default: 'present',
  },
  remarks: { type: String, maxlength: 300 },
}, { timestamps: true });

/* Compound unique: one record per student per session */
attendanceSchema.index({ session: 1, student: 1 }, { unique: true });

const LabSession = mongoose.model('LabSession', labSessionSchema);
const Attendance = mongoose.model('Attendance', attendanceSchema);

module.exports = { LabSession, Attendance };
