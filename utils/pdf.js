// utils/pdf.js
const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const { generateQRBuffer } = require('./qr');
const { queryAll } = require('../db/schema');

const mm = (v) => v * 2.83465;

const LABEL_W = mm(85);
const LABEL_H = mm(24);
const HALF_W = LABEL_W / 2;
const QR_SIZE = mm(20);   // Biggest QR that fits in 24mm height with minimal padding
const PAD = mm(1.5);

router.post('/generate', async (req, res) => {
  const { reel_numbers } = req.body;

  if (!reel_numbers || !reel_numbers.length) {
    return res.status(400).json({ error: 'reel_numbers array is required' });
  }

  const placeholders = reel_numbers.map(() => '?').join(',');
  const reels = queryAll(`
    SELECT r.reel_number, r.item_code, r.quantity, r.inward_date, i.description
    FROM reels r
    JOIN items i ON r.item_code = i.item_code
    WHERE r.reel_number IN (${placeholders})
  `, reel_numbers);

  if (!reels.length) return res.status(404).json({ error: 'No reels found' });

  const doc = new PDFDocument({
    size: [LABEL_W, LABEL_H],
    margins: { top: 0, bottom: 0, left: 0, right: 0 }
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=labels_${Date.now()}.pdf`);
  doc.pipe(res);

  const qrY = (LABEL_H - QR_SIZE) / 2; // vertically center QR

  for (let i = 0; i < reels.length; i += 2) {
    if (i > 0) doc.addPage();

    const pair = [reels[i], reels[i + 1]].filter(Boolean);

    for (let s = 0; s < pair.length; s++) {
      const reel = pair[s];
      const xOffset = s * HALF_W;

      const qrBuffer = await generateQRBuffer(reel.reel_number);

      const dateStr = reel.inward_date
        ? new Date(reel.inward_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';
      const timeStr = reel.inward_date
        ? new Date(reel.inward_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        : '';

      // QR code - vertically centered
      doc.image(qrBuffer, xOffset + PAD, qrY, { width: QR_SIZE, height: QR_SIZE });

      // Text area - starts aligned with top of QR
      const textX = xOffset + PAD + QR_SIZE + mm(2);
      const textW = HALF_W - QR_SIZE - PAD * 2 - mm(2);
      const textTopY = qrY + mm(0.7); // align first line with QR top edge

      // Reel number - big and bold (just the number)
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000');
      doc.text(reel.reel_number.replace('REEL-', ''), textX, textTopY, { width: textW, lineBreak: false });

      // Item code
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#222222');
      doc.text(reel.item_code, textX, textTopY + mm(4.5), { width: textW, lineBreak: false });

      // Quantity
      doc.fontSize(7).font('Helvetica').fillColor('#333333');
      doc.text(`Qty: ${reel.quantity.toLocaleString()}`, textX, textTopY + mm(9), { width: textW, lineBreak: false });

      // Date + Time
      doc.fontSize(7).font('Helvetica').fillColor('#555555');
      doc.text(`${dateStr}  ${timeStr}`, textX, textTopY + mm(13), { width: textW, lineBreak: false });
    }

    // Center divider
    doc.moveTo(HALF_W, mm(1)).lineTo(HALF_W, LABEL_H - mm(1)).stroke('#cccccc');
  }

  doc.end();
});

// POST generate box labels (1 box per label page)
router.post('/generate-box', async (req, res) => {
  const { box_numbers } = req.body;

  if (!box_numbers || !box_numbers.length) {
    return res.status(400).json({ error: 'box_numbers array is required' });
  }

  const boxes = [];
  for (const bn of box_numbers) {
    const box = queryAll(`
      SELECT b.box_number, b.item_code, b.reel_count, i.description,
        GROUP_CONCAT(r.reel_number) as reel_list
      FROM boxes b
      JOIN items i ON b.item_code = i.item_code
      LEFT JOIN reels r ON r.box_number = b.box_number
      WHERE b.box_number = ?
      GROUP BY b.box_number
    `, [bn]);
    if (box.length) boxes.push(box[0]);
  }

  if (!boxes.length) return res.status(404).json({ error: 'No boxes found' });

  const doc = new PDFDocument({
    size: [LABEL_W, LABEL_H],
    margins: { top: 0, bottom: 0, left: 0, right: 0 }
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=box_labels_${Date.now()}.pdf`);
  doc.pipe(res);

  const qrY = (LABEL_H - QR_SIZE) / 2;

  for (let i = 0; i < boxes.length; i++) {
    if (i > 0) doc.addPage();
    const box = boxes[i];

    const qrBuffer = await generateQRBuffer(box.box_number);

    doc.image(qrBuffer, PAD, qrY, { width: QR_SIZE, height: QR_SIZE });

    const textX = PAD + QR_SIZE + mm(2);
    const textW = LABEL_W - QR_SIZE - PAD * 2 - mm(2);
    const textTopY = qrY + mm(0.5);

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000');
    doc.text(box.box_number.replace('BOX-', 'BOX '), textX, textTopY, { width: textW, lineBreak: false });

    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#222222');
    doc.text(`${box.item_code}  (${box.reel_count} reels)`, textX, textTopY + mm(4.5), { width: textW, lineBreak: false });

    doc.fontSize(5.5).font('Helvetica').fillColor('#444444');
    const reelNums = box.reel_list ? box.reel_list.replace(/REEL-/g, '').split(',').join(', ') : '';
    doc.text(`Reels: ${reelNums}`, textX, textTopY + mm(9), { width: textW, lineBreak: false });

    doc.fontSize(5).font('Helvetica').fillColor('#666666');
    doc.text(box.description || '', textX, textTopY + mm(13), { width: textW, lineBreak: false });
  }

  doc.end();
});

// POST generate A4 packing list PDF
router.post('/packing-list', async (req, res) => {
  const { customer_name, invoice_number, reels } = req.body;

  if (!customer_name || !invoice_number || !reels || !reels.length) {
    return res.status(400).json({ error: 'customer_name, invoice_number, and reels array required' });
  }

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 40, bottom: 40, left: 40, right: 40 }
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=packing_list_${invoice_number}_${Date.now()}.pdf`);
  doc.pipe(res);

  const pageW = 595.28 - 80; // A4 width minus margins

  // Header
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#000000');
  doc.text('PACKING LIST', 40, 40, { width: pageW, align: 'center' });

  doc.moveTo(40, 68).lineTo(40 + pageW, 68).lineWidth(2).stroke('#000000');

  // Customer & Invoice info
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333');
  doc.text('Customer:', 40, 80);
  doc.font('Helvetica').text(customer_name, 110, 80);

  doc.font('Helvetica-Bold').text('Invoice:', 40, 96);
  doc.font('Helvetica').text(invoice_number, 110, 96);

  doc.font('Helvetica-Bold').text('Date:', 350, 80);
  doc.font('Helvetica').text(new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }), 390, 80);

  doc.font('Helvetica-Bold').text('Total Reels:', 350, 96);
  doc.font('Helvetica').text(String(reels.length), 420, 96);

  // Table header
  const tableTop = 125;
  const col = { sn: 40, reel: 80, item: 180, box: 320, qty: 410, qr: 470 };

  doc.moveTo(40, tableTop).lineTo(40 + pageW, tableTop).lineWidth(1).stroke('#cccccc');

  doc.fontSize(8).font('Helvetica-Bold').fillColor('#666666');
  doc.text('#', col.sn, tableTop + 6);
  doc.text('REEL NUMBER', col.reel, tableTop + 6);
  doc.text('ITEM CODE', col.item, tableTop + 6);
  doc.text('BOX', col.box, tableTop + 6);
  doc.text('QUANTITY', col.qty, tableTop + 6);

  doc.moveTo(40, tableTop + 20).lineTo(40 + pageW, tableTop + 20).lineWidth(1).stroke('#cccccc');

  // Table rows
  let y = tableTop + 28;
  let totalQty = 0;

  for (let i = 0; i < reels.length; i++) {
    const r = reels[i];
    totalQty += r.quantity || 0;

    // New page if needed
    if (y > 760) {
      doc.addPage();
      y = 50;

      // Repeat header on new page
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#666666');
      doc.text('#', col.sn, y);
      doc.text('REEL NUMBER', col.reel, y);
      doc.text('ITEM CODE', col.item, y);
      doc.text('BOX', col.box, y);
      doc.text('QUANTITY', col.qty, y);
      doc.moveTo(40, y + 14).lineTo(40 + pageW, y + 14).lineWidth(1).stroke('#cccccc');
      y += 22;
    }

    // Alternate row background
    if (i % 2 === 0) {
      doc.rect(40, y - 4, pageW, 18).fill('#f8f8f5');
    }

    doc.fontSize(9).font('Helvetica').fillColor('#333333');
    doc.text(String(i + 1), col.sn, y);
    doc.font('Helvetica-Bold').text(r.reel_number, col.reel, y);
    doc.font('Helvetica').text(r.item_code, col.item, y);
    doc.text(r.box_number || '—', col.box, y);
    doc.text(r.quantity ? r.quantity.toLocaleString() : '—', col.qty, y);

    y += 18;
  }

  // Total row
  doc.moveTo(40, y + 2).lineTo(40 + pageW, y + 2).lineWidth(1).stroke('#cccccc');
  y += 10;
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000');
  doc.text('TOTAL', col.item, y);
  doc.text(`${reels.length} reels`, col.box, y);
  doc.text(totalQty.toLocaleString(), col.qty, y);

  // Footer
  y += 40;
  doc.moveTo(40, y).lineTo(40 + pageW, y).dash(2, { space: 2 }).stroke('#cccccc');
  doc.undash();
  y += 15;

  doc.fontSize(8).font('Helvetica').fillColor('#999999');
  doc.text('Receiver Signature: ________________________', 40, y);
  doc.text('Date: ________________________', 350, y);

  y += 30;
  doc.text('Checked by: ________________________', 40, y);
  doc.text('Remarks: ________________________', 350, y);

  doc.end();
});

module.exports = router;