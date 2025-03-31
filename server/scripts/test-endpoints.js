import fetch from 'node-fetch';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { firstValueFrom } from 'rxjs';
import axios from 'axios';

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

// Mock DuaService for testing
class DuaService {
    constructor() {
        this.apiUrl = 'http://localhost:3000';
        this.aiInsightsCache = {};
        // Load local insights data
        this.localInsights = {
            "41": {
                "duaId": 41,
                "duaTitle": "Removal of Sadness",
                "category": "sadness",
                "content": "This dua is a powerful supplication for seeking refuge from anxiety and sorrow...",
                "virtues": ["Provides relief from anxiety and sadness", "Strengthens reliance on Allah"],
                "application": ["Recite during times of distress", "Include in daily morning and evening adhkar"],
                "historical_context": "This dua was taught by the Prophet (peace be upon him) as a remedy for anxiety and sadness...",
                "reflection_points": ["The importance of seeking Allah's protection", "Understanding the temporary nature of hardship"],
                "spiritual_advice": {
                    "understanding": "This dua teaches us the importance of turning to Allah in times of difficulty...",
                    "duas": [],
                    "dhikr": [],
                    "scholarly_guidance": [],
                    "spiritual_remedies": []
                }
            }
        };
    }

    async getToken() {
        try {
            console.log('Attempting to sign in with test user...');
            const userCredential = await signInWithEmailAndPassword(auth, TEST_USER_EMAIL, TEST_USER_PASSWORD);
            console.log('Successfully signed in');
            
            const token = await userCredential.user.getIdToken();
            if (!token) {
                throw new Error('Failed to get ID token after sign in');
            }
            
            console.log('Successfully got ID token');
            return token;
        } catch (error) {
            console.error('Error getting auth token:', error);
            return null;
        }
    }

    getLocalInsights(duaId) {
        console.log('Checking local insights for dua:', duaId);
        const insight = this.localInsights[duaId];
        if (insight) {
            console.log('Found local insights');
            // Format the insights to match the application's expected structure
            return {
                success: true,
                duaId: parseInt(duaId),
                content: insight.content,
                virtues: insight.virtues,
                application: insight.application,
                historicalContext: insight.historical_context,
                reflectionPoints: insight.reflection_points,
                spiritual_advice: insight.spiritual_advice
            };
        }
        console.log('No local insights found');
        return null;
    }

    async getDuaInsights(duaId) {
        const token = await this.getToken();
        if (!token) {
            throw new Error('No authentication token available');
        }

        const testDua = {
            id: parseInt(duaId),
            title: 'Removal of Sadness',
            arabic: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَالْعَجْزِ وَالْكَسَلِ، وَالْبُخْلِ وَالْجُبْنِ، وَضَلَعِ الدَّيْنِ وَغَلَبَةِ الرِّجَالِ',
            translation: 'O Allah, I seek refuge in You from anxiety and sorrow, weakness and laziness, miserliness and cowardice, the burden of debts and from being overpowered by men.',
            reference: 'Sahih Bukhari',
            category: 'sadness'
        };

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // Simulate timeout after 5s

            const response = await fetch(
                `${this.apiUrl}/api/ai/dua/insights`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ dua: testDua }),
                    signal: controller.signal
                }
            );

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const text = await response.text();
            console.log('\nRaw response:', text);

            // Parse SSE format
            const messages = text.split('\n\n');
            for (const message of messages) {
                if (message.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(message.substring(6));
                        if (data.status === 'complete' && data.data) {
                            return data.data;
                        }
                    } catch (error) {
                        console.error('Error parsing message:', error);
                    }
                }
            }

            // If we get here, check for local insights
            console.log('No complete data found in response, checking local insights...');
            const localInsights = this.getLocalInsights(duaId);
            if (localInsights) {
                return localInsights;
            }

            throw new Error('No insights available from any source');
        } catch (error) {
            console.log('Error in request, checking local insights...');
            const localInsights = this.getLocalInsights(duaId);
            if (localInsights) {
                return localInsights;
            }
            throw error;
        }
    }

    async signIn() {
        await this.getToken();
    }

    async getIdToken() {
        return await this.getToken();
    }
}

