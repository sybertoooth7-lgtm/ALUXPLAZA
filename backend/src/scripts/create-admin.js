import 'dotenv/config';
import readline from 'node:readline';
import * as bcrypt from '../lib/bcrypt-pool.js';
import db, { initDb } from '../db.js';

// Created at module load, synchronously, with no async gap before the
// first rl.question() call below. If stdin is a pipe (non-interactive
// use, e.g. a Docker entrypoint or CI step) rather than a real TTY, it
// can hit EOF and auto-close the interface as soon as something else
// (like an awaited initDb() call) delays the first question() past that
// point — any rl.question() call after that throws ERR_USE_AFTER_CLOSE,
// or silently never resolves, even though the piped input is still
// sitting there unread. So all prompting happens first, immediately;
// initDb() only runs afterward, right before it's actually needed.
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  const email = (await ask('Admin email: ')).trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Invalid email address.');
    rl.close();
    process.exit(1);
  }

  const password = await ask('Admin password: ');
  if (!password || password.length < 8) {
    console.error('Password must be at least 8 characters.');
    rl.close();
    process.exit(1);
  }

  const confirm = await ask('Confirm password: ');
  if (password !== confirm) {
    console.error('Passwords do not match.');
    rl.close();
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  try {
    // Connect and run migrations now, after prompting is done, not before —
    // see the comment above the readline interface for why.
    await initDb();
    await db.query(
      'INSERT INTO admin_users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash',
      [email, hash]
    );
    console.log(`Admin user created/updated: ${email}`);
  } catch (err) {
    console.error('Failed to create admin user:', err.message);
    rl.close();
    process.exit(1);
  }

  rl.close();
}

main();
