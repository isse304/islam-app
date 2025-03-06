import express, { Request, Response } from 'express';
const router = express.Router();

interface UserPreferences {
  selectedReciter: number;
  selectedTranslation: string;
  fontSize: number;
  darkMode: boolean;
  bookmarks: any[];
}

interface ReadingHistoryEntry {
  timestamp: string;
  surah: number;
  ayah: number;
}

// Initialize in-memory storage (replace with your database)
const userPreferences = new Map<string, UserPreferences>();
const readingHistory = new Map<string, ReadingHistoryEntry[]>();

// Get user preferences
router.get('/:userId/preferences', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    // TODO: Add your database logic here
    // For now, we'll just return what's stored in memory
    const preferences = userPreferences.get(userId) || {
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
router.put('/:userId/preferences', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const preferences = req.body;
    
    // TODO: Add your database logic here
    // For now, we'll just store in memory
    userPreferences.set(userId, preferences);
    
    res.json(preferences);
  } catch (error) {
    console.error('Error updating user preferences:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user reading history
router.get('/:userId/reading-history', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    // TODO: Add your database logic here
    // For now, we'll just return what's stored in memory
    const history = readingHistory.get(userId) || [];
    
    res.json(history);
  } catch (error) {
    console.error('Error fetching reading history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add to reading history
router.post('/:userId/reading-history', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const entry = req.body;
    
    // TODO: Add your database logic here
    // For now, we'll just store in memory
    const history = readingHistory.get(userId) || [];
    history.push(entry);
    readingHistory.set(userId, history);
    
    res.json(entry);
  } catch (error) {
    console.error('Error adding to reading history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 