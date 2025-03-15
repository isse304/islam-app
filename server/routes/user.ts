import express, { Response } from 'express';
import * as admin from 'firebase-admin';
import { AuthenticatedRequest, withAuth } from '../middleware/auth';
import mongoose from 'mongoose';
import { Request } from 'express';

const router = express.Router();

// Define interfaces to match frontend
interface UserPreferences {
    selectedReciter: number;
    selectedTranslation: string;
    fontSize: number;
    bookmarks: string[];
    lastState?: {
        isMushafView: boolean;
        lastSurah?: number;
        lastVerse?: number;
        lastPage?: number;
    };
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

const userPreferencesSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    preferences: {
        selectedReciter: { type: Number, default: 7 },
        selectedTranslation: { type: String, default: '131' },
        fontSize: { type: Number, default: 24 },
        bookmarks: [String],
        lastState: {
            isMushafView: Boolean,
            lastSurah: Number,
            lastVerse: Number,
            lastPage: Number
        }
    }
});

// Create models
const ReadingHistory = mongoose.model('ReadingHistory', readingHistorySchema);
const UserPreferences = mongoose.model('UserPreferences', userPreferencesSchema);

// Get user profile and preferences
router.get('/:userId/profile', withAuth(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        if (!req.auth) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        
        // Verify user is accessing their own profile
        if (req.auth.userId !== req.params.userId) {
            res.status(403).json({ error: 'Forbidden - Can only access own profile' });
            return;
        }

        const userId = req.auth.userId;
        
        // Get Firebase user data
        let userRecord;
        if (process.env.NODE_ENV === 'development') {
            // Mock user data in development
            userRecord = {
                email: 'test@example.com',
                displayName: 'Test User',
                photoURL: null,
                metadata: {
                    creationTime: new Date().toISOString()
                }
            };
        } else {
            userRecord = await admin.auth().getUser(userId);
        }
        
        // Get or create preferences
        let preferences = await UserPreferences.findOne({ userId });
        if (!preferences) {
            preferences = await UserPreferences.create({
                userId,
                preferences: {
                    selectedReciter: 7,
                    selectedTranslation: '131',
                    fontSize: 24,
                    bookmarks: []
                }
            });
        }

        res.json({
            user: {
                email: userRecord.email,
                firstName: userRecord.displayName?.split(' ')[0] || '',
                lastName: userRecord.displayName?.split(' ')[1] || '',
                imageUrl: userRecord.photoURL,
                createdAt: userRecord.metadata.creationTime
            },
            preferences: preferences.preferences
        });
    } catch (error) {
        console.error('Error getting user profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));

// Get only user preferences
router.get('/:userId/preferences', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        // In development mode, proceed with the request using the userId from the URL
        const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
        if (isDevelopment) {
            console.log('Development mode: Using userId from URL params for preferences');
            const userId = req.params.userId;
            
            // Get or create preferences
            let preferences = await UserPreferences.findOne({ userId });
            if (!preferences) {
                preferences = await UserPreferences.create({
                    userId,
                    preferences: {
                        selectedReciter: 7,
                        selectedTranslation: '131',
                        fontSize: 24,
                        bookmarks: []
                    }
                });
            }
            
            res.json(preferences.preferences);
            return;
        }
        
        // Regular auth check for non-development environments
        if (!req.auth) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        
        // Verify user is accessing their own preferences
        if (req.auth.userId !== req.params.userId) {
            res.status(403).json({ error: 'Forbidden - Can only access own preferences' });
            return;
        }

        const userId = req.auth.userId;
        
        // Get or create preferences
        let preferences = await UserPreferences.findOne({ userId });
        if (!preferences) {
            preferences = await UserPreferences.create({
                userId,
                preferences: {
                    selectedReciter: 7,
                    selectedTranslation: '131',
                    fontSize: 24,
                    bookmarks: []
                }
            });
        }

        res.json(preferences.preferences);
    } catch (error) {
        console.error('Error getting user preferences:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update user preferences
router.put('/:userId/preferences', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        // In development mode, proceed with the request using the userId from the URL
        const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
        if (isDevelopment) {
            console.log('Development mode: Using userId from URL params for updating preferences');
            const userId = req.params.userId;
            const newPreferences = req.body;
            
            // Update or create preferences
            const preferences = await UserPreferences.findOneAndUpdate(
                { userId },
                { preferences: newPreferences },
                { new: true, upsert: true }
            );
            
            res.json({ preferences: preferences.preferences });
            return;
        }
        
        // Regular auth check for non-development environments
        if (!req.auth) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        
        // Verify user is updating their own preferences
        if (req.auth.userId !== req.params.userId) {
            res.status(403).json({ error: 'Forbidden - Can only update own preferences' });
            return;
        }

        const userId = req.auth.userId;
        const newPreferences = req.body;

        // Update or create preferences
        const preferences = await UserPreferences.findOneAndUpdate(
            { userId },
            { preferences: newPreferences },
            { new: true, upsert: true }
        );

        res.json({ preferences: preferences.preferences });
    } catch (error) {
        console.error('Preferences update error:', error);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});

// Get reading history
router.get('/:userId/history', withAuth(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        if (!req.auth) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        
        // Verify user is accessing their own history
        if (req.auth.userId !== req.params.userId) {
            res.status(403).json({ error: 'Forbidden - Can only access own history' });
            return;
        }

        const history = await ReadingHistory.find({ userId: req.auth.userId })
            .sort({ timestamp: -1 })
            .limit(100); // Limit to last 100 entries

        res.json({ history });
    } catch (error) {
        console.error('History fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch reading history' });
    }
}));

// Add reading history entry
router.post('/:userId/history', withAuth(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        if (!req.auth) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        
        // Verify user is adding to their own history
        if (req.auth.userId !== req.params.userId) {
            res.status(403).json({ error: 'Forbidden - Can only add to own history' });
            return;
        }

        const { surah, verse } = req.body;
        
        // Validate surah and verse numbers
        if (!surah || !verse || surah < 1 || surah > 114 || verse < 1) {
            res.status(400).json({ error: 'Invalid surah or verse number' });
            return;
        }

        // Create new history entry
        const historyEntry = new ReadingHistory({
            userId: req.auth.userId,
            surah,
            verse,
            timestamp: new Date()
        });

        await historyEntry.save();
        res.json({ message: 'Reading history entry added successfully' });
    } catch (error) {
        console.error('History entry error:', error);
        res.status(500).json({ error: 'Failed to add history entry' });
    }
}));

