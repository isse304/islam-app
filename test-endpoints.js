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
        // console.log('Attempting to sign in with test user...');
        const userCredential = await signInWithEmailAndPassword(auth, TEST_USER_EMAIL, TEST_USER_PASSWORD);
        // console.log('Successfully signed in');
        
        const token = await userCredential.user.getIdToken();
        if (!token) {
            throw new Error('Failed to get ID token after sign in');
        }

        // Get token result to check claims
        const tokenResult = await userCredential.user.getIdTokenResult();
        // console.log('Token claims:', {
        //     uid: tokenResult.claims.user_id,
        //     premium: tokenResult.claims.premium
        // });
        
        // console.log('Successfully got ID token');
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

async function testEmotionalDuas(token) {
    // console.log('\nTesting emotional dua search endpoint...');
    try {
        const response = await fetch('http://localhost:3000/api/ai/dua/emotional-search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                emotion: 'angry',
                context: 'feeling upset and struggling to control anger'
            })
        });

        // console.log('Response status:', response.status);
        const responseText = await response.text();
        
        try {
            const data = JSON.parse(responseText);
            // console.log('\n🔍 Detailed Response Analysis:');
            // console.log('1. Basic Response Structure:');
            // console.log('- Success:', data.success);
            // console.log('- Has Content:', !!data.content);
            // console.log('- Content Preview:', data.content ? data.content.substring(0, 100) + '...' : 'No content');
            
            // console.log('\n2. Required Sections Check:');
            const requiredSections = {
                'Spiritual Advice': data.spiritual_advice?.understanding?.length > 0,
                'Related Verses': data.related_verses_hadith?.verses?.length > 0,
                'Related Hadith': data.related_verses_hadith?.hadith?.length > 0,
                'Historical Context': !!data.prophetic_example,
                'Practical Steps': data.practical_steps?.length > 0,
                'Quranic Guidance': data.quranic_guidance?.length > 0,
                'Reflection Points': data.reflection_points?.length > 0
            };

            // console.log('Section Status:');
            const sectionStatus = {};
            let allPresent = true;
            Object.entries(requiredSections).forEach(([section, exists]) => {
                sectionStatus[section] = exists;
                if (!exists) allPresent = false;
            });

            if (allPresent) {
                // console.log('\n✅ All required sections are present');
            } else {
                // console.warn('\n⚠️ Warning: Missing Required Sections:', missingRequiredSections.join(', '));
            }
            
            // console.log('\n3. Raw Response Data:');
            // console.log(JSON.stringify(data, null, 2));
            
        } catch (e) {
            console.error('Error parsing response:', e);
            console.error('Raw response:', responseText);
            console.error('Parse error:', e.message);
        }
    } catch (error) {
        console.error('Error testing emotional dua search:', error);
        console.error('Error details:', error.message);
    }
}

async function testDuaInsights(token) {
    // console.log('\nTesting dua insights endpoint...');
    try {
        const response = await fetch('http://localhost:3000/api/ai/dua/insights', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                dua: {
                    id: 1,
                    arabic: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَّهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ",
                    translation: "Allah - there is no deity except Him, the Ever-Living, the Self-Sustaining. Neither drowsiness overtakes Him nor sleep. To Him belongs whatever is in the heavens and whatever is on the earth.",
                    reference: "Quran 2:255 (Ayatul Kursi)",
                    title: "Ayatul Kursi",
                    virtue: "One of the greatest verses in the Quran, offering protection and blessings"
                }
            })
        });

        // console.log('Response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server error:', errorText);
            return;
        }

        // Get the raw text response
        const text = await response.text();
        // console.log('\nRaw response:', text);

        // Process each SSE message
        const messages = text.split('\n\n').filter(msg => msg.trim());
        
        for (const message of messages) {
            if (message.startsWith('data: ')) {
                try {
                    const data = JSON.parse(message.slice(6));
                    // console.log('\nProcessed SSE message:', {
                    //     status: data.status,
                    //     hasData: !!data.data,
                    //     hasError: !!data.error,
                    //     details: data.details || null
                    // });

                    if (data.status === 'error') {
                        console.error('Server error:', {
                            error: data.error,
                            details: data.details
                        });
                        return;
                    }

                    if (data.status === 'complete' && data.data) {
                        // console.log('\n🔍 Analyzing complete response:');
                        const insights = data.data;
                        
                        // console.log('1. Basic Response Structure:');
                        // console.log('- Success:', insights.success);
                        // console.log('- Has Content:', !!insights.content);
                        
                        // console.log('\n2. Spiritual Advice Section Check:');
                        const spiritualAdvice = insights.spiritual_advice || {};
                        // console.log('Understanding:', spiritualAdvice.understanding ? '✅ Present' : '❌ Missing');
                        // console.log('Duas:', spiritualAdvice.duas?.length ? `✅ Present (${spiritualAdvice.duas.length} items)` : '❌ Missing');
                        // console.log('Dhikr:', spiritualAdvice.dhikr?.length ? `✅ Present (${spiritualAdvice.dhikr.length} items)` : '❌ Missing');
                        // console.log('Scholarly Guidance:', spiritualAdvice.scholarly_guidance?.length ? `✅ Present (${spiritualAdvice.scholarly_guidance.length} items)` : '❌ Missing');
                        // console.log('Spiritual Remedies:', spiritualAdvice.spiritual_remedies?.length ? `✅ Present (${spiritualAdvice.spiritual_remedies.length} items)` : '❌ Missing');

                        // console.log('\n3. Sample Content Check:');
                        if (spiritualAdvice.duas?.[0]) {
                            // console.log('\nFirst Dua:');
                            // console.log(JSON.stringify(spiritualAdvice.duas[0], null, 2));
                        }
                        if (spiritualAdvice.dhikr?.[0]) {
                            // console.log('\nFirst Dhikr:');
                            // console.log(JSON.stringify(spiritualAdvice.dhikr[0], null, 2));
                        }
                        if (spiritualAdvice.scholarly_guidance?.[0]) {
                            // console.log('\nFirst Scholar Quote:');
                            // console.log(JSON.stringify(spiritualAdvice.scholarly_guidance[0], null, 2));
                        }
                    }
                } catch (e) {
                    console.error('Error parsing SSE message:', e);
                    console.error('Raw message:', message);
                }
            }
        }
    } catch (error) {
        console.error('Error testing dua insights:', error);
        console.error('Error details:', error.message);
    }
}

async function testAITafsirChat(token) {
    // console.log('\nTesting AI tafsir chat endpoint...');
    try {
        const response = await fetch('http://localhost:3000/api/ai/tafsir/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                surah: 1,
                verse: 1,
                question: "What is the deeper meaning of 'Al-Rahman Al-Raheem' in this verse?"
            })
        });

        // console.log('Response status:', response.status);
        const responseText = await response.text();
        
        try {
            const data = JSON.parse(responseText);
            // console.log('AI tafsir chat response:', {
            //     success: data.success,
            //     hasContent: !!data.content,
            //     messageLength: data.content ? data.content.length : 0
            // });
        } catch (e) {
            // console.log('Raw response:', responseText);
        }
    } catch (error) {
        console.error('Error testing AI tafsir chat:', error);
    }
}

async function testEndpoints() {
    try {
        // console.log('Getting auth token...');
        const token = await getAuthToken();
        if (!token) {
            console.error('Failed to get auth token');
            return;
        }
        // console.log('Got token:', token.substring(0, 20) + '...');

        // Test dua insights endpoint with Ayatul Kursi
        await testDuaInsights(token);

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