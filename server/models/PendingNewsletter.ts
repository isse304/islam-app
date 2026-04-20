import { Schema, model, Document } from 'mongoose';

export interface IPendingNewsletter extends Document {
  contentId: string;
  surah: number;
  verse: number;
  surahName: string;
  verseText: { arabic: string; translation: string } | null;
  usedScholarlySources: boolean;
  reflection: string;
  tafsirSource: string;
  validation: {
    passed: boolean;
    attempts: number;
    issues: string[];
  };
  status: 'pending' | 'approved' | 'sent' | 'rejected';
  createdAt: Date;
  approvedAt: Date | null;
}

const pendingNewsletterSchema = new Schema<IPendingNewsletter>({
  contentId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  surah: { type: Number, required: true },
  verse: { type: Number, required: true },
  surahName: { type: String, required: true },
  verseText: { type: Schema.Types.Mixed, default: null },
  usedScholarlySources: { type: Boolean, default: false },
  reflection: { type: String, required: true },
  tafsirSource: { type: String, default: '' },
  validation: {
    passed: { type: Boolean, default: false },
    attempts: { type: Number, default: 0 },
    issues: [{ type: String }]
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'sent', 'rejected'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now },
  approvedAt: { type: Date, default: null }
});

export const PendingNewsletter = model<IPendingNewsletter>(
  'PendingNewsletter',
  pendingNewsletterSchema
);
