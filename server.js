// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const os = require('os');
const { initDB } = require('./db/schema');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));

(async () => {
  const db = await initDB();
  app.locals.db = db;

  app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'items.html')));
  app.get('/inward', (req, res) => res.sendFile(path.join(__dirname, 'views', 'inward.html')));
  app.get('/outward', (req, res) => res.sendFile(path.join(__dirname, 'views', 'outward.html')));
  app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard.html')));

  app.use('/api/items', require('./routes/items'));
  app.use('/api/inward', require('./routes/inward'));
  app.use('/api/outward', require('./routes/outward'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/labels', require('./utils/pdf'));

  // Find cert files (any .pem files in project root)
  const files = fs.readdirSync(__dirname);
  const certFile = files.find(f => f.endsWith('.pem') && !f.endsWith('-key.pem'));
  const keyFile = files.find(f => f.endsWith('-key.pem'));

  const ips = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }

  if (certFile && keyFile) {
    const options = {
      cert: fs.readFileSync(path.join(__dirname, certFile)),
      key: fs.readFileSync(path.join(__dirname, keyFile))
    };
    https.createServer(options, app).listen(PORT, '0.0.0.0', () => {
      console.log(`\n🔧 Reel Inventory (HTTPS) running at:`);
      console.log(`   Local:   https://localhost:${PORT}`);
      ips.forEach(ip => console.log(`   Network: https://${ip}:${PORT}`));
      console.log('');
    });
  } else {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🔧 Reel Inventory (HTTP) running at:`);
      console.log(`   Local:   http://localhost:${PORT}`);
      ips.forEach(ip => console.log(`   Network: http://${ip}:${PORT}`));
      console.log(`\n   No .pem cert files found. To enable HTTPS run:`);
      console.log(`   mkcert <your-ip> localhost 127.0.0.1\n`);
    });
  }
})();