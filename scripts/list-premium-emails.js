/**
 * Lists the email address of every user with premium access.
 *
 * Read-only: this script never writes claims or subscription records. Premium is
 * tracked in two independent places that can drift apart, so both are reported:
 *   - Firebase custom claims (premium, subscriptionStatus, subscriptionEnd)
 *   - MongoDB UserSubscription (status, plan, currentPeriodEnd)
 *
 * Usage:
 *   node scripts/list-premium-emails.js
 *   node scripts/list-premium-emails.js --csv premium-users.csv
 *   node scripts/list-premium-emails.js --claims-only   (skips MongoDB)
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');
const dotenv = require('../server/node_modules/dotenv');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// The key exposed on GitHub. Refuse to run if it is still in use.
const REVOKED_KEY_ID = '71d42697487a80f0de5e7a7615bb2f2305465423';

const ACTIVE_STATUSES = ['active', 'trialing'];

const args = process.argv.slice(2);
const claimsOnly = args.includes('--claims-only');
const csvIndex = args.indexOf('--csv');
const csvPath = csvIndex !== -1 ? args[csvIndex + 1] : null;

for (const envFile of [join(ROOT, '.env'), join(ROOT, 'server', '.env')]) {
  if (existsSync(envFile)) dotenv.config({ path: envFile });
}

function loadServiceAccount() {
  if (process.env.FIREBASE_CONFIG) {
    try {
      return { source: '.env FIREBASE_CONFIG', key: JSON.parse(process.env.FIREBASE_CONFIG) };
    } catch (err) {
      // A pretty-printed key pasted into .env leaves only "{" on the line, since
      // dotenv stops at the newline. Fall back to the key file rather than fail.
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

/**
 * Claims are the source of truth for what the app actually grants at runtime.
 *
 * `granted` mirrors the real checks: server/middleware/auth.ts tests only that the
 * premium claim is truthy, and firebase-auth.service.ts also accepts an active or
 * trialing status. Neither consults subscriptionEnd, so a past end date does NOT
 * revoke access; it is reported separately as a billing discrepancy.
 */
function readClaims(user) {
  const claims = user.customClaims || {};
  const endSeconds = typeof claims.subscriptionEnd === 'number' ? claims.subscriptionEnd : null;
  const status = claims.subscriptionStatus || null;
  return {
    premium: claims.premium === true,
    status,
    role: claims.role || null,
    end: endSeconds ? new Date(endSeconds * 1000) : null,
    endPassed: endSeconds ? endSeconds * 1000 < Date.now() : false,
    granted: claims.premium === true || ACTIVE_STATUSES.includes(status)
  };
}

function ymd(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : '-';
}

async function listAllUsers() {
  const users = [];
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

async function fetchSubscriptions() {
  const mongoose = require('../server/node_modules/mongoose');
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set. Re-run with --claims-only to use Firebase claims alone.');
    process.exit(1);
  }
  await mongoose.connect(uri);

  // strict:false so unexpected fields in existing documents are preserved on read.
  const schema = new mongoose.Schema({}, { strict: false, collection: 'usersubscriptions' });
  const Subscription = mongoose.models.PremiumAudit || mongoose.model('PremiumAudit', schema);

  const docs = await Subscription.find({
    $or: [{ status: { $in: ACTIVE_STATUSES } }, { plan: 'premium' }]
  }).lean();

  await mongoose.connection.close();

  const byUserId = new Map();
  for (const doc of docs) byUserId.set(doc.userId, doc);
  return byUserId;
}

