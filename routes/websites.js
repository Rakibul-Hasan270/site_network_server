const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const { buildMongoFilter, buildSort } = require('../utils/filters');
const { trendSeries } = require('../utils/trend');
const verifyToken = require('../middleware/verifyToken');
const verifySeller = require('../middleware/verifySeller');

/**
 * Helper to check if an email matches the configured Super Admin email
 */
function isConfiguredSuperAdmin(email) {
  if (!email || !process.env.SUPER_ADMIN_EMAIL) return false;
  return email.trim().toLowerCase() === process.env.SUPER_ADMIN_EMAIL.trim().toLowerCase();
}

/**
 * GET /api/websites
 * Query params:
 *   page      - 1-based page number (default 1)
 *   perPage   - rows per page (default 150, capped at 500)
 *   sortBy    - "default" | "da_desc" | "dr_desc" | "traffic_desc" | "price_asc" | "price_desc"
 *   search    - matched against domain, case-insensitive
 *   filters   - JSON-stringified object, e.g. {"niche":"Finance","country":"United States"}
 *
 * Response: { rows: [...], total: number }
 */
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(500, Math.max(1, parseInt(req.query.perPage, 10) || 150));
    const sortBy = req.query.sortBy || 'default';
    const search = (req.query.search || '').trim();

    let filters = {};
    if (req.query.filters) {
      try {
        filters = JSON.parse(req.query.filters);
      } catch {
        filters = {};
      }
    }

    const query = buildMongoFilter(search, filters);
    const sort = buildSort(sortBy);

    const collection = getDb().collection('websites');

    const [total, rows] = await Promise.all([
      collection.countDocuments(query),
      collection
        .find(query)
        .sort(sort)
        .skip((page - 1) * perPage)
        .limit(perPage)
        .toArray(),
    ]);

    const shaped = rows.map(({ _id, ...rest }) => ({ id: _id.toString(), ...rest }));

    res.json({ rows: shaped, total });
  } catch (err) {
    console.error('GET /api/websites failed:', err);
    res.status(500).json({ message: 'Failed to fetch websites', error: err.message });
  }
});

/**
 * GET /api/websites/my-websites  (protected — returns websites listed by current seller)
 */
router.get('/my-websites', verifyToken, async (req, res) => {
  try {
    const email = req.decoded?.email?.trim().toLowerCase();
    const collection = getDb().collection('websites');
    const rows = await collection.find({ addedBy: email }).sort({ addedAt: -1 }).toArray();
    const shaped = rows.map(({ _id, ...rest }) => ({ id: _id.toString(), ...rest }));
    res.json(shaped);
  } catch (err) {
    console.error('GET /api/websites/my-websites failed:', err);
    res.status(500).json({ message: 'Failed to fetch your websites', error: err.message });
  }
});

/**
 * POST /api/websites  (protected — requires a valid Bearer token)
 */
router.post('/', verifyToken, verifySeller, async (req, res) => {
  try {
    const body = req.body || {};
    const email = req.decoded?.email?.trim().toLowerCase();

    if (!body.domain || typeof body.domain !== 'string' || !body.domain.trim()) {
      return res.status(400).json({ message: 'domain is required' });
    }
    if (body.price === undefined || body.price === null || Number.isNaN(Number(body.price))) {
      return res.status(400).json({ message: 'price is required and must be a number' });
    }

    const doc = {
      domain: body.domain.trim(),
      addedBy: email,
      isNew: true,
      niches: Array.isArray(body.niches) ? body.niches : [],
      language: body.language || 'English',
      as: Number(body.as) || 0,
      da: Number(body.da) || 0,
      dr: Number(body.dr) || 0,
      ahrefsTraffic: Number(body.ahrefsTraffic) || 0,
      ahrefsKeywords: Number(body.ahrefsKeywords) || 0,
      semrushTraffic: Number(body.semrushTraffic) || 0,
      semrushKeywords: Number(body.semrushKeywords) || 0,
      ahrefsTrend: trendSeries(0),
      semrushTrend: trendSeries(0),
      trafficCountry: body.trafficCountry || 'US',
      trendPercent: Number(body.trendPercent) || 0,
      rules: Array.isArray(body.rules) ? body.rules.filter(Boolean) : [],
      countries: Array.isArray(body.countries) ? body.countries : [],
      backlinksCount: Number(body.backlinksCount) || 1,
      dofollow: Boolean(body.dofollow),
      linkValidity: body.linkValidity || 'Instant',
      deliveryDays: Number(body.deliveryDays) || 0,
      sportsGaming: Boolean(body.sportsGaming),
      pharmacy: Boolean(body.pharmacy),
      googleNews: Boolean(body.googleNews),
      foreignLang: Boolean(body.foreignLang),
      price: Number(body.price),
      addedAt: Date.now(),
    };

    const collection = getDb().collection('websites');
    const result = await collection.insertOne(doc);

    res.status(201).json({
      message: 'Website added successfully',
      website: { id: result.insertedId.toString(), ...doc },
    });
  } catch (err) {
    console.error('POST /api/websites failed:', err);
    res.status(500).json({ message: 'Failed to add website', error: err.message });
  }
});

