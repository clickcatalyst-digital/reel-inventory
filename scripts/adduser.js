// scripts/adduser.js

// USAGE: node scripts/adduser.js

require('dotenv').config();
const { initDB, createUser } = require('../db/schema');

(async () => {
  await initDB();
  await createUser('zakir', 'lstech123');
  await createUser('sahil', 'lstech123');
  console.log('Users created');
  process.exit(0);
})();