const { getDb } = require('../db');

/**
 * Middleware: Requires that req.decoded is set (by verifyToken)
 * and the user has role === 'seller' or 'super_admin'.
 */
async function verifySeller(req, res, next) {
  try {
    const email = req.decoded?.email;
    if (!email) {
      return res.status(401).json({ message: 'Unauthorized access: no email in token' });
    }

    if (process.env.SUPER_ADMIN_EMAIL && email.toLowerCase() === process.env.SUPER_ADMIN_EMAIL.toLowerCase()) {
      return next();
    }

    const user = await getDb().collection('users').findOne({ email: email });
    const currentRole = user?.activeRole || user?.role;
    if (!user || (currentRole !== 'seller' && user.role !== 'super_admin')) {
      return res.status(403).json({ message: 'Forbidden access: Seller or Super Admin only' });
    }

    req.currentUser = user;
    next();
  } catch (err) {
    console.error('verifySeller failed:', err);
    res.status(500).json({ message: 'Internal server error verifying seller role' });
  }
}

module.exports = verifySeller;
