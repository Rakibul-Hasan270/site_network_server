const jwt = require('jsonwebtoken');

/**
 * Expects an "Authorization: Bearer <token>" header, matching what
 * useAxiosSecure's request interceptor sends. Requires ACCESS_TOKEN_SECRET
 * in your .env — it must be the SAME secret your login/jwt-issuing endpoint
 * uses to sign tokens, or verification will always fail.
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send({ message: 'unauthorized access' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'unauthorized access' });
    }
    req.decoded = decoded;
    next();
  });
}

module.exports = verifyToken;