function pad(value, width) {
  const text = value == null ? '' : String(value);
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function printSection(title, rows, note) {
  console.log(`\n${title} (${rows.length})`);
  if (note) console.log(`  ${note}`);
  if (rows.length === 0) {
    console.log('  none');
    return;
  }
  console.log('  ' + pad('EMAIL', 34) + pad('CLAIMS', 22) + pad('MONGO', 20) + pad('CLAIM END', 12) + 'PERIOD END');
  console.log('  ' + '-'.repeat(100));
  for (const row of rows) {
    const claimsText = row.claims.premium
      ? `premium/${row.claims.status || 'no status'}`
      : row.claims.status || 'no claims';
    const mongoText = row.sub ? `${row.sub.status}/${row.sub.plan || 'no plan'}` : 'no record';
    console.log(
      '  ' +
        pad(row.email, 34) +
        pad(claimsText, 22) +
        pad(mongoText, 20) +
        pad(ymd(row.claims.end), 12) +
        ymd(row.sub?.currentPeriodEnd)
    );
  }
}

async function main() {
  const { source, key } = loadServiceAccount();
  if (key.private_key_id === REVOKED_KEY_ID) {
    console.error('Refusing to run: this is the leaked key that Google disabled. Install the replacement key.');
    process.exit(1);
  }
  console.log(`Credentials: ${source} (project ${key.project_id}, key ...${String(key.private_key_id).slice(-8)})`);

  admin.initializeApp({ credential: admin.credential.cert(key) });

  const users = await listAllUsers();
  const subs = claimsOnly ? new Map() : await fetchSubscriptions();

  const rows = users.map((user) => ({
    uid: user.uid,
    email: user.email || `(no email) ${user.uid}`,
    claims: readClaims(user),
    sub: subs.get(user.uid) || null
  }));

  const mongoActive = (row) =>
    row.sub && (ACTIVE_STATUSES.includes(row.sub.status) || row.sub.plan === 'premium');

  const granted = rows.filter((r) => r.claims.granted);
  const periodOver = granted.filter(
    (r) => r.claims.endPassed || (r.sub?.currentPeriodEnd && new Date(r.sub.currentPeriodEnd) < new Date())
  );
  const payingNoAccess = claimsOnly ? [] : rows.filter((r) => !r.claims.granted && mongoActive(r));

  // Subscriptions whose userId has no Firebase account, so they never appear above.
  const knownUids = new Set(rows.map((r) => r.uid));
  const orphaned = [...subs.values()].filter((sub) => !knownUids.has(sub.userId));

  console.log(`\nScanned ${users.length} Firebase users${claimsOnly ? '' : ` and ${subs.size} subscription records`}.`);

  printSection('PREMIUM ACCESS', granted, 'What the app grants today. subscriptionEnd is not enforced.');

  if (periodOver.length) {
    printSection(
      'STILL PREMIUM THOUGH THE PAID PERIOD HAS ENDED',
      periodOver,
      'These keep full access because no code path checks the end date.'
    );
  }
  if (payingNoAccess.length) {
    printSection('ACTIVE SUBSCRIPTION BUT NO PREMIUM CLAIM', payingNoAccess, 'They are paying and locked out.');
  }
  if (orphaned.length) {
    console.log(`\nSUBSCRIPTIONS WITH NO FIREBASE ACCOUNT (${orphaned.length})`);
    console.log('  The Firebase user was deleted, so no email is recoverable from Auth.');
    for (const sub of orphaned) {
      console.log(`  ${pad(sub.userId, 32)}${pad(`${sub.status}/${sub.plan || 'no plan'}`, 20)}${ymd(sub.currentPeriodEnd)}`);
    }
  }

  console.log('\nEmails with premium access:');
  const emails = granted.map((r) => r.email).sort();
  console.log(emails.length ? emails.join('\n') : '  none');

  if (csvPath) {
    const lines = ['email,uid,claim_status,mongo_status,mongo_plan,renews'];
    for (const row of granted) {
      lines.push([
        row.email,
        row.uid,
        row.claims.status || '',
        row.sub?.status || '',
        row.sub?.plan || '',
        row.sub?.currentPeriodEnd ? new Date(row.sub.currentPeriodEnd).toISOString() : ''
      ].join(','));
    }
    writeFileSync(csvPath, lines.join('\n') + '\n');
    console.log(`\nWrote ${granted.length} rows to ${csvPath}`);
  }

  if (payingNoAccess.length) {
    console.log('\nTo grant the missing claims, run: node scripts/sync-all-subscription-claims.js');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nFailed:', err.message);
    process.exit(1);
  });
