// Script to check Firebase user status
import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Load environment variables
dotenv.config();

// User ID to check
const userId = 'PP9fgkr9lJYxLNNBS4NULNcah052';

try {
  console.log('Initializing Firebase Admin...');
  
  // Initialize Firebase Admin SDK
  const firebaseConfig = {
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Replace escaped newlines in the private key
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || '',
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  };
  
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  
  console.log('Checking user status for ID:', userId);
  
  // Get the user record
  const userRecord = await auth.getUser(userId);
  
  console.log('User Status:');
  console.log('------------');
  console.log('User ID:', userRecord.uid);
  console.log('Email:', userRecord.email);
  console.log('Email Verified:', userRecord.emailVerified);
  console.log('Display Name:', userRecord.displayName);
  console.log('Phone Number:', userRecord.phoneNumber);
  console.log('Photo URL:', userRecord.photoURL);
  console.log('Disabled:', userRecord.disabled);
  console.log('Created At:', new Date(userRecord.metadata.creationTime).toLocaleString());
  console.log('Last Sign In:', new Date(userRecord.metadata.lastSignInTime).toLocaleString());
  
  // Check custom claims (which might include subscription status)
  console.log('Custom Claims:', userRecord.customClaims || 'None');
  
  // If we're using custom claims for subscription status
  if (userRecord.customClaims && userRecord.customClaims.subscriptionStatus) {
    console.log('Subscription Status:', userRecord.customClaims.subscriptionStatus);
    
    if (userRecord.customClaims.subscriptionEnd) {
      const endDate = new Date(userRecord.customClaims.subscriptionEnd);
      const now = new Date();
      const diffTime = endDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      console.log('Subscription End Date:', endDate.toLocaleString());
      console.log('Days Remaining:', diffDays > 0 ? diffDays : 0);
    }
  } else {
    console.log('No subscription information in custom claims');
  }
  
} catch (error) {
  console.error('Error checking user:', error);
} 