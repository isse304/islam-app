// Script to fix subscription status for user PP9fgkr9lJYxLNNBS4NULNcah052
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Initialize environment variables
dotenv.config();

// User ID to fix
const targetUserId = 'PP9fgkr9lJYxLNNBS4NULNcah052';

async function fixSubscription() {
  let client;
  
  try {
    console.log('Connecting to MongoDB...');
    const mongoUri = process.env.MONGODB_URI;
    
    // Connect to MongoDB without Mongoose
    client = await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB successfully');
    
    // Get the database
    const db = client.connection.db;
    
    // Get direct reference to the collection
    const userUsagesCollection = db.collection('userusages');
    
    // Check if user already exists
    const existingUser = await userUsagesCollection.findOne({ userId: targetUserId });
    
    if (existingUser) {
      console.log('User record found:');
      console.log('-------------------');
      console.log('User ID:', existingUser.userId);
      console.log('Status:', existingUser.status);
      console.log('Trial End:', existingUser.trialEnd);
      
      // Update to trial status
      console.log('\nUpdating subscription to trial status...');
      const updateResult = await userUsagesCollection.updateOne(
        { userId: targetUserId },
        { 
          $set: {
            status: 'trial',
            trialEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
            currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            'aiRequests.count': 0,
            'aiRequests.lastRequest': new Date(),
            aiRequestLimit: 50
          }
        }
      );
      
      console.log(`Subscription updated successfully! Modified: ${updateResult.modifiedCount}`);
    } else {
      console.log('No user record found. Creating new trial subscription...');
      
      // Create new trial subscription
      const newUsage = {
        userId: targetUserId,
        status: 'trial',
        trialEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        aiRequests: { 
          count: 0, 
          lastRequest: new Date() 
        },
        aiRequestLimit: 50
      };
      
      const insertResult = await userUsagesCollection.insertOne(newUsage);
      console.log(`Trial subscription created successfully! ID: ${insertResult.insertedId}`);
    }
    
    // Print the updated or new record
    const updatedUser = await userUsagesCollection.findOne({ userId: targetUserId });
    console.log('\nUpdated Record:');
    console.log('-------------------');
    console.log('User ID:', updatedUser.userId);
    console.log('Status:', updatedUser.status);
    console.log('Trial End:', updatedUser.trialEnd);
    console.log('Current Period End:', updatedUser.currentPeriodEnd);
    console.log('AI Requests:', updatedUser.aiRequests);
    console.log('AI Request Limit:', updatedUser.aiRequestLimit);
    
  } catch (error) {
    console.error('Error fixing subscription:', error);
  } finally {
    // Disconnect from MongoDB
    if (client) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB');
    }
  }
}

// Run the script
fixSubscription(); 