// Script to check subscription status
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

// User ID to check
const userId = 'PP9fgkr9lJYxLNNBS4NULNcah052';

// Connect to MongoDB
try {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');
  
  // For ES modules, we need to dynamically import the UserUsage model
  const { UserUsage } = await import('./server/models/UserUsage.js');
  
  // Query for the user's subscription status
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
  }
} catch (err) {
  console.error('Error:', err);
} finally {
  // Disconnect from MongoDB
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
} 