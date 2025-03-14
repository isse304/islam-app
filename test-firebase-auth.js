// Simple test script to verify Firebase authentication
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, getIdToken } from 'firebase/auth';

// Your Firebase configuration from environment.ts
const firebaseConfig = {
  apiKey: "AIzaSyDhBAdoRQx-vc6lz_5lrZgXVPWXEtam-PQ",
  authDomain: "nuraai.firebaseapp.com",
  projectId: "nuraai",
  storageBucket: "nuraai.firebasestorage.app",
  messagingSenderId: "883232352111",
  appId: "1:883232352111:web:bf1b4d95807e614604ea9a",
  measurementId: "G-KJ4V3QTMT3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Replace with your test user credentials
// IMPORTANT: You must replace these with actual Firebase credentials before running the test
const email = 'lulcare42@gmail.com';
const password = 'Naruto73203';

async function testFirebaseAuth() {
  try {
    console.log('Testing Firebase Authentication...');
    
    // Step 1: Sign in with email and password
    console.log(`Signing in as ${email}...`);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log('Sign-in successful!');
    
    // Step 2: Get the ID token
    const token = await getIdToken(userCredential.user);
    console.log('Successfully obtained Firebase ID token');
    
    // Step 3: Test the token with your API
    console.log('Testing token with API...');
    const response = await fetch('http://localhost:3000/api/user-session', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    console.log('API Response:', data);
    
    if (data.userId) {
      console.log('✅ Firebase authentication is working correctly!');
    } else {
      console.log('❌ Firebase authentication test failed');
    }
  } catch (error) {
    console.error('Error testing Firebase authentication:', error);
  }
}

// Run the test
console.log('To run this test:');
console.log('1. Start your server with: npm start');
console.log('2. Update the email and password in this file with valid test credentials');
console.log('3. Run this script with: node test-firebase-auth.js');
console.log('\nThis script will:');
console.log('- Sign in to Firebase with the provided credentials');
console.log('- Get a Firebase ID token');
console.log('- Test the token with your API');
console.log('- Verify that the API returns the correct user ID');

// Call the test function
testFirebaseAuth(); 