// Clear reading history
router.delete('/:userId/history', withAuth(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        if (!req.auth) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        
        // Verify user is clearing their own history
        if (req.auth.userId !== req.params.userId) {
            res.status(403).json({ error: 'Forbidden - Can only clear own history' });
            return;
        }

        await ReadingHistory.deleteMany({ userId: req.auth.userId });
        res.json({ message: 'Reading history cleared successfully' });
    } catch (error) {
        console.error('History clear error:', error);
        res.status(500).json({ error: 'Failed to clear reading history' });
    }
}));

// Get user bookmarks
router.get('/:userId/bookmarks', (req: Request, res: Response) => {
    try {
        const userId = req.params.userId;
        
        if (process.env.NODE_ENV === 'development') {
            // In development, return mock bookmarks
            res.json(['1:1', '2:255', '36:1', '67:1', '112:1']);
        } else {
            // In production, you would fetch from a database
            // For now, return an empty array
            res.json([]);
        }
    } catch (error) {
        console.error('Error fetching bookmarks:', error);
        res.status(500).json({ error: 'Failed to retrieve bookmarks' });
    }
});

// Add a bookmark
router.post('/:userId/bookmarks', (req: Request, res: Response) => {
    try {
        const userId = req.params.userId;
        const { verseReference } = req.body;
        
        if (!verseReference) {
            return res.status(400).json({ error: 'Verse reference is required' });
        }
        
        if (process.env.NODE_ENV === 'development') {
            // In development, just acknowledge the addition
            console.log(`Added bookmark ${verseReference} for user ${userId}`);
            res.json({ success: true, message: 'Bookmark added successfully' });
        } else {
            // In production, you would add to a database
            res.json({ success: true, message: 'Bookmark added successfully' });
        }
    } catch (error) {
        console.error('Error adding bookmark:', error);
        res.status(500).json({ error: 'Failed to add bookmark' });
    }
});

