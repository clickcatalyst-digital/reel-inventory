// routes/outward.js

const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute, nowIST } = require('../db/schema');

router.get('/reel/:reelNumber', async (req, res) => {
  const reel = await queryOne(`
    SELECT r.*, i.description 
    FROM reels r 
    JOIN items i ON r.item_code = i.item_code 
    WHERE r.reel_number = ?
  `, [req.params.reelNumber]);

  if (!reel) return res.status(404).json({ error: 'Reel not found' });
  if (reel.status === 'Outwarded') return res.status(400).json({ error: 'Reel already fully outwarded', reel });
  if (reel.status === 'Deleted') return res.status(400).json({ error: 'Reel has been deleted', reel });
  res.json(reel);
});

router.get('/box/:boxNumber', async (req, res) => {
  const box = await queryOne('SELECT * FROM boxes WHERE box_number = ?', [req.params.boxNumber]);
  if (!box) return res.status(404).json({ error: 'Box not found' });

  const reels = await queryAll(`
    SELECT r.*, i.description 
    FROM reels r 
    JOIN items i ON r.item_code = i.item_code 
    WHERE r.box_number = ?
    ORDER BY r.reel_number
  `, [req.params.boxNumber]);

  const inStock = reels.filter(r => r.status === 'In Stock');
  const outwarded = reels.filter(r => r.status === 'Outwarded');

  res.json({
    box,
    reels,
    summary: {
      total: reels.length,
      in_stock: inStock.length,
      outwarded: outwarded.length,
      outwarded_reels: outwarded.map(r => r.reel_number)
    }
  });
});

router.post('/', async (req, res) => {
  const { reel_number, customer_name, invoice_number, quantity_shipped, outward_type, notes } = req.body;
  if (!reel_number || !customer_name || !invoice_number) {
    return res.status(400).json({ error: 'reel_number, customer_name, and invoice_number are required' });
  }

  const reel = await queryOne('SELECT * FROM reels WHERE reel_number = ?', [reel_number]);
  if (!reel) return res.status(404).json({ error: 'Reel not found' });
  if (reel.status === 'Outwarded') return res.status(400).json({ error: 'Reel already fully outwarded' });

  const type = outward_type || 'Full';
  let qtyShipped;

  if (type === 'Partial') {
    qtyShipped = parseInt(quantity_shipped);
    if (!qtyShipped || qtyShipped <= 0 || qtyShipped >= reel.quantity) {
      return res.status(400).json({ error: `Partial quantity must be between 1 and ${reel.quantity - 1}` });
    }
  } else {
    qtyShipped = reel.quantity;
  }

  try {
    await execute(`INSERT INTO outwards (reel_number, customer_name, invoice_number, quantity_shipped, outward_type, notes, outward_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [reel_number, customer_name.trim(), invoice_number.trim(), qtyShipped, type, notes || null, nowIST()]);

    if (type === 'Full') {
      await execute('UPDATE reels SET quantity = 0, status = ? WHERE reel_number = ?', ['Outwarded', reel_number]);
    } else {
      await execute('UPDATE reels SET quantity = ? WHERE reel_number = ?', [reel.quantity - qtyShipped, reel_number]);
    }

    res.json({
      success: true,
      message: `${type} outward recorded: ${qtyShipped} units from ${reel_number}`,
      remaining: type === 'Full' ? 0 : reel.quantity - qtyShipped
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/box', async (req, res) => {
  const { box_number, customer_name, invoice_number, notes } = req.body;
  if (!box_number || !customer_name || !invoice_number) {
    return res.status(400).json({ error: 'box_number, customer_name, and invoice_number are required' });
  }

  const box = await queryOne('SELECT * FROM boxes WHERE box_number = ?', [box_number]);
  if (!box) return res.status(404).json({ error: 'Box not found' });

  const reels = await queryAll('SELECT * FROM reels WHERE box_number = ?', [box_number]);
  const inStock = reels.filter(r => r.status === 'In Stock');
  const alreadyOutwarded = reels.filter(r => r.status === 'Outwarded');

  if (inStock.length === 0) {
    return res.status(400).json({
      error: 'All reels in this box are already outwarded',
      outwarded_reels: alreadyOutwarded.map(r => r.reel_number)
    });
  }

  const results = { success: [], skipped: [] };

  try {
    for (const reel of reels) {
      if (reel.status === 'Outwarded') {
        results.skipped.push({ reel_number: reel.reel_number, reason: 'Already outwarded' });
        continue;
      }

      await execute(`INSERT INTO outwards (reel_number, customer_name, invoice_number, quantity_shipped, outward_type, notes, outward_date)
        VALUES (?, ?, ?, ?, 'Full', ?, ?)`,
        [reel.reel_number, customer_name.trim(), invoice_number.trim(), reel.quantity, notes || null, nowIST()]);

      await execute('UPDATE reels SET quantity = 0, status = ? WHERE reel_number = ?', ['Outwarded', reel.reel_number]);
      results.success.push(reel.reel_number);
    }

    let message = `${results.success.length} reel(s) outwarded from ${box_number}`;
    if (results.skipped.length > 0) {
      message += `. ${results.skipped.length} reel(s) skipped (already outwarded: ${results.skipped.map(s => s.reel_number).join(', ')})`;
    }

    res.json({ success: true, message, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/recent', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const outwards = await queryAll(`
    SELECT o.*, r.item_code, r.box_number, i.description
    FROM outwards o
    JOIN reels r ON o.reel_number = r.reel_number
    JOIN items i ON r.item_code = i.item_code
    ORDER BY o.outward_date DESC
    LIMIT ?
  `, [limit]);
  res.json(outwards);
});

router.post('/undo', async (req, res) => {
  const { outward_id, password } = req.body;

  if (password !== 'admin123') {
    return res.status(403).json({ error: 'Incorrect password' });
  }

  if (!outward_id) {
    return res.status(400).json({ error: 'outward_id is required' });
  }

  // Get the outward record
  const outward = await queryOne('SELECT * FROM outwards WHERE id = ?', [outward_id]);
  if (!outward) return res.status(404).json({ error: 'Outward record not found' });

  // Get the reel
  const reel = await queryOne('SELECT * FROM reels WHERE reel_number = ?', [outward.reel_number]);
  if (!reel) return res.status(404).json({ error: 'Reel not found' });

  try {
    // Restore reel quantity and status
    const restoredQty = reel.quantity + outward.quantity_shipped;
    await execute(
      'UPDATE reels SET quantity = ?, status = ? WHERE reel_number = ?',
      [restoredQty, 'In Stock', outward.reel_number]
    );

    // Delete the outward record
    await execute('DELETE FROM outwards WHERE id = ?', [outward_id]);

    res.json({
      success: true,
      message: `Outward undone — ${outward.reel_number} restored to In Stock with qty ${restoredQty}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;