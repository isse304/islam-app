import mongoose from 'mongoose';

const userUsageSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true
    },
    count: {
        type: Number,
        default: 0
    },
    totalTokens: {
        type: Number,
        default: 0
    },
    lastReset: {
        type: Date,
        default: Date.now
    },
    lastRequest: {
        type: Date,
        default: Date.now
    },
    requests: [{
        timestamp: Date,
        tokens: Number,
        systemMessage: String,
        userMessage: String
    }]
});

// Index for faster queries
userUsageSchema.index({ lastReset: 1 });

export const UserUsage = mongoose.model('UserUsage', userUsageSchema); 