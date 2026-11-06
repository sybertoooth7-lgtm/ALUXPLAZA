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

// Suppresses echo while the admin types a password, so it is not left in the
// terminal scrollback, a screen recording or a shared session. Readline echoes
// every keystroke through this hook; hiding the prompt too and printing it
// ourselves keeps the question visible. Piped stdin is not echoed anyway and
// raw key handling would break scripts that feed the password in, so that path
// uses the ordinary prompt.
async function askHidden(question) {
  if (!process.stdin.isTTY) return ask(question);

  rl.output.write(question);
  const original = rl._writeToOutput;
  rl._writeToOutput = () => {};
  try {
    return await new Promise((resolve) => rl.question('', resolve));
  } finally {
    rl._writeToOutput = original;
    rl.output.write('\n');
  }
}

async function main() {
  const email = (await ask('Admin email: ')).trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Invalid email address.');
    rl.close();
    process.exit(1);
  }

  // Trimmed to match /api/admin/login, which trims before comparing. Hashing
  // the untrimmed value here would create an account whose password can never
  // match at login whenever the typed password begins or ends with a space.
  const password = (await askHidden('Admin password: ')).trim();
  if (!password || password.length < 12) {
    console.error('Password must be at least 12 characters (spaces at either end are ignored).');
    rl.close();
    process.exit(1);
  }

  const confirm = (await askHidden('Confirm password: ')).trim();
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
      `INSERT INTO admin_users (email, password_hash, password_changed_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             password_changed_at = NOW(),
             failed_login_count = 0,
             locked_until = NULL`,
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
