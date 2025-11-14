import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '..', 'server', 'serviceAccountKey.json'), 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://nuraai.firebaseio.com'
});

const userId = process.argv[2];

if (!userId) {
  console.error('❌ Please provide a user ID');
  console.log('Usage: node scripts/check-and-fix-claims.js <USER_ID>');
  process.exit(1);
}

async function checkAndFixClaims() {
  try {
    console.log(`\n🔍 Checking claims for user: ${userId}\n`);
    
    // Get current claims
    const userRecord = await admin.auth().getUser(userId);
    const currentClaims = userRecord.customClaims || {};
    
    console.log('📋 Current Claims:');
    console.log(JSON.stringify(currentClaims, null, 2));
    
    // Set premium claims
    const updatedClaims = {
      ...currentClaims,
      premium: true,
      subscriptionStatus: 'active',
      subscriptionEnd: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year from now
    };
    
    console.log('\n🔄 Setting updated claims:');
    console.log(JSON.stringify(updatedClaims, null, 2));
    
    await admin.auth().setCustomUserClaims(userId, updatedClaims);
    
    console.log('\n✅ Claims updated successfully!');
    console.log('📝 User must refresh their token (sign out/in or wait for auto-refresh)');
    
    // Verify
    const verifyRecord = await admin.auth().getUser(userId);
    console.log('\n✓ Verified Claims:');
    console.log(JSON.stringify(verifyRecord.customClaims, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

checkAndFixClaims();

