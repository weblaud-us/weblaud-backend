#!/usr/bin/env node
/**
 * Runs a command against the LOCAL test setup only:
 *
 *   node scripts/local.js <command…>      e.g. node scripts/local.js nest start --watch
 *
 * - Points the app at .env.local instead of .env (ENV_FILE, read by
 *   app.module.ts), so the production database, Gmail and Cloudinary in
 *   .env are never loaded.
 * - Refuses to run unless .env.local's MONGODB_URI is on this machine —
 *   SeedModule and the demo seed write on boot, and that must never hit
 *   the production Atlas cluster.
 *
 * Used by the pnpm *:local scripts. See weblaud-site/LOCAL_TESTING.md.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '..', '.env.local');
if (!fs.existsSync(envFile)) {
  console.error(
    '\n.env.local is missing. Create it from the template in weblaud-site/LOCAL_TESTING.md (step 2).\n',
  );
  process.exit(1);
}

const uriLine = fs
  .readFileSync(envFile, 'utf8')
  .split(/\r?\n/)
  .find((l) => l.trim().startsWith('MONGODB_URI='));
const uri = uriLine ? uriLine.slice(uriLine.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '') : '';
if (!/^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(uri)) {
  console.error(
    `\nRefusing to run: MONGODB_URI in .env.local must point at this machine (mongodb://127.0.0.1:27018), got "${uri.replace(/\/\/[^@]*@/, '//***@')}".\n`,
  );
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('Usage: node scripts/local.js <command> [args…]');
  process.exit(1);
}

// Drop anything production-flavoured that might be in the shell.
const env = { ...process.env, ENV_FILE: '.env.local', NODE_ENV: 'development' };
delete env.MONGODB_URI;

const child = spawn(command, args, { stdio: 'inherit', shell: true, env });
child.on('exit', (code) => process.exit(code ?? 0));