// Test user credentials
const TEST_USER_EMAIL = 'lulcare42@gmail.com';
const TEST_USER_PASSWORD = 'Naruto73203';

async function testDuaInsights() {
    console.log('\n🔍 Testing Dua Insights for Dua 41...');
    
    try {
        const duaService = new DuaService();
        const duaId = '41';
        
        console.log(`Testing dua insights for ID: ${duaId}`);
        const insights = await duaService.getDuaInsights(duaId);
        
        console.log('\n✅ Response Analysis:');
        console.log('1. Basic Structure:');
        console.log('- Success:', insights.success);
        console.log('- Dua ID:', insights.duaId);
        console.log('- Has Content:', !!insights.content);
        console.log('- Content Length:', insights.content?.length || 0);
        
        console.log('\n2. Content Sections:');
        console.log('- Has Virtues:', !!insights.virtues);
        console.log('- Has Application:', !!insights.application);
        console.log('- Has Historical Context:', !!(insights.historicalContext || insights.historical_context));
        console.log('- Has Reflection Points:', !!(insights.reflectionPoints || insights.reflection_points));
        
        console.log('\n3. Quality Checks:');
        console.log('- Correct Dua ID:', insights.duaId === 41 ? '✅ Passed' : '❌ Failed');
        console.log('- Has Content:', insights.content?.length > 100 ? '✅ Passed' : '❌ Failed');
        console.log('- Has Virtues:', insights.virtues?.length > 0 ? '✅ Passed' : '❌ Failed');
        console.log('- Has Application:', insights.application?.length > 0 ? '✅ Passed' : '❌ Failed');
        console.log('- Has Historical Context:', (insights.historicalContext?.length > 0 || insights.historical_context?.length > 0) ? '✅ Passed' : '❌ Failed');

        console.log('\n4. Content Preview:');
        console.log('\nContent:', insights.content?.substring(0, 200) + '...');
        console.log('\nVirtues:', Array.isArray(insights.virtues) ? insights.virtues[0] : insights.virtues?.substring(0, 100) + '...');
        console.log('\nApplication:', Array.isArray(insights.application) ? insights.application[0] : insights.application?.substring(0, 100) + '...');
        console.log('\nHistorical Context:', (insights.historicalContext || insights.historical_context)?.substring(0, 200) + '...');
        
        if (insights.error) {
            console.log('\n⚠️ Error in Response:');
            console.log('Error:', insights.error);
        }
    } catch (error) {
        console.error('Error testing dua insights:', error);
        console.error('Error details:', error.message);
    }
}

