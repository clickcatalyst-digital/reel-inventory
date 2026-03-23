// utils/qr.js
const QRCode = require('qrcode');

// Strip REEL- prefix so QR encodes just the number
function stripPrefix(text) {
  return text.replace('REEL-', '').replace('BOX-', '');
}

// Generate QR code as data URL (base64 PNG)
async function generateQRDataURL(text) {
  return await QRCode.toDataURL(stripPrefix(text), {
    width: 200,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' }
  });
}

// Generate QR code as buffer (for PDF embedding)
async function generateQRBuffer(text) {
  return await QRCode.toBuffer(stripPrefix(text), {
    width: 200,
    margin: 1,
    type: 'png'
  });
}

module.exports = { generateQRDataURL, generateQRBuffer };