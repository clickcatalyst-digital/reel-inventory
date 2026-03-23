// routes/dashboard.js
const express = require('express');
const router = express.Router();
const { queryAll } = require('../db/schema');

router.get('/search', (req, res) => {
  const { reel_number, item_code, customer, invoice, status, box_number, date_from, date_to } = req.query;

  let query = `
    SELECT r.*, i.description,
      (SELECT GROUP_CONCAT(
        o.customer_name || '|' || o.invoice_number || '|' || o.quantity_shipped || '|' || o.outward_type || '|' || o.outward_date, ';;'
      ) FROM outwards o WHERE o.reel_number = r.reel_number) as outward_history
    FROM reels r
    JOIN items i ON r.item_code = i.item_code
    WHERE 1=1
  `;
  const params = [];

  if (reel_number) { query += ' AND r.reel_number LIKE ?'; params.push(`%${reel_number}%`); }
  if (item_code) { query += ' AND r.item_code LIKE ?'; params.push(`%${item_code}%`); }
  if (box_number) { query += ' AND r.box_number LIKE ?'; params.push(`%${box_number}%`); }
  if (customer) { query += ' AND r.reel_number IN (SELECT reel_number FROM outwards WHERE customer_name LIKE ?)'; params.push(`%${customer}%`); }
  if (invoice) { query += ' AND r.reel_number IN (SELECT reel_number FROM outwards WHERE invoice_number LIKE ?)'; params.push(`%${invoice}%`); }
  if (status) { query += ' AND r.status = ?'; params.push(status); }
  if (date_from) { query += ' AND r.inward_date >= ?'; params.push(date_from); }
  if (date_to) { query += ' AND r.inward_date <= ?'; params.push(date_to + ' 23:59:59'); }

  query += ' ORDER BY r.inward_date DESC LIMIT 500';

  const results = queryAll(query, params);

  const parsed = results.map(r => {
    const history = r.outward_history
      ? r.outward_history.split(';;').map(entry => {
          const [customer_name, invoice_number, quantity_shipped, outward_type, outward_date] = entry.split('|');
          return { customer_name, invoice_number, quantity_shipped: parseInt(quantity_shipped), outward_type, outward_date };
        })
      : [];
    return { ...r, outward_history: history };
  });

  res.json(parsed);
});

router.get('/stock-summary', (req, res) => {
  const as_on_date = req.query.as_on_date;
  let query;
  let params = [];

  if (as_on_date) {
    query = `
      SELECT i.item_code, i.description, i.default_spq,
        COUNT(r.id) as total_reels,
        SUM(CASE WHEN r.status = 'In Stock' THEN 1 ELSE 0 END) as in_stock_reels,
        SUM(CASE WHEN r.status = 'In Stock' THEN r.quantity ELSE 0 END) as total_quantity
      FROM items i
      LEFT JOIN reels r ON i.item_code = r.item_code AND r.inward_date <= ?
      GROUP BY i.item_code ORDER BY i.item_code
    `;
    params.push(as_on_date + ' 23:59:59');
  } else {
    query = `
      SELECT i.item_code, i.description, i.default_spq,
        COUNT(r.id) as total_reels,
        SUM(CASE WHEN r.status = 'In Stock' THEN 1 ELSE 0 END) as in_stock_reels,
        SUM(CASE WHEN r.status = 'In Stock' THEN r.quantity ELSE 0 END) as total_quantity
      FROM items i
      LEFT JOIN reels r ON i.item_code = r.item_code
      GROUP BY i.item_code ORDER BY i.item_code
    `;
  }

  res.json(queryAll(query, params));
});

router.get('/export', (req, res) => {
  const { status, as_on_date } = req.query;
  let query = `
    SELECT r.reel_number, r.item_code, i.description, r.quantity, r.status, r.inward_date,
      o.customer_name, o.invoice_number, o.quantity_shipped, o.outward_type, o.outward_date
    FROM reels r
    JOIN items i ON r.item_code = i.item_code
    LEFT JOIN outwards o ON r.reel_number = o.reel_number
    WHERE 1=1
  `;
  const params = [];

  if (status) { query += ' AND r.status = ?'; params.push(status); }
  if (as_on_date) { query += ' AND r.inward_date <= ?'; params.push(as_on_date + ' 23:59:59'); }
  query += ' ORDER BY r.reel_number';

  const rows = queryAll(query, params);
  const headers = 'Reel Number,Item Code,Description,Quantity,Status,Inward Date,Customer,Invoice,Qty Shipped,Outward Type,Outward Date';
  const csvRows = rows.map(r =>
    [r.reel_number, r.item_code, `"${r.description}"`, r.quantity, r.status, r.inward_date,
     r.customer_name || '', r.invoice_number || '', r.quantity_shipped || '', r.outward_type || '', r.outward_date || ''
    ].join(',')
  );

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=inventory_${new Date().toISOString().split('T')[0]}.csv`);
  res.send([headers, ...csvRows].join('\n'));
});

module.exports = router;