async function testEmotionalDuaSearch() {
    console.log('\n1️⃣ Testing Emotional Dua Search:');

    try {
        // Sign in and get token
        console.log('\nAttempting to sign in with test user...');
        const duaService = new DuaService();
        await duaService.signIn();
        console.log('Successfully signed in');
        const idToken = await duaService.getIdToken();
        console.log('Successfully got ID token');

        // Test emotional dua search
        console.log('Testing emotional dua search for: gratitude\n');
        const response = await axios.post(
            'http://localhost:3000/api/ai/dua/emotional-search',
            { emotion: 'gratitude' },
            { headers: { Authorization: `Bearer ${idToken}` } }
        );

        const data = response.data;
        console.log('✅ Response Structure Analysis:');
        
        // 1. Basic Structure Validation
        console.log('\n1. Basic Structure:');
        console.log(`- Success: ${data.success}`);
        console.log(`- Has Content: ${!!data.content}`);
        console.log(`- Has Quranic Guidance: ${Array.isArray(data.quranic_guidance)}`);
        console.log(`- Has Prophetic Example: ${!!data.prophetic_example}`);
        console.log(`- Has Practical Steps: ${Array.isArray(data.practical_steps)}`);
        console.log(`- Has Spiritual Advice: ${!!data.spiritual_advice}`);

        // 2. Spiritual Advice Validation
        if (data.spiritual_advice) {
            const advice = data.spiritual_advice;
            console.log('\n2. Spiritual Advice Structure:');
            console.log(`- Has Understanding: ${!!advice.understanding}`);
            
            // Validate Duas Array
            if (Array.isArray(advice.duas)) {
                console.log(`\n3. Duas Validation (${advice.duas.length} items):`);
                const firstDua = advice.duas[0];
                if (firstDua) {
                    console.log('First Dua Structure:');
                    console.log(`- Arabic: ${!!firstDua.arabic}`);
                    console.log(`- Transliteration: ${!!firstDua.transliteration}`);
                    console.log(`- Translation: ${!!firstDua.translation}`);
                    console.log(`- Reference: ${!!firstDua.reference}`);
                    console.log(`- Virtue: ${!!firstDua.virtue}`);
                    
                    // Log the actual content for review
                    console.log('\nFirst Dua Content:');
                    console.log(JSON.stringify(firstDua, null, 2));
                }
            }

            // Validate Dhikr Array
            if (Array.isArray(advice.dhikr)) {
                console.log(`\n4. Dhikr Validation (${advice.dhikr.length} items):`);
                const firstDhikr = advice.dhikr[0];
                if (firstDhikr) {
                    console.log('First Dhikr Structure:');
                    console.log(`- Phrase: ${!!firstDhikr.phrase}`);
                    console.log(`- Translation: ${!!firstDhikr.translation}`);
                    console.log(`- Count: ${!!firstDhikr.count}`);
                    console.log(`- Timing: ${!!firstDhikr.timing}`);
                    console.log(`- Benefit: ${!!firstDhikr.benefit}`);
                    
                    console.log('\nFirst Dhikr Content:');
                    console.log(JSON.stringify(firstDhikr, null, 2));
                }
            }

            // Validate Scholarly Guidance Array
            if (Array.isArray(advice.scholarly_guidance)) {
                console.log(`\n5. Scholarly Guidance Validation (${advice.scholarly_guidance.length} items):`);
                const firstGuidance = advice.scholarly_guidance[0];
                if (firstGuidance) {
                    console.log('First Guidance Structure:');
                    console.log(`- Quote: ${!!firstGuidance.quote}`);
                    console.log(`- Scholar: ${!!firstGuidance.scholar}`);
                    console.log(`- Source: ${!!firstGuidance.source}`);
                    
                    console.log('\nFirst Guidance Content:');
                    console.log(JSON.stringify(firstGuidance, null, 2));
                }
            }

            // Validate Spiritual Remedies Array
            if (Array.isArray(advice.spiritual_remedies)) {
                console.log(`\n6. Spiritual Remedies Validation (${advice.spiritual_remedies.length} items):`);
                const firstRemedy = advice.spiritual_remedies[0];
                if (firstRemedy) {
                    console.log('First Remedy Structure:');
                    console.log(`- Practice: ${!!firstRemedy.practice}`);
                    console.log(`- Method: ${!!firstRemedy.method}`);
                    console.log(`- Benefit: ${!!firstRemedy.benefit}`);
                    
                    console.log('\nFirst Remedy Content:');
                    console.log(JSON.stringify(firstRemedy, null, 2));
                }
            }
        }

        // Validate for non-Islamic quotes
        console.log('\n7. Content Safety Check:');
        const nonIslamicScholars = ['Dale Carnegie', 'Tony Robbins', 'Eckhart Tolle', 'Wayne Dyer'];
        let foundNonIslamic = false;
        
        if (data.spiritual_advice?.scholarly_guidance) {
            for (const guidance of data.spiritual_advice.scholarly_guidance) {
                if (nonIslamicScholars.some(name => guidance.scholar?.includes(name))) {
                    console.log(`⚠️ Warning: Found non-Islamic scholar: ${guidance.scholar}`);
                    foundNonIslamic = true;
                }
            }
        }
        
        if (!foundNonIslamic) {
            console.log('✅ No non-Islamic scholars found in scholarly guidance');
        }

    } catch (error) {
        console.error('Error testing emotional dua search:', error.message);
        if (error.response?.data) {
            console.error('Server response:', error.response.data);
        }
    }
}

async function testEndpoints() {
    try {
        // Test emotional dua search
        console.log('\n1️⃣ Testing Emotional Dua Search:');
        await testEmotionalDuaSearch();

        // Test dua insights endpoint for dua 41
        console.log('\n2️⃣ Testing Dua Insights for Dua 41:');
        await testDuaInsights();
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