// Delete a bookmark
router.delete('/:userId/bookmarks/:verseReference', (req: Request, res: Response) => {
    try {
        const userId = req.params.userId;
        const verseReference = req.params.verseReference;
        
        if (process.env.NODE_ENV === 'development') {
            // In development, just acknowledge the deletion
            console.log(`Removed bookmark ${verseReference} for user ${userId}`);
            res.json({ success: true, message: 'Bookmark removed successfully' });
        } else {
            // In production, you would remove from a database
            res.json({ success: true, message: 'Bookmark removed successfully' });
        }
    } catch (error) {
        console.error('Error removing bookmark:', error);
        res.status(500).json({ error: 'Failed to remove bookmark' });
    }
});

// Check if user is admin
router.get('/:userId/admin-status', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        // In development mode, automatically grant admin access
        const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
        if (isDevelopment) {
            console.log('Development mode: Auto-granting admin status for user:', req.params.userId);
            res.json({ isAdmin: true });
            return;
        }
        
        // Regular auth check for non-development environments
        if (!req.auth) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        
        // Verify user is checking their own admin status
        if (req.auth.userId !== req.params.userId) {
            res.status(403).json({ error: 'Forbidden - Can only check own admin status' });
            return;
        }

        // Check against admin list from environment variables
        const adminUsers = process.env.ADMIN_USERS ? process.env.ADMIN_USERS.split(',') : [];
        const isAdmin = adminUsers.includes(req.auth.userId);
        
        res.json({ isAdmin });
    } catch (error) {
        console.error('Admin status check error:', error);
        res.status(500).json({ error: 'Failed to check admin status' });
    }
});

// Get reading history
router.get('/:userId/reading-history', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { userId } = req.params;
    
    // In development mode, return mock data
    const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
    if (isDevelopment) {
        console.log('Development mode: Returning mock reading history');
        
        // Return mock reading history
        const mockHistory = [
            { surah: 1, verse: 1, timestamp: new Date(Date.now() - 86400000) },
            { surah: 2, verse: 255, timestamp: new Date(Date.now() - 172800000) },
            { surah: 36, verse: 1, timestamp: new Date(Date.now() - 259200000) }
        ];
        
        res.json(mockHistory);
        return;
    }
    
    try {
        // For production, you would get this from your database
        // const history = await db.getUserReadingHistory(userId);
        
        // For now, return empty array
        res.json([]);
    } catch (error) {
        console.error('Error getting reading history:', error);
        res.status(500).json({ error: 'Failed to get reading history' });
    }
});

// Update reading history
router.put('/:userId/reading-history', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { userId } = req.params;
    const history = req.body;
    
    // In development mode, just acknowledge
    const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
    if (isDevelopment) {
        console.log('Development mode: Acknowledging reading history update');
        res.json({ success: true });
        return;
    }
    
    try {
        // For production, you would save this to your database
        // await db.updateUserReadingHistory(userId, history);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating reading history:', error);
        res.status(500).json({ error: 'Failed to update reading history' });
    }
});

// Delete reading history
router.delete('/:userId/reading-history', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { userId } = req.params;
    
    // In development mode, just acknowledge
    const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
    if (isDevelopment) {
        console.log('Development mode: Acknowledging reading history deletion');
        res.json({ success: true });
        return;
    }
    
    try {
        // For production, you would clear this from your database
        // await db.clearUserReadingHistory(userId);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error clearing reading history:', error);
        res.status(500).json({ error: 'Failed to clear reading history' });
    }
});

export default router; 