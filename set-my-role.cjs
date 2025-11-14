/**
 * Quick script to set your own role for testing
 * Run: node set-my-role.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./server/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function setRole() {
  // Get your email from command line or hardcode it
  const email = process.argv[2] || 'isse304@gmail.com';
  const role = process.argv[3] || 'teacher';

  if (!['teacher', 'student', 'parent'].includes(role)) {
    console.error('❌ Role must be: teacher, student, or parent');
    process.exit(1);
  }

  try {
    // Get user by email
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log(`Found user: ${userRecord.email} (${userRecord.uid})`);

    // Set custom claims
    await admin.auth().setCustomUserClaims(userRecord.uid, { 
      role: role,
      admin: true // Also make you an admin so you can test everything
    });

    console.log(`✅ Successfully set role: ${role} for ${email}`);
    console.log(`✅ Also granted admin privileges`);
    console.log('\n⚠️  Important: User must sign out and sign back in for changes to take effect!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setRole();

