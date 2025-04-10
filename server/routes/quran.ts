import express, { Request, Response, NextFunction } from 'express';
import axios from 'axios';

const router = express.Router();
const QURAN_API_BASE = 'https://api.quran.com/api/v4';

// Error handler helper
const handleError = (error: any, res: Response) => {
  console.error('Quran API Error:', error.response?.data || error.message);
  res.status(error.response?.status || 500).json({
    error: error.response?.data || 'Internal Server Error'
  });
};

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
    handleError(error, res);
  }
});

// Get chapters (surahs)
router.get('/chapters', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${QURAN_API_BASE}/chapters`, {
      params: req.query
    });
    res.json(response.data);
  } catch (error) {
    handleError(error, res);
  }
});

// Get verses by chapter
router.get('/verses/by_chapter/:chapter', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${QURAN_API_BASE}/verses/by_chapter/${req.params.chapter}`, {
      params: req.query
    });
    res.json(response.data);
  } catch (error) {
    handleError(error, res);
  }
});

// Get verses by juz
router.get('/verses/by_juz/:juz', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${QURAN_API_BASE}/verses/by_juz/${req.params.juz}`, {
      params: req.query
    });
    res.json(response.data);
  } catch (error) {
    handleError(error, res);
  }
});

// Get verses by page
router.get('/verses/by_page/:page', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${QURAN_API_BASE}/verses/by_page/${req.params.page}`, {
      params: req.query
    });
    res.json(response.data);
  } catch (error) {
    handleError(error, res);
  }
});

// Get verse by key
router.get('/verses/by_key', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${QURAN_API_BASE}/verses/by_key`, {
      params: req.query
    });
    res.json(response.data);
  } catch (error) {
    handleError(error, res);
  }
});

// Get juzs
router.get('/juzs', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${QURAN_API_BASE}/juzs`);
    res.json(response.data);
  } catch (error) {
    handleError(error, res);
  }
});

// Search Quran (NEW ROUTE)
router.get('/search', async (req: Request, res: Response) => {
  try {
    console.log('[Quran Search] Received search request with query:', req.query);
    const response = await axios.get(`${QURAN_API_BASE}/search`, {
      params: req.query // Pass along query params like q, size, page
    });
    console.log('[Quran Search] API response status:', response.status);
    res.json(response.data);
  } catch (error: any) {
    console.error('[Quran Search] Error during search:', error.response?.data || error.message);
    // Forward the status code from the external API if available
    res.status(error.response?.status || 500).json({
      error: 'Quran search failed',
      details: error.response?.data || error.message
    });
  }
});

// Get pages
router.get('/pages', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${QURAN_API_BASE}/pages`);
    res.json(response.data);
  } catch (error) {
    handleError(error, res);
  }
});

export default router; 