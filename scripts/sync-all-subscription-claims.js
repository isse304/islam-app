import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');
const mongoose = require('../server/node_modules/mongoose');
const dotenv = require('../server/node_modules/dotenv');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from server directory
dotenv.config({ path: join(__dirname, '..', 'server', '.env') });

// Initialize Firebase Admin
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '..', 'server', 'serviceAccountKey.json'), 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://nuraai.firebaseio.com'
});

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

await mongoose.connect(mongoUri);

// Define UserSubscription schema
const userSubscriptionSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  status: String,
  plan: String,
  currentPeriodEnd: Date,
  cancelAtPeriodEnd: Boolean,
  createdAt: Date,
  updatedAt: Date
});

const UserSubscription = mongoose.model('UserSubscription', userSubscriptionSchema);

async function syncAllClaims() {
  try {
    console.log('\n🔍 Finding all active subscriptions in MongoDB...\n');
    
    // Find all active/trialing subscriptions
    const activeSubscriptions = await UserSubscription.find({
      status: { $in: ['active', 'trialing'] }
    });
    
    console.log(`📊 Found ${activeSubscriptions.length} active subscriptions\n`);
    
    let fixed = 0;
    let alreadyCorrect = 0;
    let errors = 0;
    
    for (const subscription of activeSubscriptions) {
      try {
        const userId = subscription.userId;
        const userRecord = await admin.auth().getUser(userId);
        const currentClaims = userRecord.customClaims || {};
        
        const isPremium = currentClaims.premium === true;
        const isActive = currentClaims.subscriptionStatus === 'active' || currentClaims.subscriptionStatus === 'trialing';
        
        if (isPremium && isActive) {
          console.log(`✅ ${userRecord.email || userId}: Already correct`);
          alreadyCorrect++;
        } else {
          console.log(`🔧 ${userRecord.email || userId}: Fixing claims...`);
          
          const periodEnd = subscription.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          
          const updatedClaims = {
            ...currentClaims, // Preserve existing claims (role, admin, etc.)
            premium: true,
            subscriptionStatus: subscription.status,
            subscriptionEnd: Math.floor(periodEnd.getTime() / 1000)
          };
          
          await admin.auth().setCustomUserClaims(userId, updatedClaims);
          console.log(`   ✅ Fixed! Claims now:`, {
            premium: updatedClaims.premium,
            status: updatedClaims.subscriptionStatus,
            role: updatedClaims.role || 'none'
          });
          fixed++;
        }
      } catch (error) {
        console.error(`   ❌ Error processing ${subscription.userId}:`, error.message);
        errors++;
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Already Correct: ${alreadyCorrect}`);
    console.log(`🔧 Fixed: ${fixed}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`📈 Total Processed: ${activeSubscriptions.length}`);
    console.log('='.repeat(50));
    console.log('\n💡 Note: Users must refresh their token (sign out/in or click refresh button) to see changes\n');
    
  } catch (error) {
    console.error('❌ Fatal Error:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

syncAllClaims();

