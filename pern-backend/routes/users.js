/**
 * Users Routes — user management
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireRole } = require('../middleware/rbac');
const { sendError } = require('../middleware/error-handler');

router.get('/', async (req, res) => {
  try {
    const users = await db.getUsers(req.query.orgId);
    res.json(users);
  } catch { res.json([]); }
});

router.get('/:id', async (req, res) => {
  try {
    const user = await db.getUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch { res.status(404).json({ error: 'User not found' }); }
});

router.post('/', requireRole('admin'), async (req, res) => {
  const { id, email, name, role, organization_id } = req.body;
  if (!id || !email) return res.status(400).json({ error: 'id and email required' });
  try {
    await db.upsertUser({ id, email, name, role, organization_id });
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    await db.deleteUser(req.params.id);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

module.exports = router;
