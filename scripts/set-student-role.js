/**
 * Quick script to set student role for a user
 * Run with: node scripts/set-student-role.js YOUR_USER_UID
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '../server/serviceAccountKey.json'), 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Get UID from command line argument
const uid = process.argv[2];
const role = process.argv[3] || 'student';

if (!uid) {
  console.error('❌ Error: Please provide a user UID');
  console.log('\nUsage:');
  console.log('  node scripts/set-student-role.js YOUR_USER_UID [role]');
  console.log('\nExample:');
  console.log('  node scripts/set-student-role.js abc123xyz student');
  console.log('  node scripts/set-student-role.js abc123xyz teacher');
  console.log('  node scripts/set-student-role.js abc123xyz parent');
  console.log('\n💡 Tip: Find your UID in Firebase Console → Authentication → Users');
  process.exit(1);
}

if (!['teacher', 'student', 'parent'].includes(role)) {
  console.error('❌ Error: Role must be "teacher", "student", or "parent"');
  process.exit(1);
}

console.log(`\n🔧 Setting role for user...`);
console.log(`   UID: ${uid}`);
console.log(`   Role: ${role}\n`);

admin.auth().setCustomUserClaims(uid, { role })
  .then(() => {
    console.log(`✅ Success! Role "${role}" has been set for user ${uid}`);
    console.log('\n⚠️  IMPORTANT: The user must sign out and sign in again for changes to take effect!\n');
    
    // Verify the claims were set
    return admin.auth().getUser(uid);
  })
  .then(userRecord => {
    console.log('📋 User details:');
    console.log(`   Email: ${userRecord.email}`);
    console.log(`   Custom Claims:`, userRecord.customClaims);
    console.log('\n✨ All done!\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error setting custom claims:', error.message);
    console.log('\n💡 Common issues:');
    console.log('   - Make sure the UID is correct');
    console.log('   - Check that serviceAccountKey.json exists in server/ folder');
    console.log('   - Verify Firebase Admin SDK permissions\n');
    process.exit(1);
  });

