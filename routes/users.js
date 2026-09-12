const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const verifyToken = require('../middleware/verifyToken');
const verifyAdmin = require('../middleware/verifyAdmin');

/**
 * Helper to check if an email matches the configured Super Admin email
 */
function isConfiguredSuperAdmin(email) {
  if (!email || !process.env.SUPER_ADMIN_EMAIL) return false;
  return email.trim().toLowerCase() === process.env.SUPER_ADMIN_EMAIL.trim().toLowerCase();
}

/**
 * GET /users (protected — Super Admin only)
 * Lists all registered users.
 */
router.get('/', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const users = await getDb().collection('users').find().toArray();
    const shaped = users.map(({ _id, ...rest }) => ({
      id: _id.toString(),
      role: isConfiguredSuperAdmin(rest.email) ? 'super_admin' : (rest.role || 'buyer'),
      activeRole: isConfiguredSuperAdmin(rest.email) ? 'super_admin' : (rest.activeRole || rest.role || 'buyer'),
      ...rest,
    }));
    res.json(shaped);
  } catch (err) {
    console.error('GET /users failed:', err);
    res.status(500).json({ message: 'Failed to fetch users', error: err.message });
  }
});

/**
 * GET /users/role/:email
 * Public/auth check: returns the role & activeRole for a given email.
 * Also responds to /users/admin/:email for legacy/hook compatibility.
 */
router.get(['/role/:email', '/admin/:email'], async (req, res) => {
  try {
    const email = req.params.email?.trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    if (isConfiguredSuperAdmin(email)) {
      return res.json({ role: 'super_admin', activeRole: 'super_admin', admin: true });
    }

    const user = await getDb().collection('users').findOne({ email });
    if (!user) {
      return res.json({ role: 'buyer', activeRole: 'buyer', admin: false });
    }

    const role = user.role || 'buyer';
    const activeRole = user.activeRole || role;
    res.json({
      role,
      activeRole,
      admin: role === 'super_admin',
    });
  } catch (err) {
    console.error('GET /users/role/:email failed:', err);
    res.status(500).json({ message: 'Failed to fetch role', error: err.message });
  }
});

/**
 * POST /users
 * Creates or syncs user document in MongoDB upon Firebase signup/login.
 * Default role is 'buyer' unless matches SUPER_ADMIN_EMAIL.
 */
router.post('/', async (req, res) => {
  try {
    const user = req.body;
    if (!user?.email) {
      return res.status(400).json({ message: 'email is required' });
    }

    const email = user.email.trim().toLowerCase();
    const collection = getDb().collection('users');
    const existing = await collection.findOne({ email });

    const isSuper = isConfiguredSuperAdmin(email);

    if (existing) {
      // If configured as super admin in env, make sure the role in DB is updated to super_admin
      if (isSuper && existing.role !== 'super_admin') {
        await collection.updateOne({ email }, { $set: { role: 'super_admin', activeRole: 'super_admin' } });
      }
      return res.send({
        message: 'user already exists',
        insertedId: existing._id.toString(),
        role: isSuper ? 'super_admin' : (existing.role || 'buyer'),
        activeRole: isSuper ? 'super_admin' : (existing.activeRole || existing.role || 'buyer'),
      });
    }

    const initialRole = isSuper ? 'super_admin' : 'buyer';
    const doc = {
      ...user,
      email,
      role: initialRole,
      activeRole: initialRole,
      createdAt: Date.now(),
    };

    const result = await collection.insertOne(doc);
    res.send({
      ...result,
      role: initialRole,
      activeRole: initialRole,
    });
  } catch (err) {
    console.error('POST /users failed:', err);
    res.status(500).json({ message: 'Failed to save user', error: err.message });
  }
});

/**
 * PATCH /users/switch-role (protected — for regular users)
 * Allows non-super-admin users to toggle between 'buyer' and 'seller'.
 * Body: { role: 'buyer' | 'seller' }
 */
router.patch('/switch-role', verifyToken, async (req, res) => {
  try {
    const email = req.decoded?.email?.trim().toLowerCase();
    if (!email) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const collection = getDb().collection('users');
    const user = await collection.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Super Admins don't lose super_admin status
    if (user.role === 'super_admin' || isConfiguredSuperAdmin(email)) {
      return res.json({
        message: 'Super Admin maintains all privileges',
        role: 'super_admin',
        activeRole: 'super_admin',
      });
    }

    const targetRole = req.body?.role === 'seller' ? 'seller' : 'buyer';
    await collection.updateOne(
      { email },
      { $set: { role: targetRole, activeRole: targetRole, updatedAt: Date.now() } }
    );

    res.json({
      message: `Switched to ${targetRole} mode successfully`,
      role: targetRole,
      activeRole: targetRole,
    });
  } catch (err) {
    console.error('PATCH /users/switch-role failed:', err);
    res.status(500).json({ message: 'Failed to switch role', error: err.message });
  }
});

/**
 * PATCH /users/admin/role/:id (protected — Super Admin only)
 * Updates the role of any user.
 * Body: { role: 'super_admin' | 'seller' | 'buyer' }
 */
router.patch('/admin/role/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const { role } = req.body || {};
    if (!['super_admin', 'seller', 'buyer'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Must be super_admin, seller, or buyer' });
    }

    const collection = getDb().collection('users');
    const result = await collection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { role, activeRole: role, updatedAt: Date.now() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: `Role updated to ${role} successfully` });
  } catch (err) {
    console.error('PATCH /users/admin/role/:id failed:', err);
    res.status(500).json({ message: 'Failed to update user role', error: err.message });
  }
});

/**
 * PATCH /users/:email (protected)
 * Updates profile fields (name, image). Must be the account owner or Super Admin.
 */
router.patch('/:email', verifyToken, async (req, res) => {
  try {
    const targetEmail = req.params.email?.trim().toLowerCase();
    const callerEmail = req.decoded?.email?.trim().toLowerCase();

    // Verify ownership or admin
    if (callerEmail !== targetEmail && !isConfiguredSuperAdmin(callerEmail)) {
      const caller = await getDb().collection('users').findOne({ email: callerEmail });
      if (caller?.role !== 'super_admin') {
        return res.status(403).json({ message: 'Forbidden: you cannot edit another user profile' });
      }
    }

    const { name, image } = req.body || {};
    const update = {};
    if (name !== undefined) update.name = name;
    if (image !== undefined) update.image = image;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: 'Nothing to update' });
    }

    const result = await getDb()
      .collection('users')
      .updateOne({ email: targetEmail }, { $set: update });

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error('PATCH /users/:email failed:', err);
    res.status(500).json({ message: 'Failed to update profile', error: err.message });
  }
});

/**
 * DELETE /users/:id (protected — Super Admin only)
 */
router.delete('/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const collection = getDb().collection('users');
    const target = await collection.findOne({ _id: new ObjectId(req.params.id) });
    if (!target) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Protect caller from deleting themselves
    if (target.email === req.decoded?.email) {
      return res.status(400).json({ message: 'You cannot delete your own Super Admin account' });
    }

    const result = await collection.deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User removed successfully' });
  } catch (err) {
    console.error('DELETE /users/:id failed:', err);
    res.status(500).json({ message: 'Failed to delete user', error: err.message });
  }
});

module.exports = router;