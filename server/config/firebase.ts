import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

try {
    // Get Firebase config from environment variable
    const firebaseConfig = process.env['FIREBASE_CONFIG'];
    
    if (!firebaseConfig) {
        throw new Error('FIREBASE_CONFIG environment variable is missing');
    }

    // Parse the config
    const serviceAccount = JSON.parse(firebaseConfig);

    // Initialize Firebase Admin
    if (!getApps().length) {
        initializeApp({
            credential: cert(serviceAccount)
        });
        console.log('Firebase Admin SDK initialized successfully');
    } else {
        console.log('Firebase Admin SDK already initialized');
    }
} catch (error) {
    console.error('Error initializing Firebase Admin:', error);
    console.error('FIREBASE_CONFIG value:', process.env['FIREBASE_CONFIG'] ? '[PRESENT]' : '[MISSING]');
    process.exit(1);
}

// Export the auth instance instead of admin
export const auth = getAuth();
export default { auth }; 