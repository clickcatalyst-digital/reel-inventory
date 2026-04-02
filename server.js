// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const os = require('os');
const { initDB, queryOne } = require('./db/schema');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

// Auth middleware
function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' });
  res.redirect('/login');
}

(async () => {
  await initDB();

  // Login routes (no auth required)
  app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'views', 'login.html')));

  app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const user = await queryOne('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });

    req.session.user = { id: user.id, username: user.username, role: user.role };
    res.json({ success: true, username: user.username });
  });

  app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
  });

  // All routes below require login
  app.use(requireLogin);

  app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'items.html')));
  app.get('/inward', (req, res) => res.sendFile(path.join(__dirname, 'views', 'inward.html')));
  app.get('/outward', (req, res) => res.sendFile(path.join(__dirname, 'views', 'outward.html')));
  app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard.html')));

  app.use('/api/items', require('./routes/items'));
  app.use('/api/inward', require('./routes/inward'));
  app.use('/api/outward', require('./routes/outward'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/labels', require('./utils/pdf'));

  const ips = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🔧 Reel Inventory running at:`);
    console.log(`   Local:   http://localhost:${PORT}`);
    ips.forEach(ip => console.log(`   Network: http://${ip}:${PORT}`));
    console.log('');
  });
})();