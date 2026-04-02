// scripts/adduser.js

// USAGE: node scripts/adduser.js

// Terminal will prompt:

// Username: zakir
// Password: pwd
// Role (user/admin) [default: user]: user
// ✅ User "zakir" created successfully

require('dotenv').config();
const readline = require('readline');
const { initDB, createUser } = require('./db/schema');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

(async () => {
  await initDB();

  const username = await ask('Username: ');
  const password = await ask('Password: ');
  const role = await ask('Role (user/admin) [default: user]: ');

  if (!username.trim() || !password.trim()) {
    console.log('❌ Username and password are required');
    process.exit(1);
  }

  try {
    await createUser(username.trim(), password.trim(), role.trim() || 'user');
    console.log(`✅ User "${username.trim()}" created successfully`);
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      console.log(`❌ Username "${username.trim()}" already exists`);
    } else {
      console.log(`❌ Failed: ${err.message}`);
    }
  }

  rl.close();
  process.exit(0);
})();