/**
 * Run once to populate the "websites" collection with sample data so the
 * marketplace has something real to query while you build out the rest of
 * the backend (real signup/import flows can replace this later).
 *
 *   node seed.js          -> seeds only if the collection is empty
 *   node seed.js --force  -> wipes the collection first, then reseeds
 */
require('dotenv').config();
const { connectDB, client } = require('./db');

const COUNTRIES = [
  { code: 'US', flag: '🇺🇸', name: 'United States' },
  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'IN', flag: '🇮🇳', name: 'India' },
  { code: 'CA', flag: '🇨🇦', name: 'Canada' },
  { code: 'AU', flag: '🇦🇺', name: 'Australia' },
  { code: 'DE', flag: '🇩🇪', name: 'Germany' },
  { code: 'FR', flag: '🇫🇷', name: 'France' },
  { code: 'IT', flag: '🇮🇹', name: 'Italy' },
  { code: 'BR', flag: '🇧🇷', name: 'Brazil' },
  { code: 'PH', flag: '🇵🇭', name: 'Philippines' },
];

const NICHES = ['News', 'Entertainment', 'Blog', 'Business', 'General', 'Technology', 'Sports', 'Fashion', 'Lifestyle', 'Travel', 'Education', 'App', 'Beauty', 'Game', 'Finance', 'Health', 'Medicine', 'Gaming', 'Music', 'Food'];
const LANGUAGES = ['English', 'Spanish', 'Italian', 'Ukrainian'];
const LINK_VALIDITY = ['Instant', '1 Year', 'Permanent'];

const RULE_POOL = [
  'No gambling or casino content',
  'No CBD or pharmacy content',
  'No adult or dating content',
  'Author bio allowed (1 link)',
  'Do-follow link on first mention only',
  'Minimum 600 words per article',
  'No cryptocurrency content',
  'Content must be 100% unique',
  'Anchor text must be natural',
  'Max 2 outbound links per post',
  'Sponsored tag required',
  'No political or religious content',
];

const NAME_A = ['digi', 'prime', 'urban', 'byte', 'north', 'grand', 'swift', 'nova', 'core', 'vivid', 'peak', 'zen', 'true', 'meta', 'pulse', 'spark', 'trend', 'orbit', 'wise', 'fresh'];
const NAME_B = ['press', 'hub', 'wire', 'daily', 'pulse', 'media', 'post', 'desk', 'world', 'times', 'buzz', 'scope', 'report', 'spot', 'grid', 'loop', 'beam', 'verse', 'way', 'lane'];
const TLDS = ['.com', '.net', '.org', '.io', '.co'];

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[rand(0, arr.length - 1)];
}
function pickMany(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(rand(0, copy.length - 1), 1)[0]);
  return out;
}
function trendSeries(bias) {
  let v = rand(20, 80);
  const out = [v];
  for (let i = 0; i < 7; i++) {
    v = Math.max(2, v + rand(-15, 15) + bias);
    out.push(v);
  }
  return out;
}

function generateFakeWebsites(count) {
  const used = new Set();
  const rows = [];

  for (let i = 0; i < count; i++) {
    let domain;
    do {
      domain = pick(NAME_A) + pick(NAME_B) + pick(TLDS);
    } while (used.has(domain));
    used.add(domain);

    const daysAgo = rand(0, 400);
    const bias = rand(-3, 3);
    const countryPicks = pickMany(COUNTRIES, rand(1, 3));
    let remaining = 100;
    const countries = countryPicks.map((c, idx) => {
      const pct = idx === countryPicks.length - 1 ? remaining : rand(5, remaining - (countryPicks.length - idx - 1) * 5);
      remaining -= pct;
      return { ...c, pct };
    });

    rows.push({
      domain,
      isNew: daysAgo < 7,
      niches: pickMany(NICHES, rand(1, 3)),
      language: pick(LANGUAGES),
      as: rand(2, 60),
      da: rand(2, 95),
      dr: rand(2, 95),
      ahrefsTraffic: rand(50, 400000),
      ahrefsKeywords: rand(10, 60000),
      semrushTraffic: rand(20, 200000),
      semrushKeywords: rand(10, 40000),
      ahrefsTrend: trendSeries(bias),
      semrushTrend: trendSeries(-bias),
      trafficCountry: pick(COUNTRIES).code,
      trendPercent: rand(-90, 90),
      rules: pickMany(RULE_POOL, rand(3, 5)),
      countries,
      backlinksCount: pick([1, 1, 2, 2, 2, 3]),
      dofollow: Math.random() > 0.15,
      linkValidity: pick(LINK_VALIDITY),
      deliveryDays: pick([0, 0, 1, 2, 3, 4, 5, 7]),
      sportsGaming: Math.random() > 0.5,
      pharmacy: Math.random() > 0.7,
      googleNews: Math.random() > 0.75,
      foreignLang: Math.random() > 0.6,
      price: rand(8, 320),
      addedAt: Date.now() - daysAgo * 86400000,
    });
  }
  return rows;
}

async function seed() {
  const db = await connectDB();
  const collection = db.collection('websites');

  const existing = await collection.countDocuments();
  const force = process.argv.includes('--force');

  if (existing > 0 && !force) {
    console.log(`Collection already has ${existing} documents. Skipping seed (pass --force to wipe and reseed).`);
    await client.close();
    return;
  }

  if (existing > 0 && force) {
    await collection.deleteMany({});
    console.log('Existing documents wiped.');
  }

  // helpful indexes for the filters/sorts the route supports
  await collection.createIndexes([
    { key: { domain: 1 } },
    { key: { addedAt: -1 } },
    { key: { da: -1 } },
    { key: { dr: -1 } },
    { key: { ahrefsTraffic: -1 } },
    { key: { price: 1 } },
    { key: { niches: 1 } },
    { key: { 'countries.name': 1 } },
  ]);

  const docs = generateFakeWebsites(520);
  const result = await collection.insertMany(docs);
  console.log(`Inserted ${result.insertedCount} websites.`);

  await client.close();
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});