import mongoose, { CallbackError } from 'mongoose';

const readingHistorySchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    surah: {
        type: Number,
        required: true,
        min: 1,
        max: 114
    },
    verse: {
        type: Number,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Compound index for efficient querying of user's history
readingHistorySchema.index({ userId: 1, timestamp: -1 });

// Compound index for unique surah per user
readingHistorySchema.index(
    { userId: 1, surah: 1 }, 
    { unique: true }
);

// Pre-save middleware to handle duplicate entries
readingHistorySchema.pre('save', async function(next) {
    try {
        console.log('Attempting to save reading history:', {
            userId: this.userId,
            surah: this.surah,
            verse: this.verse
        });

        // Check if there's an existing entry for this user and surah
        const existingEntry = await (this.constructor as any).findOne({
            userId: this.userId,
            surah: this.surah
        });

        if (existingEntry) {
            console.log('Found existing entry:', existingEntry);
            // Update the existing entry instead of creating a new one
            await (this.constructor as any).updateOne(
                { _id: existingEntry._id },
                { 
                    verse: this.verse,
                    timestamp: this.timestamp || new Date()
                }
            );
            console.log('Updated existing entry');
            // Skip saving the new document
            return next(new Error('Duplicate entry handled') as CallbackError);
        }
        console.log('No existing entry found, proceeding with save');
        next();
    } catch (error) {
        console.error('Error in pre-save middleware:', error);
        next(error as CallbackError);
    }
});

export const ReadingHistory = mongoose.model('ReadingHistory', readingHistorySchema); 