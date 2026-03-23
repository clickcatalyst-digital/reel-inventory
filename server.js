const express = require('express');
const path = require('path');
const { initDB } = require('./db/schema');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Initialize database and start server
(async () => {
  const db = await initDB();
  app.locals.db = db;

  // --- HTML Page Routes ---
  app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'items.html')));
  app.get('/inward', (req, res) => res.sendFile(path.join(__dirname, 'views', 'inward.html')));
  app.get('/outward', (req, res) => res.sendFile(path.join(__dirname, 'views', 'outward.html')));
  app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard.html')));

  // --- API Routes ---
  app.use('/api/items', require('./routes/items'));
  app.use('/api/inward', require('./routes/inward'));
  app.use('/api/outward', require('./routes/outward'));
  app.use('/api/dashboard', require('./routes/dashboard'));

  // --- QR Label PDF Route ---
  app.use('/api/labels', require('./utils/pdf'));

  // Start server on all interfaces (0.0.0.0) so it's accessible on LAN
  // app.listen(PORT, '0.0.0.0', () => {
  //   console.log(`\n🔧 Reel Inventory running at:`);
  //   console.log(`   Local:   http://localhost:${PORT}`);
  //   console.log(`   Network: http://<your-ip>:${PORT}\n`);
  // });

  const fs = require('fs');
  const https = require('https');
  const path = require('path');

  // Try HTTPS first, fallback to HTTP
  const certPath = path.join(__dirname, '192.168.1.50+2.pem');
  const keyPath = path.join(__dirname, '192.168.1.50+2-key.pem');

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    const options = {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath)
    };
    https.createServer(options, app).listen(PORT, '0.0.0.0', () => {
      console.log(`\n🔧 Reel Inventory (HTTPS) running at:`);
      console.log(`   Local:   https://localhost:${PORT}`);
      console.log(`   Network: https://192.168.1.50:${PORT}\n`);
    });
  } else {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🔧 Reel Inventory (HTTP) running at:`);
      console.log(`   Local:   http://localhost:${PORT}`);
      console.log(`   Network: http://<your-ip>:${PORT}\n`);
    });
  }
})();
