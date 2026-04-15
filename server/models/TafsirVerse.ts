import mongoose from 'mongoose';

const tafsirVerseSchema = new mongoose.Schema({
  surah: { type: Number, required: true, index: true },
  verse: { type: Number, required: true, index: true },
  edition: { type: String, required: true, index: true },
  content: { type: String, required: true },
  rawBlobVerses: { type: String },
  processedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'tafsir_verses'
});

tafsirVerseSchema.index({ surah: 1, verse: 1, edition: 1 }, { unique: true });

export const TafsirVerse = mongoose.model('TafsirVerse', tafsirVerseSchema);
