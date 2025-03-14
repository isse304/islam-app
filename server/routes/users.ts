import express, { Request, Response } from 'express';
import { ReadingHistory } from '../models/ReadingHistory';
import { AuthenticatedRequest, authenticateUser, withAuth } from '../middleware/auth';
import axios from 'axios';

// Extend express Request type to include auth property
interface AuthRequest extends Request {
  auth: {
    userId: string;
    sessionId: string;
    token?: string;
  };
}

// Cache verse counts to avoid repeated API calls
const verseCountCache = new Map<number, number>();

// Utility function to get verse count from API or cache
async function getVerseCount(surah: number): Promise<number> {
  // Check cache first
  if (verseCountCache.has(surah)) {
    return verseCountCache.get(surah)!;
  }

  try {
    // Fetch from Quran API
    const response = await axios.get(`https://api.quran.com/api/v4/chapters/${surah}`);
    const verseCount = response.data.chapter.verses_count;
    
    // Cache the result
    verseCountCache.set(surah, verseCount);
    
    return verseCount;
  } catch (error) {
    console.error('Error fetching verse count:', error);
    throw new Error('Failed to validate verse number');
  }
}

// Utility function to validate verse number
async function isValidVerse(surah: number, verse: number): Promise<boolean> {
  if (surah < 1 || surah > 114) return false;
  if (verse < 1) return false;
  
  try {
    const verseCount = await getVerseCount(surah);
    return verse <= verseCount;
  } catch (error) {
    console.error('Error validating verse:', error);
    throw error;
  }
}

const router = express.Router();

interface UserPreferences {
  selectedReciter: number;
  selectedTranslation: string;
  fontSize: number;
  darkMode: boolean;
  bookmarks: any[];
}

// Get user reading history with pagination
router.get('/:userId/reading-history', withAuth(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.auth.userId;
  
  try {
    const history = await ReadingHistory.find({ userId })
      .sort({ timestamp: -1 });
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reading history' });
  }
}));

// Add to reading history
router.post('/:userId/reading-history', withAuth(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.auth.userId;
  const { surah, verse, timestamp } = req.body;

  try {
    // Create new reading history entry
    const newHistory = new ReadingHistory({
      userId,
      surah,
      verse,
      timestamp: timestamp || new Date()
    });

    const savedHistory = await newHistory.save();
    res.json(savedHistory);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save reading history' });
  }
}));

// Delete reading history
router.delete('/:userId/reading-history/:historyId', withAuth(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.auth.userId;
  const { historyId } = req.params;

  try {
    const deletedHistory = await ReadingHistory.findOneAndDelete({ _id: historyId, userId });
    if (!deletedHistory) {
      res.status(404).json({ error: 'History entry not found' });
      return;
    }
    res.json({ message: 'History entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete history entry' });
  }
}));

// Get user preferences
router.get('/:userId/preferences', withAuth(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.auth.userId;
  
  // Return user preferences from database
  // This is a placeholder - implement actual database query
  const preferences: UserPreferences = {
    selectedReciter: 1,
    selectedTranslation: 'en.sahih',
    fontSize: 16,
    darkMode: false,
    bookmarks: []
  };
  
  res.json(preferences);
}));

// Update user preferences
router.put('/:userId/preferences', withAuth(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.auth.userId;
  const preferences = req.body;

  // Update user preferences in database
  // This is a placeholder - implement actual database update
  res.json({ message: 'Preferences updated successfully', preferences });
}));

// Check if user has admin status
router.get('/:userId/admin-status', withAuth(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.auth.userId;
  const requestedUserId = req.params.userId;
  
  // Log the request for debugging
  console.log(`Admin status check - Auth userId: ${userId}, Requested userId: ${requestedUserId}`);
  
  try {
    // Check if ADMIN_USERS env variable exists
    if (!process.env.ADMIN_USERS) {
      console.log(`No ADMIN_USERS env variable defined, setting default admin status for ${userId} in ${process.env.NODE_ENV} mode`);
      
      // In development mode, automatically grant admin status to make testing easier
      const isDevMode = process.env.NODE_ENV === 'development';
      res.json({ 
        isAdmin: isDevMode, 
        message: isDevMode ? 
          'Admin status granted automatically in development mode' : 
          'Admin status check failed, ADMIN_USERS not configured'
      });
      return;
    }
    
    // Check if user is in admin list
    // ADMIN_USERS can be a single ID or a comma-separated list
    const adminUsers = process.env.ADMIN_USERS.split(',').map(id => id.trim());
    const isAdmin = adminUsers.includes(userId);
    
    console.log(`Admin status check for ${userId}: ${isAdmin ? 'Admin' : 'Not admin'}, Admin list: ${adminUsers.join(', ')}`);
    res.json({ isAdmin });
  } catch (error) {
    console.error('Error checking admin status:', error);
    res.status(500).json({ error: 'Failed to check admin status' });
  }
}));

export default router; 