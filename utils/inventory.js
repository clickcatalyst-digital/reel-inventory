const { queryAll, queryOne, execute, getNextReelNumber, getNextBoxNumber, nowIST } = require('../db/schema');

async function executeInward(item_code, num_reels, num_boxes, notes) {
  const item = await queryOne('SELECT * FROM items WHERE item_code = ?', [item_code]);
  if (!item) throw new Error(`Item "${item_code}" not found in catalog`);

  const totalReels = parseInt(num_reels);
  const totalBoxes = Number(num_boxes) > 0 ? Number(num_boxes) : 0;
  const createdBoxes = [];
  const createdReels = [];

  if (totalBoxes === 0) {
    for (let r = 0; r < totalReels; r++) {
      const reelNumber = await getNextReelNumber();
      await execute(
        'INSERT INTO reels (reel_number, item_code, box_number, quantity, notes, inward_date) VALUES (?, ?, ?, ?, ?, ?)',
        [reelNumber, item_code, null, item.default_spq, notes || null, nowIST()]
      );
      createdReels.push({ reel_number: reelNumber, item_code, quantity: item.default_spq, box_number: null });
    }
  } else {
    const reelsPerBox = Math.floor(totalReels / totalBoxes);
    const remainder = totalReels % totalBoxes;
    for (let b = 0; b < totalBoxes; b++) {
      const boxNumber = await getNextBoxNumber();
      const reelsInThisBox = reelsPerBox + (b < remainder ? 1 : 0);
      await execute(
        'INSERT INTO boxes (box_number, item_code, reel_count, created_at) VALUES (?, ?, ?, ?)',
        [boxNumber, item_code, reelsInThisBox, nowIST()]
      );
      const boxReels = [];
      for (let r = 0; r < reelsInThisBox; r++) {
        const reelNumber = await getNextReelNumber();
        await execute(
          'INSERT INTO reels (reel_number, item_code, box_number, quantity, notes, inward_date) VALUES (?, ?, ?, ?, ?, ?)',
          [reelNumber, item_code, boxNumber, item.default_spq, notes || null, nowIST()]
        );
        boxReels.push({ reel_number: reelNumber, item_code, quantity: item.default_spq });
        createdReels.push({ reel_number: reelNumber, item_code, quantity: item.default_spq, box_number: boxNumber });
      }
      createdBoxes.push({ box_number: boxNumber, item_code, reel_count: reelsInThisBox, reels: boxReels });
    }
  }

  return { boxes: createdBoxes, reels: createdReels };
}

async function executeOutwardReel(reel_number, customer_name, invoice_number, outward_type, quantity_shipped, notes) {
  const reel = await queryOne('SELECT * FROM reels WHERE reel_number = ?', [reel_number]);
  if (!reel) throw new Error(`Reel ${reel_number} not found`);
  if (reel.status === 'Outwarded') throw new Error(`Reel ${reel_number} already outwarded`);

  const type = outward_type || 'Full';
  let qtyShipped;

  if (type === 'Partial') {
    qtyShipped = parseInt(quantity_shipped);
    if (!qtyShipped || qtyShipped <= 0 || qtyShipped >= reel.quantity) {
      throw new Error(`Partial quantity must be between 1 and ${reel.quantity - 1}`);
    }
  } else {
    qtyShipped = reel.quantity;
  }

  await execute(
    `INSERT INTO outwards (reel_number, customer_name, invoice_number, quantity_shipped, outward_type, notes, outward_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [reel_number, customer_name.trim(), invoice_number.trim(), qtyShipped, type, notes || null, nowIST()]
  );

  if (type === 'Full') {
    await execute('UPDATE reels SET quantity = 0, status = ? WHERE reel_number = ?', ['Outwarded', reel_number]);
  } else {
    await execute('UPDATE reels SET quantity = ? WHERE reel_number = ?', [reel.quantity - qtyShipped, reel_number]);
  }

  return { qtyShipped, remaining: type === 'Full' ? 0 : reel.quantity - qtyShipped };
}

module.exports = { executeInward, executeOutwardReel };