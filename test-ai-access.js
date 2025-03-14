// Script to test AI feature access for user PP9fgkr9lJYxLNNBS4NULNcah052
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Initialize environment variables
dotenv.config();

// User ID to test
const targetUserId = 'PP9fgkr9lJYxLNNBS4NULNcah052';

// Try to load Firebase Admin - but make it optional
let admin;
let firebaseInitialized = false;
try {
  admin = await import('firebase-admin');
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })
  });
  firebaseInitialized = true;
  console.log('Firebase Admin SDK initialized successfully');
} catch (error) {
  console.warn('Firebase Admin initialization failed:', error.message);
  console.log('Continuing with MongoDB testing only...');
}

async function testAIAccess() {
  let client;
  
  console.log('🔍 TESTING AI ACCESS');
  console.log('====================');
  console.log('User ID:', targetUserId);
  
  try {
    // STEP 1: Check MongoDB for subscription status
    console.log('\n📋 STEP 1: Checking subscription status in MongoDB');
    
    const mongoUri = process.env.MONGODB_URI;
    client = await mongoose.connect(mongoUri);
    
    const db = client.connection.db;
    const userUsagesCollection = db.collection('userusages');
    
    const userRecord = await userUsagesCollection.findOne({ userId: targetUserId });
    
    if (userRecord) {
      console.log('✅ User record found in MongoDB');
      console.log('Status:', userRecord.status);
      console.log('Trial End:', userRecord.trialEnd);
      
      const now = new Date();
      const trialEnd = new Date(userRecord.trialEnd);
      const isTrialActive = userRecord.status === 'trial' && now < trialEnd;
      
      console.log('Trial Active:', isTrialActive);
      if (isTrialActive) {
        const diffTime = trialEnd.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        console.log('Days Left in Trial:', diffDays);
      }
      
      console.log('AI Request Count:', userRecord.aiRequests?.count);
      console.log('AI Request Limit:', userRecord.aiRequestLimit);
      
      if (userRecord.status === 'trial' || userRecord.status === 'active') {
        console.log('✅ User has premium access based on MongoDB record');
      } else {
        console.log('❌ User does not have premium access based on MongoDB record');
      }
    } else {
      console.log('❌ No user record found in MongoDB');
    }
    
    // STEP 2: Check Firebase Auth claims (if Firebase is available)
    if (firebaseInitialized) {
      console.log('\n📋 STEP 2: Checking Firebase Auth claims');
      
      try {
        const userRecord = await admin.auth().getUser(targetUserId);
        console.log('✅ User found in Firebase Auth');
        
        if (userRecord.customClaims) {
          console.log('Custom Claims:', userRecord.customClaims);
          
          if (userRecord.customClaims.premium === true || 
              userRecord.customClaims.subscriptionStatus === 'trial' ||
              userRecord.customClaims.subscriptionStatus === 'active') {
            console.log('✅ User has premium access based on Firebase claims');
          } else {
            console.log('❌ User does not have premium access based on Firebase claims');
          }
        } else {
          console.log('❌ No custom claims found in Firebase Auth');
          
          // Update custom claims to add premium status
          try {
            await admin.auth().setCustomUserClaims(targetUserId, {
              subscriptionStatus: 'trial',
              premium: true,
              subscriptionEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            });
            console.log('✅ Updated Firebase custom claims with trial status');
          } catch (updateError) {
            console.error('Error updating custom claims:', updateError.message);
          }
        }
      } catch (error) {
        console.error('Error retrieving Firebase user:', error.message);
      }
    } else {
      console.log('\n📋 STEP 2: Firebase admin not initialized, skipping Firebase Auth check');
    }
    
    // STEP 3: Provide instructions for browser testing
    console.log('\n📋 STEP 3: Browser Testing Instructions');
    
    console.log('\nTo test the AI features in your app:');
    console.log('1. Log in with user ID:', targetUserId);
    console.log('2. Try accessing premium features like AI Insights');
    console.log('3. If it still doesn\'t work, you may need to clear browser cache or restart the app');
    
    console.log('\nYou can also use the following code in your browser console to verify the subscription status:');
    console.log(`
// Check subscription status in localStorage
const userId = '${targetUserId}';
const prefKey = \`user_preferences_\${userId}\`;
const prefs = JSON.parse(localStorage.getItem(prefKey) || '{}');
console.log('Current preferences:', prefs);

// Set subscription status to trial
prefs.subscriptionStatus = 'trial';
localStorage.setItem(prefKey, JSON.stringify(prefs));
localStorage.setItem('isPremiumUser', 'true');
console.log('Updated preferences:', prefs);
console.log('Subscription status set to trial. Reload the page to see changes.');
    `);
    
  } catch (error) {
    console.error('Error testing AI access:', error);
  } finally {
    // Disconnect from MongoDB
    if (client) {
      await mongoose.disconnect();
      console.log('\nDisconnected from MongoDB');
    }
    
    // Exit process
    process.exit(0);
  }
}

// Run the test
testAIAccess(); 