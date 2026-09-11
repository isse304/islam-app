/**
 * Grant complimentary premium access by email.
 *
 * Writes Firebase custom claims only (the app's source of truth). Does not
 * create a MongoDB UserSubscription, because that record requires a Stripe
 * customer id.
 *
 * Usage:
 *   node scripts/grant-premium.js user@example.com
 *   node scripts/grant-premium.js user@example.com 30
 *   node scripts/grant-premium.js user@example.com 90
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');
const dotenv = require('../server/node_modules/dotenv');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const REVOKED_KEY_ID = '71d42697487a80f0de5e7a7615bb2f2305465423';

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const email = args[0];
const days = Number(args[1] || 30);

if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/grant-premium.js <email> [days]');
  process.exit(1);
}

if (!Number.isFinite(days) || days <= 0) {
  console.error('Days must be a positive number.');
  process.exit(1);
}

for (const envFile of [join(ROOT, '.env'), join(ROOT, 'server', '.env')]) {
  if (existsSync(envFile)) dotenv.config({ path: envFile });
}

function loadServiceAccount() {
  if (process.env.FIREBASE_CONFIG) {
    try {
      return { source: '.env FIREBASE_CONFIG', key: JSON.parse(process.env.FIREBASE_CONFIG) };
    } catch (err) {
      console.warn(`Warning: FIREBASE_CONFIG in .env is not valid JSON (${err.message}). Falling back to key file.`);
    }
  }
  const candidates = [
    'nuraai-firebase-adminsdk-fbsvc-c28d82a97c.json',
    'serviceAccountKey.json'
  ].map((name) => join(ROOT, 'server', name));

  for (const file of candidates) {
    if (existsSync(file)) {
      return { source: file.replace(ROOT, '.'), key: JSON.parse(readFileSync(file, 'utf8')) };
    }
  }
  console.error('No Firebase credentials found. Set FIREBASE_CONFIG in .env or place the key in server/.');
  process.exit(1);
}

async function main() {
  const { source, key } = loadServiceAccount();
  if (key.private_key_id === REVOKED_KEY_ID) {
    console.error('Refusing to run: this is the leaked key that Google disabled. Install the replacement key.');
    process.exit(1);
  }
  console.log(`Credentials: ${source} (project ${key.project_id}, key ...${String(key.private_key_id).slice(-8)})`);

  admin.initializeApp({ credential: admin.credential.cert(key) });

  const user = await admin.auth().getUserByEmail(email);
  const existing = user.customClaims || {};
  const subscriptionEnd = Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
  const endsAt = new Date(subscriptionEnd * 1000);

  const updatedClaims = {
    ...existing,
    premium: true,
    subscriptionStatus: 'active',
    subscriptionEnd
  };

  console.log(`User: ${user.email} (${user.uid})`);
  console.log('Existing claims:', JSON.stringify(existing, null, 2));

  await admin.auth().setCustomUserClaims(user.uid, updatedClaims);

  const verified = await admin.auth().getUser(user.uid);
  console.log('Updated claims:', JSON.stringify(verified.customClaims, null, 2));
  console.log(`Granted ${days} days of premium through ${endsAt.toISOString()}.`);
  console.log('The user must sign out and sign in (or wait for token refresh) for this to take effect.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