/**
 * GET /api/websites/:id
 */
router.get('/:id', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid website id' });
    }
    const doc = await getDb().collection('websites').findOne({ _id: new ObjectId(req.params.id) });
    if (!doc) {
      return res.status(404).json({ message: 'Website not found' });
    }
    const { _id, ...rest } = doc;
    res.json({ id: _id.toString(), ...rest });
  } catch (err) {
    console.error('GET /api/websites/:id failed:', err);
    res.status(500).json({ message: 'Failed to fetch website', error: err.message });
  }
});

/**
 * PUT /api/websites/:id  (protected — owner or Super Admin)
 */
router.put('/:id', verifyToken, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid website id' });
    }
    const body = req.body || {};
    const email = req.decoded?.email?.trim().toLowerCase();

    if (!body.domain || typeof body.domain !== 'string' || !body.domain.trim()) {
      return res.status(400).json({ message: 'domain is required' });
    }
    if (body.price === undefined || body.price === null || Number.isNaN(Number(body.price))) {
      return res.status(400).json({ message: 'price is required and must be a number' });
    }

    const collection = getDb().collection('websites');
    const existing = await collection.findOne({ _id: new ObjectId(req.params.id) });
    if (!existing) {
      return res.status(404).json({ message: 'Website not found' });
    }

    // Authorization check
    const isSuper = isConfiguredSuperAdmin(email);
    if (!isSuper && existing.addedBy && existing.addedBy.toLowerCase() !== email) {
      const user = await getDb().collection('users').findOne({ email });
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: 'Forbidden: you can only edit your own websites' });
      }
    }

    const update = {
      domain: body.domain.trim(),
      niches: Array.isArray(body.niches) ? body.niches : [],
      language: body.language || 'English',
      as: Number(body.as) || 0,
      da: Number(body.da) || 0,
      dr: Number(body.dr) || 0,
      ahrefsTraffic: Number(body.ahrefsTraffic) || 0,
      ahrefsKeywords: Number(body.ahrefsKeywords) || 0,
      semrushTraffic: Number(body.semrushTraffic) || 0,
      semrushKeywords: Number(body.semrushKeywords) || 0,
      trafficCountry: body.trafficCountry || 'US',
      trendPercent: Number(body.trendPercent) || 0,
      rules: Array.isArray(body.rules) ? body.rules.filter(Boolean) : [],
      countries: Array.isArray(body.countries) ? body.countries : [],
      backlinksCount: Number(body.backlinksCount) || 1,
      dofollow: Boolean(body.dofollow),
      linkValidity: body.linkValidity || 'Instant',
      deliveryDays: Number(body.deliveryDays) || 0,
      sportsGaming: Boolean(body.sportsGaming),
      pharmacy: Boolean(body.pharmacy),
      googleNews: Boolean(body.googleNews),
      foreignLang: Boolean(body.foreignLang),
      price: Number(body.price),
      updatedAt: Date.now(),
    };

    await collection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });

    res.json({ message: 'Website updated successfully', website: { id: req.params.id, ...update } });
  } catch (err) {
    console.error('PUT /api/websites/:id failed:', err);
    res.status(500).json({ message: 'Failed to update website', error: err.message });
  }
});

/**
 * DELETE /api/websites/:id  (protected — owner or Super Admin)
 */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid website id' });
    }

    const email = req.decoded?.email?.trim().toLowerCase();
    const collection = getDb().collection('websites');
    const existing = await collection.findOne({ _id: new ObjectId(req.params.id) });
    if (!existing) {
      return res.status(404).json({ message: 'Website not found' });
    }

    // Authorization check
    const isSuper = isConfiguredSuperAdmin(email);
    if (!isSuper && existing.addedBy && existing.addedBy.toLowerCase() !== email) {
      const user = await getDb().collection('users').findOne({ email });
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: 'Forbidden: you can only delete your own websites' });
      }
    }

    await collection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ message: 'Website deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/websites/:id failed:', err);
    res.status(500).json({ message: 'Failed to delete website', error: err.message });
  }
});

module.exports = router;