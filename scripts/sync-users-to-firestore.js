/**
 * Sync users from Firebase Auth to Firestore users collection
 * Run with: node scripts/sync-users-to-firestore.js [email]
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

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
  });
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

async function syncUser(email) {
  console.log(`\n🔄 Syncing user: ${email}`);
  
  try {
    // Get user from Firebase Auth
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log(`   ✅ Found in Auth: ${userRecord.uid}`);
    
    // Check if user exists in Firestore
    const userDoc = await db.collection('users').doc(userRecord.uid).get();
    
    if (userDoc.exists) {
      console.log(`   ℹ️  User already exists in Firestore`);
      const data = userDoc.data();
      console.log(`   Email: ${data.email}`);
      console.log(`   Name: ${data.firstName} ${data.lastName}`);
      return userRecord.uid;
    }
    
    // Create user document in Firestore
    const names = (userRecord.displayName || '').split(' ');
    const firstName = names[0] || '';
    const lastName = names.slice(1).join(' ') || '';
    
    const userData = {
      email: userRecord.email.toLowerCase(),
      firstName: firstName,
      lastName: lastName,
      displayName: userRecord.displayName || '',
      photoURL: userRecord.photoURL || null,
      emailVerified: userRecord.emailVerified,
      createdAt: admin.firestore.Timestamp.fromDate(new Date(userRecord.metadata.creationTime)),
      lastLoginAt: admin.firestore.Timestamp.now(),
      bookmarks: [],
      history: []
    };
    
    await db.collection('users').doc(userRecord.uid).set(userData);
    
    console.log(`   ✅ User created in Firestore!`);
    console.log(`   UID: ${userRecord.uid}`);
    console.log(`   Email: ${userData.email}`);
    console.log(`   Name: ${userData.firstName} ${userData.lastName}`);
    
    return userRecord.uid;
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    throw error;
  }
}

async function syncAllUsers() {
  console.log('\n🔄 Syncing ALL users from Auth to Firestore...\n');
  
  let syncedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  try {
    // List all users from Firebase Auth
    const listUsersResult = await admin.auth().listUsers();
    
    console.log(`Found ${listUsersResult.users.length} users in Firebase Auth\n`);
    
    for (const userRecord of listUsersResult.users) {
      if (!userRecord.email) {
        console.log(`⚠️  Skipping user ${userRecord.uid} (no email)`);
        skippedCount++;
        continue;
      }
      
      try {
        console.log(`Processing: ${userRecord.email}`);
        
        // Check if exists in Firestore
        const userDoc = await db.collection('users').doc(userRecord.uid).get();
        
        if (userDoc.exists) {
          console.log(`   ✓ Already exists`);
          skippedCount++;
          continue;
        }
        
        // Create in Firestore
        const names = (userRecord.displayName || '').split(' ');
        const userData = {
          email: userRecord.email.toLowerCase(),
          firstName: names[0] || '',
          lastName: names.slice(1).join(' ') || '',
          displayName: userRecord.displayName || '',
          photoURL: userRecord.photoURL || null,
          emailVerified: userRecord.emailVerified,
          createdAt: admin.firestore.Timestamp.fromDate(new Date(userRecord.metadata.creationTime)),
          lastLoginAt: admin.firestore.Timestamp.now(),
          bookmarks: [],
          history: []
        };
        
        await db.collection('users').doc(userRecord.uid).set(userData);
        console.log(`   ✅ Synced!`);
        syncedCount++;
        
      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        errorCount++;
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 Sync Summary:');
    console.log(`   ✅ Synced: ${syncedCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log('='.repeat(50) + '\n');
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

async function main() {
  const email = process.argv[2];
  
  if (!email) {
    console.log('\n📋 No email provided - syncing ALL users\n');
    await syncAllUsers();
  } else {
    await syncUser(email);
  }
  
  console.log('\n✨ Done!\n');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

