#!/usr/bin/env node

/**
 * Quick Health Check Script
 * 
 * Runs a comprehensive health check on the deployed application
 * 
 * Usage: node scripts/health-check.js [backend-url]
 * Example: node scripts/health-check.js https://nura-y6uq.onrender.com
 */

const https = require('https');
const http = require('http');

const BACKEND_URL = process.argv[2] || 'https://nura-y6uq.onrender.com';
const TIMEOUT = 10000; // 10 seconds

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🏥 NuraAI Health Check');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log(`Backend URL: ${BACKEND_URL}\n`);

function makeRequest(path) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BACKEND_URL);
        const client = url.protocol === 'https:' ? https : http;
        
        const req = client.get(url.href, { timeout: TIMEOUT }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        data: JSON.parse(data)
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        data: data
                    });
                }
            });
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

async function checkEndpoint(name, path, expectedStatus = 200) {
    process.stdout.write(`${name}... `);
    try {
        const result = await makeRequest(path);
        if (result.status === expectedStatus) {
            console.log('✅');
            return { success: true, data: result.data };
        } else {
            console.log(`⚠️  (Status: ${result.status})`);
            return { success: false, status: result.status, data: result.data };
        }
    } catch (error) {
        console.log(`❌ (${error.message})`);
        return { success: false, error: error.message };
    }
}

async function runHealthCheck() {
    const results = {
        overall: 'healthy',
        checks: {}
    };

    // 1. Check basic health endpoint
    console.log('🔍 Checking Endpoints:');
    results.checks.health = await checkEndpoint('  Health endpoint', '/api/health');
    
    // 2. Check if API is responding
    results.checks.api = await checkEndpoint('  API base', '/api/user-session', 401); // Expecting 401 without auth
    
    console.log('\n📊 System Status:');
    
    if (results.checks.health.success) {
        const health = results.checks.health.data;
        
        // Memory
        const memStatus = health.memory?.heapUsedPercent > 80 ? '⚠️' : '✅';
        console.log(`  ${memStatus} Memory: ${health.memory?.heapUsedPercent || 'N/A'}% used`);
        console.log(`     Heap: ${health.memory?.heapUsed || 'N/A'}MB / ${health.memory?.heapTotal || 'N/A'}MB`);
        console.log(`     RSS: ${health.memory?.rss || 'N/A'}MB`);
        
        // Database
        const dbStatus = health.database?.mongodb === 'connected' ? '✅' : '❌';
        console.log(`  ${dbStatus} MongoDB: ${health.database?.mongodb || 'unknown'}`);
        
        // Uptime
        console.log(`  ⏱️  Uptime: ${health.uptime || 'N/A'}`);
        
        // Overall status
        if (health.status === 'warning') {
            results.overall = 'warning';
            console.log('\n⚠️  WARNING: System is running but has issues');
            if (health.memory?.warning) {
                console.log(`   ${health.memory.warning}`);
            }
        }
    } else {
        results.overall = 'unhealthy';
        console.log('  ❌ Could not retrieve health data');
    }

    // Check API responsiveness
    if (!results.checks.api.success && results.checks.api.error) {
        results.overall = 'unhealthy';
        console.log(`  ❌ API not responding: ${results.checks.api.error}`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Final verdict
    if (results.overall === 'healthy') {
        console.log('✅ OVERALL STATUS: HEALTHY');
        console.log('   All systems operational');
    } else if (results.overall === 'warning') {
        console.log('⚠️  OVERALL STATUS: WARNING');
        console.log('   System operational but requires attention');
        console.log('   Action: Monitor memory usage, consider scaling');
    } else {
        console.log('❌ OVERALL STATUS: UNHEALTHY');
        console.log('   System has critical issues');
        console.log('   Action: Check logs, restart service, or contact support');
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Recommendations
    if (results.checks.health.success) {
        const heapPercent = results.checks.health.data.memory?.heapUsedPercent || 0;
        
        console.log('💡 Recommendations:');
        
        if (heapPercent > 80) {
            console.log('  ⚠️  Memory usage is critical (>80%)');
            console.log('     - Upgrade instance size immediately');
            console.log('     - Check for memory leaks in logs');
            console.log('     - Consider implementing Redis caching');
        } else if (heapPercent > 60) {
            console.log('  ⚠️  Memory usage is elevated (>60%)');
            console.log('     - Monitor closely');
            console.log('     - Plan to upgrade instance size soon');
            console.log('     - Review recent changes for memory impact');
        } else {
            console.log('  ✅ Memory usage is healthy (<60%)');
        }
        
        console.log('\n  📚 For detailed analysis, see:');
        console.log('     - MEMORY_AND_SUBSCRIPTION_FIX.md');
        console.log('     - IMMEDIATE_ACTION_GUIDE.md');
    }
    
    console.log('\n🔧 Quick Commands:');
    console.log(`  Health check:   curl ${BACKEND_URL}/api/health`);
    console.log(`  Full metrics:   curl ${BACKEND_URL}/api/health/metrics`);
    console.log(`  Verify sub:     node scripts/verify-and-fix-subscription.js <email>`);
    
    console.log('\n');
    
    return results.overall === 'healthy' ? 0 : 1;
}

runHealthCheck()
    .then(exitCode => process.exit(exitCode))
    .catch(error => {
        console.error('\n❌ Health check failed:', error.message);
        process.exit(1);
    });







