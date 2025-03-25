import fetch from 'node-fetch';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import fs from 'fs/promises';
import path from 'path';

// Firebase config
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
        console.log('Signing in...');
        const userCredential = await signInWithEmailAndPassword(auth, TEST_USER_EMAIL, TEST_USER_PASSWORD);
        const token = await userCredential.user.getIdToken();
        console.log('Successfully got token');
        return token;
    } catch (error) {
        console.error('Error getting auth token:', error);
        return null;
    }
}

async function generateInsightsForDua(dua, token) {
    console.log(`Generating insights for dua: ${dua.title}`);
    const insights = [];

    // Generate 3 different insights
    for (let i = 0; i < 3; i++) {
        try {
            console.log(`Generating insight ${i + 1}/3...`);
            const response = await fetch('http://localhost:3000/api/ai/dua/insights', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ dua })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Process SSE response
            const text = await response.text();
            const messages = text.split('\n\n').filter(msg => msg.trim());
            
            for (const message of messages) {
                if (message.startsWith('data: ')) {
                    const data = JSON.parse(message.slice(6));
                    if (data.status === 'complete' && data.data) {
                        insights.push(data.data);
                        break;
                    }
                }
            }

            // Wait 2 seconds between requests to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
            console.error(`Error generating insight ${i + 1}:`, error);
        }
    }

    return insights;
}

async function main() {
    try {
        // Get auth token
        const token = await getAuthToken();
        if (!token) {
            throw new Error('Failed to get auth token');
        }

        // Read duas from JSON file
        const duasPath = path.join(process.cwd(), 'server/data/duas.json');
        const duasData = await fs.readFile(duasPath, 'utf8');
        const duas = JSON.parse(duasData);

        // Generate insights for each dua
        const insightsMap = {};
        for (const dua of duas) {
            console.log(`\nProcessing dua: ${dua.title}`);
            const duaInsights = await generateInsightsForDua(dua, token);
            if (duaInsights.length > 0) {
                insightsMap[dua.id] = duaInsights;
            }
        }

        // Save insights to file
        const insightsPath = path.join(process.cwd(), 'server/data/dua-insights.json');
        await fs.writeFile(insightsPath, JSON.stringify(insightsMap, null, 2));
        console.log('\nSuccessfully generated and saved insights!');

    } catch (error) {
        console.error('Error in main:', error);
    }
}

// Run the script
main().catch(console.error); 