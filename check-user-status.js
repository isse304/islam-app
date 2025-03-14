// Simple CommonJS script to check user subscription status
require('dotenv').config();
const mongoose = require('mongoose');
const { UserUsage } = require('./models/UserUsage');

// User ID to check
const userId = 'PP9fgkr9lJYxLNNBS4NULNcah052';

async function checkUserStatus() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    console.log('Checking subscription status for user:', userId);
    const usage = await UserUsage.findOne({ userId });
    
    if (usage) {
      console.log('Subscription Status:');
      console.log('-------------------');
      console.log('User ID:', usage.userId);
      console.log('Status:', usage.status);
      console.log('Trial End:', usage.trialEnd);
      console.log('Current Period End:', usage.currentPeriodEnd);
      console.log('AI Request Count:', usage.aiRequests ? usage.aiRequests.count : 0);
      console.log('AI Request Limit:', usage.aiRequestLimit);
      
      // Check if trial is active
      if (usage.status === 'trial') {
        const now = new Date();
        const isActive = usage.trialEnd ? now < usage.trialEnd : false;
        console.log('Trial Active:', isActive);
        
        if (usage.trialEnd) {
          const diffTime = usage.trialEnd.getTime() - now.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          console.log('Days Left in Trial:', diffDays > 0 ? diffDays : 0);
        }
      }
    } else {
      console.log('No subscription record found for user ID:', userId);
      
      // Create a trial subscription for this user
      console.log('Would you like to create a trial subscription for this user? (yes/no)');
      process.stdin.once('data', async (data) => {
        const answer = data.toString().trim().toLowerCase();
        if (answer === 'yes' || answer === 'y') {
          console.log('Creating trial subscription...');
          const newUsage = new UserUsage({
            userId,
            status: 'trial',
            trialEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
            aiRequests: { count: 0, lastRequest: new Date() },
            aiRequestLimit: 50
          });
          
          await newUsage.save();
          console.log('Trial subscription created successfully!');
        }
        process.exit(0);
      });
      return; // Keep process running for stdin
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB');
    }
    process.exit(0);
  }
}

checkUserStatus(); 