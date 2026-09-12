const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

/**
 * POST /jwt
 * Called by AuthProvider right after Firebase confirms a user is logged in.
 * Body: { email }
 * Response: { token }
 *
 * The token is signed with ACCESS_TOKEN_SECRET (same secret verifyToken.js
 * checks against), so make sure that env var is set.
 */
router.post('/', (req, res) => {
  const user = req.body; // { email }

  if (!user?.email) {
    return res.status(400).json({ message: 'email is required' });
  }

  const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '7d' });
  res.send({ token });
});

module.exports = router;