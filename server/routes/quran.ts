import express, { Request, Response, NextFunction } from 'express';

const router = express.Router();

// Get translations list
router.get('/translations', (req: Request, res: Response, next: NextFunction) => {
  try {
    const translations = [
      { id: '131', name: 'Sahih International', language: 'en' },
      { id: '20', name: 'Sahih Al-Bukhari', language: 'en' },
      { id: '149', name: 'Abdel Haleem', language: 'en' },
      { id: '85', name: 'Abdul Majid Daryabadi', language: 'en' },
      { id: '203', name: 'Dr. Mustafa Khattab', language: 'en' },
      { id: '207', name: 'Saheeh International', language: 'en' },
      { id: '84', name: 'Abdullah Yusuf Ali', language: 'en' },
      { id: '22', name: 'Dr. Ghali', language: 'en' },
      { id: '95', name: 'Muhammad Taqi-ud-Din al-Hilali and Muhammad Muhsin Khan', language: 'en' },
      { id: '57', name: 'Yusuf Ali', language: 'en' },
      { id: '17', name: 'Dr. T.B. Irving', language: 'en' }
    ];
    
    res.json(translations);
  } catch (error) {
    console.error('Error fetching translations:', error);
    next(error);
  }
});

export default router; 