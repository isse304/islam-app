import express, { Response } from 'express';
import * as admin from 'firebase-admin';
import { AuthenticatedRequest, withAuth } from '../middleware/auth';
import mongoose from 'mongoose';

const router = express.Router();

// Define interfaces
interface UserPreferences {
    userId: string;
    selectedReciter: number;
    selectedTranslation: string;
    fontSize: number;
    isDarkMode: boolean;
    arabicFont: string;
    showWordByWord: boolean;
    isMushafView: boolean;
    isDoublePageView: boolean;
    lastState?: {
        lastSurah: number;
        lastVerse: number;
        isMushafView: boolean;
        timestamp: Date;
    };
    readingHistory?: Array<{
        surah: number;
        verse: number;
        timestamp: string;
    }>;
}

interface ReadingHistoryEntry {
    userId: string;
    timestamp: Date;
    surah: number;
    verse: number;
}

// Create schemas
const readingHistorySchema = new mongoose.Schema<ReadingHistoryEntry>({
    userId: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    surah: { type: Number, required: true },
    verse: { type: Number, required: true }
});

// Create compound unique index on userId and surah to ensure one entry per surah per user
readingHistorySchema.index({ userId: 1, surah: 1 }, { unique: true });

const userPreferencesSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    preferences: {
        selectedReciter: { type: Number, default: 1 },
        selectedTranslation: { type: String, default: '131' },
        bookmarks: [String],
        lastState: {
            isMushafView: Boolean,
            lastSurah: Number,
            lastVerse: Number,
            lastPage: Number,
            timestamp: { type: Date, default: Date.now }
        },
        readingHistory: [{
            surah: Number,
            verse: Number,
            timestamp: { type: Date, default: Date.now }
        }]
    }
});

// Create models
const ReadingHistory = mongoose.model('ReadingHistory', readingHistorySchema);
const UserPreferences = mongoose.model('UserPreferences', userPreferencesSchema);

// Helper function to verify user access
const verifyUserAccess = (req: AuthenticatedRequest, userId: string): boolean => {
    if (!req.auth) return false;
    return req.auth.userId === userId;
};

// Helper function to get default preferences
const getDefaultPreferences = (userId: string) => ({
    userId,
    preferences: {
        selectedReciter: 1,
        selectedTranslation: '131',
        bookmarks: [],
        lastState: {
            isMushafView: false,
            lastSurah: 1,
            lastVerse: 1,
            lastPage: 1,
            timestamp: new Date()
        },
        readingHistory: []
    }
});

// Get user data (preferences, bookmarks, history)
router.get('/:userId/data', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.userId;
        
        // Get or create user preferences
        const userPrefs = await UserPreferences.findOne({ userId }) || 
                         await UserPreferences.create(getDefaultPreferences(userId));

        // Ensure preferences exist
        const preferences = userPrefs.preferences || getDefaultPreferences(userId).preferences;

        res.json({
            success: true,
            preferences: preferences,
            bookmarks: preferences.bookmarks || [],
            history: preferences.readingHistory || []
        });
    } catch (error) {
        console.error('Error getting user data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));

// Update user data
router.put('/:userId/data', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.userId;
        const { preferences: newPreferences } = req.body;

        // Get or create user preferences
        let userPrefs = await UserPreferences.findOne({ userId });
        if (!userPrefs) {
            userPrefs = await UserPreferences.create(getDefaultPreferences(userId));
        }

        // Ensure preferences exist
        const currentPreferences = userPrefs.preferences || getDefaultPreferences(userId).preferences;

        // Update preferences
        if (newPreferences) {
            userPrefs.preferences = {
                ...currentPreferences,
                ...newPreferences,
                bookmarks: newPreferences.bookmarks || currentPreferences.bookmarks || [],
                readingHistory: newPreferences.readingHistory || currentPreferences.readingHistory || []
            };
            await userPrefs.save();
        }

        // Get the updated preferences
        const savedPreferences = userPrefs.preferences || getDefaultPreferences(userId).preferences;

        res.json({
            success: true,
            preferences: savedPreferences,
            bookmarks: savedPreferences.bookmarks || [],
            history: savedPreferences.readingHistory || []
        });
    } catch (error) {
        console.error('Error updating user data:', error);
        res.status(500).json({ error: 'Failed to update user data' });
    }
}));

// For backward compatibility - redirect old endpoints to new ones
router.get('/:userId/preferences', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.userId;
        const userPrefs = await UserPreferences.findOne({ userId }) || await UserPreferences.create(getDefaultPreferences(userId));
        res.json({
            success: true,
            preferences: userPrefs.preferences
        });
    } catch (error) {
        console.error('Error getting preferences:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));

router.put('/:userId/preferences', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.userId;
        const { preferences: newPreferences } = req.body;

        // Get or create user preferences
        let userPrefs = await UserPreferences.findOne({ userId });
        if (!userPrefs) {
            userPrefs = await UserPreferences.create(getDefaultPreferences(userId));
        }

        // Update preferences
        if (newPreferences) {
            userPrefs.preferences = {
                ...userPrefs.preferences,
                ...newPreferences,
                bookmarks: newPreferences.bookmarks || userPrefs.preferences?.bookmarks || [],
                readingHistory: newPreferences.readingHistory || userPrefs.preferences?.readingHistory || []
            };
            await userPrefs.save();
        }

        res.json({
            success: true,
            preferences: userPrefs.preferences
        });
    } catch (error) {
        console.error('Error updating preferences:', error);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
}));

