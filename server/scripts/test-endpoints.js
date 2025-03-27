import fetch from 'node-fetch';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

// Firebase config from environment.ts
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

// Test user credentials
const TEST_USER_EMAIL = 'lulcare42@gmail.com';
const TEST_USER_PASSWORD = 'Naruto73203';

async function getAuthToken() {
    try {
        console.log('Attempting to sign in with test user...');
        const userCredential = await signInWithEmailAndPassword(auth, TEST_USER_EMAIL, TEST_USER_PASSWORD);
        console.log('Successfully signed in');
        
        const token = await userCredential.user.getIdToken();
        if (!token) {
            throw new Error('Failed to get ID token after sign in');
        }

        // Get token result to check claims
        const tokenResult = await userCredential.user.getIdTokenResult();
        console.log('Token claims:', {
            premium: tokenResult.claims.premium,
            features: tokenResult.claims.features,
            subscriptionStatus: tokenResult.claims.subscriptionStatus,
            exp: tokenResult.expirationTime,
            auth_time: tokenResult.authTime
        });
        
        console.log('Successfully got ID token');
        return token;
    } catch (error) {
        console.error('Error getting auth token:', error.code, error.message);
        if (error.code === 'auth/user-not-found') {
            console.error('Test user not found. Please ensure the test user exists in Firebase.');
        } else if (error.code === 'auth/wrong-password') {
            console.error('Invalid password for test user.');
        } else if (error.code === 'auth/invalid-email') {
            console.error('Invalid email format.');
        }
        return null;
    }
}

async function testTafsirDatabase() {
    console.log('\n🔍 Testing Tafsir Database Endpoints...');

    const testCases = [
        { source: 'ibn-kathir', surah: 5, verse: 5 },
        { source: 'tabari', surah: 5, verse: 5 }
    ];

    for (const testCase of testCases) {
        console.log(`\nTesting tafsir for ${testCase.source}, Surah ${testCase.surah}, Verse ${testCase.verse}:`);
        
        try {
            const response = await fetch(
                `http://localhost:3000/api/tafsir/${testCase.source}/${testCase.surah}/${testCase.verse}`
            );

            console.log('Response status:', response.status);
            const responseText = await response.text();
            
            try {
                const data = JSON.parse(responseText);
                console.log('\n🔍 Response Analysis:');
                console.log('1. Response Structure:');
                console.log('- Has Text:', !!data.text);
                console.log('- Text Length:', data.text ? data.text.length : 0);
                console.log('- Has Metadata:', !!data.metadata);
                
                if (data.metadata) {
                    console.log('\n2. Metadata Check:');
                    console.log('- Source:', data.metadata.source);
                    console.log('- Language:', data.metadata.language);
                    console.log('- Reference:', data.metadata.reference);
                }

                if (data.text) {
                    console.log('\n3. Content Preview:');
                    console.log(data.text.substring(0, 200) + '...');
                    
                    // Quality checks
                    console.log('\n4. Quality Checks:');
                    console.log('- Contains HTML tags:', /<[^>]+>/g.test(data.text) ? '❌ Failed' : '✅ Passed');
                    console.log('- Has content:', data.text.length > 100 ? '✅ Passed' : '❌ Failed');
                    console.log('- Proper formatting:', /\n\n/.test(data.text) ? '✅ Passed' : '❌ Failed');
                }

                if (data.error) {
                    console.log('\n⚠️ Error Response:');
                    console.log('- Error:', data.error);
                    console.log('- Text:', data.text);
                }
                
            } catch (e) {
                console.error('Error parsing response:', e);
                console.error('Raw response:', responseText);
            }
        } catch (error) {
            console.error('Error testing tafsir endpoint:', error);
            console.error('Error details:', error.message);
        }
    }
}

async function testTafsirChat() {
    console.log('\n🔍 Testing AI Tafsir Chat Endpoint...');
    
    try {
        // Get auth token first
        const token = await getAuthToken();
        if (!token) {
            console.error('Failed to get auth token');
            return;
        }

        const testCase = {
            surah: 17,
            verse: 5,
            question: "Is this verse referring to the present or future?"
        };

        console.log(`\nTesting AI Tafsir chat for Surah ${testCase.surah}, Verse ${testCase.verse}`);
        
        const response = await fetch(
            'http://localhost:3000/api/tafsir/chat',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(testCase)
            }
        );

        console.log('Response status:', response.status);
        const responseText = await response.text();
        
        try {
            const data = JSON.parse(responseText);
            console.log('\n🔍 Response Analysis:');
            console.log('1. Response Structure:');
            console.log('- Success:', data.success);
            console.log('- Has Content:', !!data.content);
            console.log('- Content Length:', data.content ? data.content.length : 0);
            console.log('- Source Type:', data.source || 'tafsir');
            
            if (data.sources) {
                console.log('\n2. Sources Used:');
                data.sources.forEach(source => {
                    console.log(`- ${source.name} (${source.language})`);
                });
            }

            if (data.content) {
                console.log('\n3. Content Preview:');
                console.log(data.content.substring(0, 500) + '...');
                
                // Quality checks
                console.log('\n4. Quality Checks:');
                console.log('- Contains source citations:', data.content.includes('Ibn Kathir') || data.content.includes('Tabari') ? '✅ Passed' : '❌ Failed');
                console.log('- Has substantial content:', data.content.length > 200 ? '✅ Passed' : '❌ Failed');
                console.log('- Mentions tafsir sources:', data.sources && data.sources.length > 0 ? '✅ Passed' : '❌ Failed');
            }

            if (data.error) {
                console.log('\n⚠️ Error Response:');
                console.log('- Error:', data.error);
            }
            
        } catch (e) {
            console.error('Error parsing response:', e);
            console.error('Raw response:', responseText);
        }
    } catch (error) {
        console.error('Error testing tafsir chat endpoint:', error);
        console.error('Error details:', error.message);
    }
}

async function testEndpoints() {
    try {
        console.log('Testing Tafsir Database Implementation...');
        
        // Test raw tafsir database endpoints
        console.log('\n1️⃣ Testing Raw Tafsir Database:');
        await testTafsirDatabase();

        // Test AI tafsir chat endpoint
        console.log('\n2️⃣ Testing AI Tafsir Chat:');
        await testTafsirChat();

    } catch (error) {
        console.error('Error testing endpoints:', error);
        if (error.response) {
            const errorBody = await error.response.text();
            console.error('Error response body:', errorBody);
        }
    }
}

// Run the tests
testEndpoints().catch(console.error); 