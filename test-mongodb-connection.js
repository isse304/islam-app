// Script to test MongoDB connection
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize environment variables
dotenv.config();

// MongoDB connection URI
const mongoUri = process.env.MONGODB_URI;

console.log('MongoDB Connection Test');
console.log('----------------------');

if (!mongoUri) {
  console.error('Error: MONGODB_URI environment variable is not set.');
  console.log('Please ensure you have MONGODB_URI defined in your .env file.');
  process.exit(1);
}

// Display partial connection string (hide credentials)
try {
  const maskedUri = mongoUri.replace(/:\/\/([^:]+):([^@]+)@/, '://*****:*****@');
  console.log(`Attempting to connect to: ${maskedUri}`);
} catch (error) {
  console.log('Unable to display connection string');
}

// Test connection
async function testConnection() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000 // 5 second timeout
    });
    
    console.log('✅ Successfully connected to MongoDB!');
    
    // Get database information
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    console.log(`\nDatabase name: ${db.databaseName}`);
    console.log(`Available collections (${collections.length}):`);
    collections.forEach(collection => {
      console.log(`- ${collection.name}`);
    });
    
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:');
    console.error(error.message);
    
    // Provide troubleshooting tips
    console.log('\nTroubleshooting tips:');
    console.log('1. Check if your MongoDB server is running');
    console.log('2. Verify your connection string is correct');
    console.log('3. Check network/firewall settings (port 27017 should be open)');
    console.log('4. If using MongoDB Atlas, ensure your IP address is whitelisted');
  } finally {
    // Close connection
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('\nConnection closed.');
    }
    process.exit(0);
  }
}

// Run the test
testConnection(); 