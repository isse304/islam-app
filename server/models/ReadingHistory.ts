import mongoose, { Document, Schema } from 'mongoose';

export interface ReadingHistory extends Document {
    userId: string;
    content: string;
    timestamp: Date;
}

const readingHistorySchema = new Schema<ReadingHistory>({
    userId: { type: String, required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
}, {
    timestamps: true
});

// Create index for efficient queries
readingHistorySchema.index({ userId: 1, timestamp: -1 });

export const ReadingHistory = mongoose.model<ReadingHistory>('ReadingHistory', readingHistorySchema); 