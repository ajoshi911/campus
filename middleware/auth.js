/*
════════════════════════════════════════════════════════════
  middleware/auth.js  — PATCH: accept token from query param
  
  WHY THIS IS NEEDED:
  An <iframe> cannot set custom HTTP headers (like
  Authorization: Bearer <token>). To allow the iframe to
  access /api/books/:id/stream, we accept the JWT from
  the ?token= query parameter as a fallback.
  
  FIND the `protect` middleware in your middleware/auth.js
  and REPLACE it with the version below.
  Everything else in auth.js stays the same.
════════════════════════════════════════════════════════════
*/

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// middleware/auth.js — update the protect function
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Standard header (API calls)
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Query param fallback (iframe / <a> tags cannot set headers)
    if (!token && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(decoded.id).select('-password');

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User no longer active' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

exports.restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  next();
};