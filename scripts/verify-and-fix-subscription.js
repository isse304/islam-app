#!/usr/bin/env node

/**
 * Subscription Verification and Fix Script
 * 
 * This script checks and fixes subscription discrepancies between:
 * 1. Stripe (source of truth)
 * 2. MongoDB UserSubscription
 * 3. Firebase Custom Claims
 * 
 * Usage:
 *   node scripts/verify-and-fix-subscription.js <user-email-or-id>
 *   node scripts/verify-and-fix-subscription.js --check-all
 */

const admin = require('firebase-admin');
const mongoose = require('mongoose');
const Stripe = require('stripe');
require('dotenv').config();

// Initialize services
const serviceAccount = require('../server/serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const mongoUri = process.env.MONGODB_URI;

// MongoDB Schema
const UserSubscriptionSchema = new mongoose.Schema({
    userId: String,
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    status: String,
    plan: String,
    planId: String,
    currentPeriodEnd: Date,
    cancelAtPeriodEnd: Boolean,
    welcomeEmailSent: Boolean,
    createdAt: Date,
    updatedAt: Date
});

const UserSubscription = mongoose.model('UserSubscription', UserSubscriptionSchema);

async function connectDB() {
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
        maxPoolSize: 5,
        minPoolSize: 2
    });
    console.log('✅ Connected to MongoDB\n');
}

async function getUserByEmailOrId(identifier) {
    try {
        // Try as email first
        if (identifier.includes('@')) {
            return await admin.auth().getUserByEmail(identifier);
        } else {
            return await admin.auth().getUser(identifier);
        }
    } catch (error) {
        console.error(`❌ Error fetching user ${identifier}:`, error.message);
        return null;
    }
}

async function checkSubscription(userId, userEmail) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🔍 Checking subscription for: ${userEmail || userId}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const results = {
        userId,
        userEmail,
        mongoDb: null,
        firebaseClaims: null,
        stripe: null,
        discrepancies: [],
        needsFix: false
    };

    // 1. Check MongoDB
    console.log('📊 Checking MongoDB...');
    try {
        const userSub = await UserSubscription.findOne({ userId });
        if (userSub) {
            results.mongoDb = {
                status: userSub.status,
                plan: userSub.plan,
                stripeCustomerId: userSub.stripeCustomerId,
                stripeSubscriptionId: userSub.stripeSubscriptionId,
                currentPeriodEnd: userSub.currentPeriodEnd,
                cancelAtPeriodEnd: userSub.cancelAtPeriodEnd
            };
            console.log('   ✓ Found in MongoDB:', JSON.stringify(results.mongoDb, null, 2));
        } else {
            console.log('   ⚠️  Not found in MongoDB');
        }
    } catch (error) {
        console.error('   ❌ MongoDB error:', error.message);
    }

    // 2. Check Firebase Claims
    console.log('\n🔐 Checking Firebase Custom Claims...');
    try {
        const userRecord = await admin.auth().getUser(userId);
        const claims = userRecord.customClaims || {};
        results.firebaseClaims = {
            premium: claims.premium,
            subscriptionStatus: claims.subscriptionStatus,
            subscriptionEnd: claims.subscriptionEnd ? new Date(claims.subscriptionEnd * 1000) : null
        };
        console.log('   ✓ Claims:', JSON.stringify(results.firebaseClaims, null, 2));
    } catch (error) {
        console.error('   ❌ Firebase error:', error.message);
    }

    // 3. Check Stripe
    console.log('\n💳 Checking Stripe...');
    if (results.mongoDb?.stripeCustomerId) {
        try {
            const subscriptions = await stripe.subscriptions.list({
                customer: results.mongoDb.stripeCustomerId,
                limit: 10
            });

            if (subscriptions.data.length > 0) {
                const activeSub = subscriptions.data.find(s => 
                    s.status === 'active' || s.status === 'trialing'
                ) || subscriptions.data[0];

                results.stripe = {
                    id: activeSub.id,
                    status: activeSub.status,
                    currentPeriodEnd: new Date(activeSub.current_period_end * 1000),
                    cancelAtPeriodEnd: activeSub.cancel_at_period_end,
                    priceId: activeSub.items.data[0]?.price.id
                };
                console.log('   ✓ Found in Stripe:', JSON.stringify(results.stripe, null, 2));
            } else {
                console.log('   ⚠️  No subscriptions found in Stripe');
            }
        } catch (error) {
            console.error('   ❌ Stripe error:', error.message);
        }
    } else {
        console.log('   ⚠️  No Stripe customer ID in MongoDB');
    }

    // 4. Analyze discrepancies
    console.log('\n🔎 Analyzing Discrepancies...');
    
    const stripeActive = results.stripe?.status === 'active' || results.stripe?.status === 'trialing';
    const mongoActive = results.mongoDb?.status === 'active' || results.mongoDb?.status === 'trialing';
    const claimsActive = results.firebaseClaims?.premium === true;

    if (stripeActive !== mongoActive) {
        results.discrepancies.push({
            type: 'stripe-mongo',
            message: `Stripe shows ${results.stripe?.status}, MongoDB shows ${results.mongoDb?.status}`
        });
        results.needsFix = true;
    }

    if (stripeActive !== claimsActive) {
        results.discrepancies.push({
            type: 'stripe-claims',
            message: `Stripe shows ${results.stripe?.status}, Firebase claims show premium=${results.firebaseClaims?.premium}`
        });
        results.needsFix = true;
    }

    if (mongoActive !== claimsActive) {
        results.discrepancies.push({
            type: 'mongo-claims',
            message: `MongoDB shows ${results.mongoDb?.status}, Firebase claims show premium=${results.firebaseClaims?.premium}`
        });
        results.needsFix = true;
    }

    if (results.discrepancies.length > 0) {
        console.log('   ⚠️  DISCREPANCIES FOUND:');
        results.discrepancies.forEach(d => {
            console.log(`      - ${d.message}`);
        });
    } else {
        console.log('   ✅ All systems in sync!');
    }

    return results;
}

