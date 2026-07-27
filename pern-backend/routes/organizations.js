/**
 * Organizations Routes — organization management and team members
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireRole } = require('../middleware/rbac');

router.get('/', async (req, res) => {
  try {
    const orgs = await db.getOrganizations();
    res.json(orgs);
  } catch { res.json([]); }
});

router.get('/:id', async (req, res) => {
  try {
    const org = await db.getOrganization(req.params.id);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    res.json(org);
  } catch { res.status(404).json({ error: 'Organization not found' }); }
});

router.post('/', requireRole('admin'), async (req, res) => {
  const { id, name, description, ownerId, settings } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name required' });
  try {
    await db.upsertOrganization({ id, name, description, ownerId, settings });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    await db.deleteOrganization(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/members', async (req, res) => {
  try {
    const members = await db.getTeamMembers(req.params.id);
    res.json(members);
  } catch { res.json([]); }
});

router.post('/:id/members', async (req, res) => {
  try {
    await db.addTeamMember({ orgId: req.params.id, ...req.body });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/members/:userId', async (req, res) => {
  try {
    await db.removeTeamMember(req.params.id, req.params.userId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/members/:userId/role', async (req, res) => {
  try {
    if (!req.body?.role) return res.status(400).json({ error: 'role required' });
    await db.updateTeamMemberRole(req.params.id, req.params.userId, req.body.role);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
