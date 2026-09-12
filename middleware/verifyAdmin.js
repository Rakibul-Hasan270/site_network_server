const { getDb } = require('../db');

/**
 * Middleware: Requires that req.decoded is set (by verifyToken)
 * and the user exists in the MongoDB 'users' collection with role === 'super_admin'
 * or matches process.env.SUPER_ADMIN_EMAIL.
 */
async function verifyAdmin(req, res, next) {
  try {
    const email = req.decoded?.email;
    if (!email) {
      return res.status(401).json({ message: 'Unauthorized access: no email in token' });
    }

    if (process.env.SUPER_ADMIN_EMAIL && email.toLowerCase() === process.env.SUPER_ADMIN_EMAIL.toLowerCase()) {
      return next();
    }

    const user = await getDb().collection('users').findOne({ email: email });
    if (!user || user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Forbidden access: Super Admin only' });
    }

    req.currentUser = user;
    next();
  } catch (err) {
    console.error('verifyAdmin failed:', err);
    res.status(500).json({ message: 'Internal server error verifying admin role' });
  }
}

module.exports = verifyAdmin;