async function fixSubscription(results) {
    console.log('\n🔧 FIXING SUBSCRIPTION...\n');

    // Use Stripe as the source of truth
    if (!results.stripe) {
        console.log('❌ Cannot fix: No Stripe subscription found');
        return false;
    }

    const stripeStatus = results.stripe.status;
    const isPremium = stripeStatus === 'active' || stripeStatus === 'trialing';

    // 1. Update MongoDB
    console.log('📊 Updating MongoDB...');
    try {
        await UserSubscription.findOneAndUpdate(
            { userId: results.userId },
            {
                status: stripeStatus,
                plan: isPremium ? 'premium' : 'free',
                stripeSubscriptionId: results.stripe.id,
                currentPeriodEnd: results.stripe.currentPeriodEnd,
                cancelAtPeriodEnd: results.stripe.cancelAtPeriodEnd,
                updatedAt: new Date()
            },
            { upsert: true, new: true }
        );
        console.log('   ✅ MongoDB updated');
    } catch (error) {
        console.error('   ❌ MongoDB update failed:', error.message);
        return false;
    }

    // 2. Update Firebase Claims (preserve existing claims like role)
    console.log('\n🔐 Updating Firebase Claims...');
    try {
        // Get existing claims first
        const userRecord = await admin.auth().getUser(results.userId);
        const existingClaims = userRecord.customClaims || {};
        
        console.log('   📋 Existing claims:', JSON.stringify(existingClaims, null, 2));
        
        // Merge with subscription claims
        const updatedClaims = {
            ...existingClaims,
            premium: isPremium,
            subscriptionStatus: stripeStatus,
            subscriptionEnd: isPremium ? Math.floor(results.stripe.currentPeriodEnd.getTime() / 1000) : null
        };
        
        await admin.auth().setCustomUserClaims(results.userId, updatedClaims);
        console.log('   ✅ Firebase claims updated');
        if (existingClaims.role) {
            console.log('   ✅ Role preserved:', existingClaims.role);
        }
    } catch (error) {
        console.error('   ❌ Firebase claims update failed:', error.message);
        return false;
    }

    console.log('\n✅ SUBSCRIPTION FIXED!');
    console.log(`   Status: ${stripeStatus}`);
    console.log(`   Premium: ${isPremium}`);
    console.log(`   Period End: ${results.stripe.currentPeriodEnd.toISOString()}`);
    
    return true;
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage:');
        console.log('  node scripts/verify-and-fix-subscription.js <user-email-or-id>');
        console.log('  node scripts/verify-and-fix-subscription.js --check-all');
        process.exit(1);
    }

    await connectDB();

    const identifier = args[0];
    
    if (identifier === '--check-all') {
        console.log('🔍 Checking all users with subscriptions...\n');
        const allSubs = await UserSubscription.find({});
        console.log(`Found ${allSubs.length} subscription records\n`);
        
        for (const sub of allSubs) {
            const userRecord = await admin.auth().getUser(sub.userId);
            const results = await checkSubscription(sub.userId, userRecord.email);
            
            if (results.needsFix) {
                console.log('\n⚠️  User needs fixing. Run with user email to fix.');
            }
            console.log('\n' + '─'.repeat(60) + '\n');
        }
    } else {
        // Single user check
        const userRecord = await getUserByEmailOrId(identifier);
        if (!userRecord) {
            console.log('❌ User not found');
            process.exit(1);
        }

        const results = await checkSubscription(userRecord.uid, userRecord.email);
        
        if (results.needsFix) {
            console.log('\n❓ Found discrepancies. Would you like to fix them?');
            console.log('   This will use Stripe as the source of truth.');
            console.log('   Press Ctrl+C to cancel, or wait 5 seconds to proceed...\n');
            
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            await fixSubscription(results);
        }
    }

    await mongoose.disconnect();
    console.log('\n👋 Done!');
    process.exit(0);
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});

