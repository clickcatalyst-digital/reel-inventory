// routes/inward.js

const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute, getNextReelNumber, getNextBoxNumber } = require('../db/schema');

router.post('/', async (req, res) => {
  const { item_code, num_reels, num_boxes, notes } = req.body;
  if (!item_code || !num_reels || num_reels < 1) {
    return res.status(400).json({ error: 'item_code and num_reels (>= 1) are required' });
  }

  const item = await queryOne('SELECT * FROM items WHERE item_code = ?', [item_code]);
  if (!item) return res.status(404).json({ error: `Item "${item_code}" not found in catalog` });

  const totalReels = parseInt(num_reels);
  const totalBoxes = Number(num_boxes) > 0 ? Number(num_boxes) : 0;

  const createdBoxes = [];
  const createdReels = [];

  try {
    if (totalBoxes === 0) {
      for (let r = 0; r < totalReels; r++) {
        const reelNumber = await getNextReelNumber();
        await execute('INSERT INTO reels (reel_number, item_code, box_number, quantity, notes) VALUES (?, ?, ?, ?, ?)',
          [reelNumber, item_code, null, item.default_spq, notes || null]);
        createdReels.push({ reel_number: reelNumber, item_code, quantity: item.default_spq, box_number: null });
      }
    } else {
      const reelsPerBox = Math.floor(totalReels / totalBoxes);
      const remainder = totalReels % totalBoxes;

      for (let b = 0; b < totalBoxes; b++) {
        const boxNumber = await getNextBoxNumber();
        const reelsInThisBox = reelsPerBox + (b < remainder ? 1 : 0);

        await execute('INSERT INTO boxes (box_number, item_code, reel_count) VALUES (?, ?, ?)',
          [boxNumber, item_code, reelsInThisBox]);

        const boxReels = [];
        for (let r = 0; r < reelsInThisBox; r++) {
          const reelNumber = await getNextReelNumber();
          await execute('INSERT INTO reels (reel_number, item_code, box_number, quantity, notes) VALUES (?, ?, ?, ?, ?)',
            [reelNumber, item_code, boxNumber, item.default_spq, notes || null]);
          boxReels.push({ reel_number: reelNumber, item_code, quantity: item.default_spq });
          createdReels.push({ reel_number: reelNumber, item_code, quantity: item.default_spq, box_number: boxNumber });
        }

        createdBoxes.push({ box_number: boxNumber, item_code, reel_count: reelsInThisBox, reels: boxReels });
      }
    }

    res.json({
      success: true,
      message: totalBoxes === 0
        ? `${createdReels.length} reel(s) inwarded for ${item_code} (no box)`
        : `${createdReels.length} reel(s) in ${createdBoxes.length} box(es) inwarded for ${item_code}`,
      boxes: createdBoxes,
      reels: createdReels
    });

  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Duplicate reel number detected. The counter may be out of sync — please try again or contact admin.' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.get('/recent', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  const reels = await queryAll(`
    SELECT r.*, i.description 
    FROM reels r 
    JOIN items i ON r.item_code = i.item_code 
    ORDER BY r.inward_date DESC 
    LIMIT ? OFFSET ?
  `, [limit, offset]);
  res.json(reels);
});

module.exports = router;