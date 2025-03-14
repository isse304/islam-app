// Script to update Firebase user custom claims with subscription info
import dotenv from 'dotenv';
import * as admin from 'firebase-admin';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize environment variables
dotenv.config();

// Initialize Firebase Admin SDK
try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    })
  });
  console.log('Firebase Admin SDK initialized successfully');
} catch (error) {
  console.error('Error initializing Firebase Admin SDK:', error);
  process.exit(1);
}

// User ID to update
const userId = 'PP9fgkr9lJYxLNNBS4NULNcah052';

async function updateUserClaims() {
  try {
    // First, verify that the user exists
    const userRecord = await admin.auth().getUser(userId);
    console.log(`Found user ${userRecord.uid} (${userRecord.email})`);
    
    // Calculate trial end date (7 days from now)
    const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    // Set custom claims for the user
    await admin.auth().setCustomUserClaims(userId, {
      subscriptionStatus: 'trial',
      subscriptionEnd: trialEnd.toISOString(),
      premium: true
    });
    
    console.log('Custom claims updated successfully');
    
    // Verify the claims were updated
    const updatedUser = await admin.auth().getUser(userId);
    console.log('Updated user claims:', updatedUser.customClaims);
    
  } catch (error) {
    console.error('Error updating user claims:', error);
  }
}

// Run the script
updateUserClaims(); 