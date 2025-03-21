import mongoose, { Document, Schema } from 'mongoose';

export interface ReadingHistory extends Document {
    userId: string;
    surah: number;
    verse: number;
    timestamp: Date;
}

const readingHistorySchema = new Schema<ReadingHistory>({
    userId: { type: String, required: true },
    surah: { type: Number, required: true },
    verse: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now }
}, {
    timestamps: true
});

// Create index for efficient queries
readingHistorySchema.index({ userId: 1, timestamp: -1 });
readingHistorySchema.index({ userId: 1, surah: 1, verse: 1 });

export const ReadingHistory = mongoose.model<ReadingHistory>('ReadingHistory', readingHistorySchema); 