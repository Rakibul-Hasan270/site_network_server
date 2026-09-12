const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const verifyToken = require('../middleware/verifyToken');

/**
 * Helper to check if an email matches the configured Super Admin email
 */
function isConfiguredSuperAdmin(email) {
  if (!email || !process.env.SUPER_ADMIN_EMAIL) return false;
  return email.trim().toLowerCase() === process.env.SUPER_ADMIN_EMAIL.trim().toLowerCase();
}

/**
 * POST /api/orders (protected)
 * Buyer places an order.
 */
router.post('/', verifyToken, async (req, res) => {
  try {
    const email = req.decoded?.email?.trim().toLowerCase();
    const body = req.body || {};

    if (!body.domain && !body.website) {
      return res.status(400).json({ message: 'Website domain is required' });
    }

    const domain = (body.domain || body.website).trim();
    let sellerEmail = 'admin';

    // If websiteId is provided, look up the website to find the seller
    if (body.websiteId && ObjectId.isValid(body.websiteId)) {
      const siteDoc = await getDb().collection('websites').findOne({ _id: new ObjectId(body.websiteId) });
      if (siteDoc && siteDoc.addedBy) {
        sellerEmail = siteDoc.addedBy.toLowerCase();
      }
    } else {
      // Look up by domain
      const siteDoc = await getDb().collection('websites').findOne({ domain });
      if (siteDoc && siteDoc.addedBy) {
        sellerEmail = siteDoc.addedBy.toLowerCase();
      }
    }

    const orderDoc = {
      website: domain,
      websiteId: body.websiteId || null,
      buyerEmail: email,
      buyerName: body.buyerName || email.split('@')[0],
      sellerEmail,
      orderType: body.orderType || 'guestpost',
      linkType: body.linkType || 'dofollow',
      nicheCategory: body.nicheCategory || 'general',
      docLink: body.docLink || null,
      uploadedDocName: body.uploadedDocName || null,
      uploadedImageName: body.uploadedImageName || null,
      specialInstructions: body.specialInstructions || null,
      articleWriting: Boolean(body.articleWriting),
      total: Number(body.total) || 0,
      status: 'pending', // 'pending' | 'in-progress' | 'completed' | 'cancelled'
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const collection = getDb().collection('orders');
    const result = await collection.insertOne(orderDoc);

    res.status(201).json({
      message: 'Order placed successfully!',
      order: { id: result.insertedId.toString(), ...orderDoc },
    });
  } catch (err) {
    console.error('POST /api/orders failed:', err);
    res.status(500).json({ message: 'Failed to place order', error: err.message });
  }
});

/**
 * GET /api/orders/my-orders (protected — for Buyers)
 * Returns all orders placed by the current user.
 */
router.get('/my-orders', verifyToken, async (req, res) => {
  try {
    const email = req.decoded?.email?.trim().toLowerCase();
    const collection = getDb().collection('orders');
    const orders = await collection.find({ buyerEmail: email }).sort({ createdAt: -1 }).toArray();
    const shaped = orders.map(({ _id, ...rest }) => ({ id: _id.toString(), ...rest }));
    res.json(shaped);
  } catch (err) {
    console.error('GET /api/orders/my-orders failed:', err);
    res.status(500).json({ message: 'Failed to fetch your orders', error: err.message });
  }
});

/**
 * GET /api/orders/seller-orders (protected — for Sellers)
 * Returns orders placed on websites owned by the seller.
 */
router.get('/seller-orders', verifyToken, async (req, res) => {
  try {
    const email = req.decoded?.email?.trim().toLowerCase();
    const collection = getDb().collection('orders');
    const orders = await collection.find({ sellerEmail: email }).sort({ createdAt: -1 }).toArray();
    const shaped = orders.map(({ _id, ...rest }) => ({ id: _id.toString(), ...rest }));
    res.json(shaped);
  } catch (err) {
    console.error('GET /api/orders/seller-orders failed:', err);
    res.status(500).json({ message: 'Failed to fetch seller orders', error: err.message });
  }
});

/**
 * GET /api/orders (protected — Super Admin returns all orders; Seller returns their seller orders)
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const email = req.decoded?.email?.trim().toLowerCase();
    const user = await getDb().collection('users').findOne({ email });
    const isSuper = isConfiguredSuperAdmin(email) || user?.role === 'super_admin';

    const collection = getDb().collection('orders');
    let query = {};
    if (!isSuper) {
      // If not super admin, show orders where user is either buyer or seller
      query = { $or: [{ sellerEmail: email }, { buyerEmail: email }] };
    }

    const orders = await collection.find(query).sort({ createdAt: -1 }).toArray();
    const shaped = orders.map(({ _id, ...rest }) => ({ id: _id.toString(), ...rest }));
    res.json(shaped);
  } catch (err) {
    console.error('GET /api/orders failed:', err);
    res.status(500).json({ message: 'Failed to fetch orders', error: err.message });
  }
});

/**
 * PATCH /api/orders/:id/status (protected)
 * Updates order status ('pending', 'in-progress', 'completed', 'cancelled').
 */
router.patch('/:id/status', verifyToken, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid order id' });
    }

    const { status } = req.body || {};
    const validStatuses = ['pending', 'in-progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    const email = req.decoded?.email?.trim().toLowerCase();
    const collection = getDb().collection('orders');
    const order = await collection.findOne({ _id: new ObjectId(req.params.id) });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const isSuper = isConfiguredSuperAdmin(email);
    const isSeller = order.sellerEmail && order.sellerEmail.toLowerCase() === email;
    const isBuyer = order.buyerEmail && order.buyerEmail.toLowerCase() === email;

    if (!isSuper && !isSeller && !isBuyer) {
      return res.status(403).json({ message: 'Forbidden: you cannot update this order' });
    }

    // Buyers can only cancel their own pending orders
    if (isBuyer && !isSeller && !isSuper) {
      if (status !== 'cancelled') {
        return res.status(403).json({ message: 'Buyers can only cancel orders' });
      }
      if (order.status !== 'pending') {
        return res.status(400).json({ message: 'You can only cancel a pending order' });
      }
    }

    await collection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status, updatedAt: Date.now() } }
    );

    res.json({ message: `Order marked as ${status}` });
  } catch (err) {
    console.error('PATCH /api/orders/:id/status failed:', err);
    res.status(500).json({ message: 'Failed to update order status', error: err.message });
  }
});

module.exports = router;
