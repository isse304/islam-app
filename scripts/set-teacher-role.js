/**
 * Set a user as a teacher by UID or email.
 *
 * Usage:
 *   node scripts/set-teacher-role.js <UID>
 *   node scripts/set-teacher-role.js --email user@example.com
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '../server/serviceAccountKey.json'), 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function resolveUid() {
  if (process.argv[2] === '--email') {
    const email = process.argv[3];
    if (!email) {
      console.error('❌ Error: Please provide an email after --email');
      process.exit(1);
    }
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log(`   Resolved email ${email} → UID ${userRecord.uid}`);
    return userRecord.uid;
  }

  const uid = process.argv[2];
  if (!uid) {
    console.error('❌ Error: Please provide a user UID or --email <address>');
    console.log('\nUsage:');
    console.log('  node scripts/set-teacher-role.js <UID>');
    console.log('  node scripts/set-teacher-role.js --email teacher@school.com');
    console.log('\n💡 Tip: Find the UID in Firebase Console → Authentication → Users');
    process.exit(1);
  }
  return uid;
}

(async () => {
  try {
    console.log('\n🔧 Setting teacher role...');
    const uid = await resolveUid();

    await admin.auth().setCustomUserClaims(uid, { role: 'teacher' });

    const userRecord = await admin.auth().getUser(uid);
    console.log(`\n✅ Success! "${userRecord.email || uid}" is now a teacher.`);
    console.log('📋 Custom Claims:', userRecord.customClaims);
    console.log('\n⚠️  IMPORTANT: The user must sign out and sign in again for changes to take effect.\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
