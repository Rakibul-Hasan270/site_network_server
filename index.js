const express = require('express');
const cors = require('cors');
require('dotenv').config();
const dns = require('dns');

// Fix: some ISP/router DNS servers can't resolve the SRV record MongoDB
// needs for "mongodb+srv://" URIs, causing "querySrv ECONNREFUSED".
// Forcing Node to use Google's DNS here fixes it without changing
// Windows network settings.
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch {
  // Ignored if environment restricts custom DNS servers
}

const { connectDB } = require('./db');
const websitesRouter = require('./routes/websites');
const jwtRouter = require('./routes/jwt');
const usersRouter = require('./routes/users');
const ordersRouter = require('./routes/orders');

const app = express();
const port = process.env.PORT || 9000;

const allowedOrigins = [
  'http://localhost:5173',
  'https://site-network-client.vercel.app'
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());

// Ensure MongoDB is connected before handling any request. This runs on
// every request, but connectDB() caches the connection after the first
// call, so it's cheap. Needed because Vercel serverless functions don't
// go through the old start()/app.listen() flow below.
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('DB connection failed:', err);
    res.status(500).json({ message: 'Database connection failed' });
  }
});

app.get('/', (req, res) => {
  res.send('Server is running');
});

app.use('/api/websites', websitesRouter);
app.use('/api/orders', ordersRouter);
app.use('/jwt', jwtRouter);
app.use('/users', usersRouter);

// Only start a traditional listener when running locally with `node index.js`
// / `npm run dev`. On Vercel, the exported `app` below is wrapped as a
// serverless function instead — app.listen must NOT run there.
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

module.exports = app;