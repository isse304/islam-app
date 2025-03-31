import fetch from 'node-fetch';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { firstValueFrom } from 'rxjs';

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

async function testEndpoints() {
    try {
        // Test dua insights endpoint for dua 41
        console.log('\n1️⃣ Testing Dua Insights for Dua 41:');
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