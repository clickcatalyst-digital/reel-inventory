// routes/items.js

const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute } = require('../db/schema');

router.get('/', async (req, res) => {
  const items = await queryAll('SELECT * FROM items ORDER BY created_at DESC');
  res.json(items);
});

router.get('/:itemCode', async (req, res) => {
  const item = await queryOne('SELECT * FROM items WHERE item_code = ?', [req.params.itemCode]);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(item);
});

router.post('/', async (req, res) => {
  const { item_code, description, default_spq } = req.body;
  if (!item_code || !description || !default_spq) {
    return res.status(400).json({ error: 'item_code, description, and default_spq are required' });
  }
  try {
    await execute('INSERT INTO items (item_code, description, default_spq) VALUES (?, ?, ?)',
      [item_code.trim().toUpperCase(), description.trim(), parseInt(default_spq)]);
    res.json({ success: true, message: `Item ${item_code} added` });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: `Item code "${item_code}" already exists` });
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/:itemCode', async (req, res) => {
  const { description, default_spq } = req.body;
  const result = await execute('UPDATE items SET description = ?, default_spq = ? WHERE item_code = ?',
    [description.trim(), parseInt(default_spq), req.params.itemCode]);
  if (result.changes === 0) return res.status(404).json({ error: 'Item not found' });
  res.json({ success: true, message: 'Item updated' });
});

router.delete('/:itemCode', async (req, res) => {
  const reelCount = await queryOne('SELECT COUNT(*) as count FROM reels WHERE item_code = ?', [req.params.itemCode]);
  if (reelCount && reelCount.count > 0) {
    return res.status(400).json({ error: `Cannot delete - ${reelCount.count} reels exist for this item` });
  }
  const result = await execute('DELETE FROM items WHERE item_code = ?', [req.params.itemCode]);
  if (result.changes === 0) return res.status(404).json({ error: 'Item not found' });
  res.json({ success: true, message: 'Item deleted' });
});

module.exports = router;