const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ku7rezk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db;

async function connectDB() {
  if (db) return db;
  await client.connect();
  db = client.db('guestPostingMarketplace'); // matches the database that actually has your data in Atlas
  console.log('MongoDB connected');
  return db;
}

function getDb() {
  if (!db) {
    throw new Error('DB not connected yet. Call connectDB() before using getDb().');
  }
  return db;
}

module.exports = { connectDB, getDb, client };