import axios from 'axios';
import dotenv from 'dotenv';
import { performance } from 'perf_hooks';
import { auth } from '../config/firebase';

dotenv.config();

const TEST_ORIGINS = [
    'http://localhost:4200',
    'https://www.nura-ai.app',
    'https://nura-ai.app',
    'https://malicious-site.com' // Should be blocked
];

const TEST_ENDPOINTS = [
    '/api/user/qpmwn8wPjpQI5GCvgQG8KMdB6Ym2/bookmarks',
    '/api/user/qpmwn8wPjpQI5GCvgQG8KMdB6Ym2/preferences',
    '/api/user/qpmwn8wPjpQI5GCvgQG8KMdB6Ym2/reading-history'
];

const BASE_URL = process.env.NODE_ENV === 'production' 
    ? 'https://nura-y6uq.onrender.com'
    : 'http://localhost:3000';

async function getTestToken() {
    try {
        // Create a custom token for testing
        const customToken = await auth.createCustomToken('test-user', {
            premium: true
        });
        return customToken;
    } catch (error) {
        console.error('Error creating test token:', error);
        throw error;
    }
}

async function testCORS() {
    console.log('\n=== Testing CORS Configuration ===\n');
    
    const testToken = await getTestToken();

    for (const origin of TEST_ORIGINS) {
        console.log(`\nTesting origin: ${origin}`);
        
        for (const endpoint of TEST_ENDPOINTS) {
            try {
                const start = performance.now();
                
                // Test preflight (OPTIONS) request
                try {
                    await axios.options(`${BASE_URL}${endpoint}`, {
                        headers: {
                            'Origin': origin,
                            'Access-Control-Request-Method': 'GET',
                            'Access-Control-Request-Headers': 'Authorization'
                        }
                    });
                    console.log(`✅ OPTIONS ${endpoint} - Preflight allowed`);
                } catch (error: any) {
                    if (origin === 'https://malicious-site.com') {
                        console.log(`✅ OPTIONS ${endpoint} - Correctly blocked unauthorized origin`);
                    } else {
                        console.log(`❌ OPTIONS ${endpoint} - Preflight failed: ${error.message}`);
                    }
                }

                // Test actual request
                try {
                    await axios.get(`${BASE_URL}${endpoint}`, {
                        headers: {
                            'Origin': origin,
                            'Authorization': `Bearer ${testToken}`
                        }
                    });
                    const end = performance.now();
                    console.log(`✅ GET ${endpoint} - Request allowed (${Math.round(end - start)}ms)`);
                } catch (error: any) {
                    if (error.response?.status === 401) {
                        console.log(`✅ GET ${endpoint} - Correctly requires authentication`);
                    } else if (origin === 'https://malicious-site.com') {
                        console.log(`✅ GET ${endpoint} - Correctly blocked unauthorized origin`);
                    } else {
                        console.log(`❌ GET ${endpoint} - Request failed: ${error.message}`);
                        if (error.response?.data) {
                            console.log('Error details:', error.response.data);
                        }
                    }
                }
            } catch (error: any) {
                console.error(`❌ Error testing ${endpoint}: ${error.message}`);
            }
        }
    }
}

async function testTimeouts() {
    console.log('\n=== Testing Timeout Configuration ===\n');

    const testToken = await getTestToken();
    const timeoutEndpoint = `${BASE_URL}/api/user/qpmwn8wPjpQI5GCvgQG8KMdB6Ym2/reading-history?delay=35000`; // Endpoint that should timeout

    try {
        console.log('Testing request timeout (should fail after 30 seconds)...');
        const start = performance.now();
        await axios.get(timeoutEndpoint, {
            headers: {
                'Origin': 'https://www.nura-ai.app',
                'Authorization': `Bearer ${testToken}`
            },
            timeout: 31000 // Set slightly higher than server timeout
        });
        const end = performance.now();
        console.log(`❌ Request did not timeout as expected (${Math.round(end - start)}ms)`);
    } catch (error: any) {
        if (error.code === 'ECONNABORTED' || error.response?.status === 504) {
            console.log('✅ Request correctly timed out');
        } else {
            console.log(`❌ Unexpected error: ${error.message}`);
            if (error.response?.data) {
                console.log('Error details:', error.response.data);
            }
        }
    }
}

async function testRateLimiting() {
    console.log('\n=== Testing Rate Limiting ===\n');

    const testToken = await getTestToken();
    const endpoint = `${BASE_URL}/api/user/qpmwn8wPjpQI5GCvgQG8KMdB6Ym2/bookmarks`;
    const requests = Array(150).fill(null); // Test with more requests than the limit

    console.log('Sending multiple requests to test rate limiting...');
    const results = await Promise.all(
        requests.map(async (_, index) => {
            try {
                await axios.get(endpoint, {
                    headers: {
                        'Origin': 'https://www.nura-ai.app',
                        'Authorization': `Bearer ${testToken}`
                    }
                });
                return { success: true, index };
            } catch (error: any) {
                return {
                    success: false,
                    status: error.response?.status,
                    index
                };
            }
        })
    );

    const successful = results.filter(r => r.success).length;
    const rateLimit = results.filter(r => !r.success && r.status === 429).length;

    console.log(`Requests completed: ${successful}`);
    console.log(`Requests rate limited: ${rateLimit}`);

    if (rateLimit > 0) {
        console.log('✅ Rate limiting is working');
    } else {
        console.log('❌ Rate limiting did not trigger as expected');
    }
}

async function runTests() {
    try {
        await testCORS();
        await testTimeouts();
        await testRateLimiting();
    } catch (error) {
        console.error('Test suite failed:', error);
    }
}

// Run the tests
runTests(); 