// Get reading history
router.get('/:userId/reading-history', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.userId;
        const history = await ReadingHistory.find({ userId })
            .sort({ timestamp: -1 })
            .limit(100)
            .lean();

        res.json({ success: true, history });
    } catch (error) {
        console.error('Error getting reading history:', error);
        res.status(500).json({ success: false, error: 'Failed to get reading history' });
    }
}));

// Save reading history entry
router.post('/:userId/reading-history', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.userId;
        const { surah, verse } = req.body;

        // Enhanced input validation
        if (!surah || !verse) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: surah and verse are required.' 
            });
        }

        // Convert to numbers and validate
        const surahNum = Number(surah);
        const verseNum = Number(verse);

        if (isNaN(surahNum) || isNaN(verseNum)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid input: surah and verse must be valid numbers.' 
            });
        }

        if (surahNum < 1 || surahNum > 114 || verseNum < 1) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid input: surah must be between 1 and 114, verse must be positive.' 
            });
        }

        // Find existing entry for this surah
        let historyEntry = await ReadingHistory.findOne({ userId, surah: surahNum });
        
        if (historyEntry) {
            // Update existing entry
            historyEntry.verse = verseNum;
            historyEntry.timestamp = new Date();
            await historyEntry.save();
        } else {
            // Create new entry if none exists
            historyEntry = new ReadingHistory({
                userId,
                surah: surahNum,
                verse: verseNum,
                timestamp: new Date()
            });
            await historyEntry.save();
        }

        // Update user preferences with latest reading state
        const userPrefs = await UserPreferences.findOne({ userId });
        if (userPrefs && userPrefs.preferences) {
            if (!userPrefs.preferences.lastState) {
                userPrefs.preferences.lastState = {
                    isMushafView: false,
                    lastSurah: surahNum,
                    lastVerse: verseNum,
                    lastPage: 1,
                    timestamp: new Date()
                };
            } else {
                userPrefs.preferences.lastState = {
                    ...userPrefs.preferences.lastState,
                    lastSurah: surahNum,
                    lastVerse: verseNum,
                    timestamp: new Date()
                };
            }
            await userPrefs.save();
        }

        res.json({ 
            success: true, 
            entry: historyEntry,
            message: 'Reading history updated successfully'
        });
    } catch (error) {
        console.error('Error saving reading history:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to save reading history',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

// Clear reading history
router.delete('/:userId/reading-history', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.userId;
        await ReadingHistory.deleteMany({ userId });

        res.json({ success: true, message: 'Reading history cleared' });
    } catch (error) {
        console.error('Error clearing reading history:', error);
        res.status(500).json({ success: false, error: 'Failed to clear reading history' });
    }
}));

// Get user bookmarks
router.get('/:userId/bookmarks', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.userId;
        const userPrefs = await UserPreferences.findOne({ userId }) || await UserPreferences.create(getDefaultPreferences(userId));
        res.json(userPrefs?.preferences?.bookmarks || []);
    } catch (error) {
        console.error('Error getting bookmarks:', error);
        res.status(500).json({ success: false, error: 'Failed to get bookmarks' });
    }
}));

// Add bookmark
router.post('/:userId/bookmarks', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.userId;
        const { verseReference } = req.body;

        if (!verseReference) {
            return res.status(400).json({ 
                success: false, 
                message: 'Verse reference is required',
                bookmarks: []
            });
        }

        // Get or create user preferences with default values
        let userPrefs = await UserPreferences.findOne({ userId });
        if (!userPrefs || !userPrefs.preferences) {
            userPrefs = await UserPreferences.create(getDefaultPreferences(userId));
        }

        // At this point we know userPrefs and preferences exist
        const preferences = userPrefs.preferences!;

        // Ensure bookmarks array exists
        if (!preferences.bookmarks) {
            preferences.bookmarks = [];
        }

        // Add bookmark if it doesn't exist
        if (!preferences.bookmarks.includes(verseReference)) {
            preferences.bookmarks.push(verseReference);
            await userPrefs.save();
        }

        res.json({ 
            success: true, 
            message: 'Bookmark added successfully',
            bookmarks: preferences.bookmarks 
        });
    } catch (error) {
        console.error('Error adding bookmark:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to add bookmark',
            bookmarks: []
        });
    }
}));

// Delete bookmark
router.delete('/:userId/bookmarks/:bookmark', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.userId;
        const bookmark = req.params.bookmark;

        // Get or create user preferences with default values
        let userPrefs = await UserPreferences.findOne({ userId });
        if (!userPrefs || !userPrefs.preferences) {
            userPrefs = await UserPreferences.create(getDefaultPreferences(userId));
        }

        // At this point we know userPrefs and preferences exist
        const preferences = userPrefs.preferences!;

        // Ensure bookmarks array exists
        if (!preferences.bookmarks) {
            preferences.bookmarks = [];
        }

        // Remove bookmark
        preferences.bookmarks = preferences.bookmarks.filter(b => b !== bookmark);
        await userPrefs.save();

        res.json({ 
            success: true, 
            message: 'Bookmark removed successfully',
            bookmarks: preferences.bookmarks 
        });
    } catch (error) {
        console.error('Error removing bookmark:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to remove bookmark',
            bookmarks: []
        });
    }
}));

export default router; 