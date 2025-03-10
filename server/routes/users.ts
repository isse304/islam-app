import express, { Request, Response } from 'express';
import { ReadingHistory } from '../models/ReadingHistory';
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';
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
const requireAuth = ClerkExpressRequireAuth();

interface UserPreferences {
  selectedReciter: number;
  selectedTranslation: string;
  fontSize: number;
  darkMode: boolean;
  bookmarks: any[];
}

// Get user reading history with pagination
router.get('/:userId/reading-history', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    
    // Verify user is accessing their own data
    if (req.auth.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;

    const [history, total] = await Promise.all([
      ReadingHistory.find({ userId })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ReadingHistory.countDocuments({ userId })
    ]);

    res.json({
      history,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    console.error('Error fetching reading history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add to reading history
router.post('/:userId/reading-history', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    
    // Verify user is accessing their own data
    if (req.auth.userId !== userId) {
      console.error('Unauthorized access attempt:', {
        requestUserId: userId,
        authUserId: req.auth.userId
      });
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const { surah, verse } = req.body;
    console.log('Received reading history request:', { userId, surah, verse });

    // Validate input
    if (!surah || !verse) {
      console.error('Missing required fields:', { surah, verse });
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate surah and verse numbers
    try {
      const isValid = await isValidVerse(surah, verse);
      if (!isValid) {
        const verseCount = await getVerseCount(surah);
        console.error('Invalid verse number:', { surah, verse, verseCount });
        return res.status(400).json({ 
          error: 'Invalid verse number',
          message: `Surah ${surah} has ${verseCount} verses. Received verse ${verse}.`
        });
      }
    } catch (error) {
      console.error('Error validating verse:', error);
      return res.status(500).json({ error: 'Error validating verse number' });
    }

    // Create new entry
    const entry = new ReadingHistory({
      userId,
      surah,
      verse,
      timestamp: new Date()
    });

    console.log('Attempting to save entry:', entry);

    // Save entry
    await entry.save();
    console.log('Entry saved successfully');
    
    res.status(201).json(entry);
  } catch (error: any) {
    // Handle duplicate entry error
    if (error.code === 11000 || error.message === 'Duplicate entry handled') {
      console.log('Duplicate entry handled:', error);
      return res.status(200).json({ 
        status: 'success',
        message: 'Reading history updated successfully' 
      });
    }
    
    console.error('Error adding to reading history:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Delete reading history
router.delete('/:userId/reading-history', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    
    // Verify user is accessing their own data
    if (req.auth.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }
    
    // Delete all history entries for this user
    await ReadingHistory.deleteMany({ userId });
    
    res.status(200).json({ message: 'Reading history cleared successfully' });
  } catch (error) {
    console.error('Error clearing reading history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user preferences
router.get('/:userId/preferences', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    
    // Verify user is accessing their own data
    if (req.auth.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    // TODO: Add your database logic here
    // For now, we'll just return what's stored in memory
    const preferences = {
      selectedReciter: 7,
      selectedTranslation: '131',
      fontSize: 24,
      darkMode: false,
      bookmarks: []
    };
    
    res.json(preferences);
  } catch (error) {
    console.error('Error fetching user preferences:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user preferences
router.put('/:userId/preferences', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    
    // Verify user is accessing their own data
    if (req.auth.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const preferences = req.body;
    
    // TODO: Add your database logic here
    // For now, we'll just return the preferences
    res.json(preferences);
  } catch (error) {
    console.error('Error updating user preferences:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 