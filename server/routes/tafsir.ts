import express, { Request, Response } from 'express';
import { withAuth, AuthenticatedRequest } from '../middleware/auth';
import axios from 'axios';
import { OpenAIService } from '../services/openai.service';
import { TafsirCacheService } from '../services/tafsir-cache.service';

const router = express.Router();
const openai = new OpenAIService();
const tafsirCacheService = new TafsirCacheService();

interface TafsirSourceConfig {
  baseUrl: string;
  language: string;
}

interface TafsirContent {
  ibnKathir?: string;
  tabari?: string;
}

// Configuration for different tafsir sources
const tafsirSources: Record<string, TafsirSourceConfig> = {
  'ibn-kathir': {
    baseUrl: 'https://api.qurancdn.com/api/qdc/tafsirs/en-tafisr-ibn-kathir',
    language: 'en'
  },
  'tabari': {
    baseUrl: 'https://api.qurancdn.com/api/qdc/tafsirs/ar-tafsir-al-tabari',
    language: 'ar'
  }
};

// Get raw tafsir from a specific source
router.get('/:source/:surah/:verse', async (req: Request, res: Response) => {
  try {
    const { source, surah, verse } = req.params;
    console.log('Fetching tafsir for:', { source, surah, verse });

    const sourceConfig = tafsirSources[source as keyof typeof tafsirSources];
    if (!sourceConfig) {
      console.warn('Invalid tafsir source requested:', source);
      return res.status(400).json({ 
        error: 'Invalid tafsir source',
        text: 'This tafsir source is not available.'
      });
    }

    // Validate surah and verse numbers
    const surahNum = parseInt(surah);
    const verseNum = parseInt(verse);
    if (isNaN(surahNum) || isNaN(verseNum) || surahNum < 1 || surahNum > 114 || verseNum < 1) {
      console.warn('Invalid surah or verse number:', { surah, verse });
      return res.status(400).json({
        error: 'Invalid surah or verse number',
        text: 'Please provide valid surah and verse numbers.'
      });
    }

    const url = `${sourceConfig.baseUrl}/by_ayah/${surah}:${verse}`;
    console.log('Making request to QuranCDN:', url);
    
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'IslamApp/1.0'
        }
      });

      console.log('QuranCDN response:', {
        status: response.status,
        hasData: !!response.data,
        hasTafsir: !!response.data?.tafsir,
        hasText: !!response.data?.tafsir?.text
      });

      if (!response.data?.tafsir?.text) {
        console.warn('No tafsir content found:', { source, surah, verse });
        return res.status(404).json({
          error: 'Tafsir not found',
          text: 'Tafsir is not available for this verse.',
          metadata: {
            source,
            language: sourceConfig.language,
            reference: `${surah}:${verse}`
          }
        });
      }

      // Clean up the HTML and format the text
      let cleanText = response.data.tafsir.text
        .replace(/<h2>/g, '\n\n')
        .replace(/<\/h2>/g, '\n')
        .replace(/<p>/g, '\n')
        .replace(/<\/p>/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\n\s*\n/g, '\n\n')
        .trim();

      // Special handling for Arabic text
      if (sourceConfig.language === 'ar') {
        cleanText = cleanText
          .replace(/\s+/g, ' ')  // Normalize whitespace
          .split(/[.。।॥]/g)     // Split by sentence endings
          .map((sentence: string) => sentence.trim())
          .filter((sentence: string) => sentence.length > 0)
          .join('\n\n');
      }

      console.log('Successfully fetched and cleaned tafsir text:', {
        source,
        surah,
        verse,
        textLength: cleanText.length
      });

      return res.json({
        text: cleanText,
        metadata: {
          source,
          language: sourceConfig.language,
          reference: `${surah}:${verse}`
        }
      });

    } catch (apiError: any) {
      console.error('QuranCDN API error:', {
        source,
        surah,
        verse,
        url,
        status: apiError.response?.status,
        statusText: apiError.response?.statusText,
        error: apiError.message,
        data: apiError.response?.data
      });

      // Return a more graceful error response
      return res.status(404).json({
        error: 'Failed to fetch tafsir',
        text: 'The tafsir service is temporarily unavailable. Please try again later.',
        metadata: {
          source,
          language: sourceConfig.language,
          reference: `${surah}:${verse}`
        }
      });
    }
  } catch (error: any) {
    console.error('Server error in tafsir route:', {
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      error: 'Internal server error',
      text: 'An unexpected error occurred. Please try again later.'
    });
  }
});

// Tafsir chat endpoint
router.post('/chat', withAuth(async (req: Request, res: Response) => {
  try {
    const { surah, verse, question, isFirstResponse = false, selectedTafsir = 'ibn-kathir' } = req.body;
    
    if (!surah || !verse || !question) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters' 
      });
    }

    // Get only the selected tafsir content
    const tafsirContent = await getTafsirContent(selectedTafsir, surah, verse);
    const hasTafsirContent = !!tafsirContent;

    // Construct the system message based on available content
    let systemMessage = '';
    if (hasTafsirContent) {
      const scholarName = selectedTafsir === 'ibn-kathir' ? 'Ibn Kathir' : 'Al-Tabari';
      systemMessage = `You are a knowledgeable Islamic scholar answering questions about the Quran based on ${scholarName}'s tafsir. You will be provided with tafsir content for specific verses.

CRITICAL RULES FOR AUTHENTIC RESPONSES:
1. MANDATORY SOURCE ATTRIBUTION AND OPINION HIERARCHY:
   - Every paragraph MUST start with "[Source: ${scholarName}]"
   - When multiple opinions exist in the tafsir:
     a) Present the opinion that has the strongest chain of narration first, labeled as "Most Authentic Opinion:"
     b) Present other opinions as "Alternative Opinion:", explaining their relative authenticity based on their chains of narration
   - Use exact quotes when available: '[Source: ${scholarName}] As stated in the text: "..."'
   - If a point is not found in the source: '[Note: This specific point is not directly addressed in ${scholarName}'s tafsir.]'

2. RESPONSE STRUCTURE:
   - CONTEXT OF REVELATION (if mentioned in tafsir):
     • Where the verse was revealed (Makkah/Madinah)
     • The specific circumstances or events that led to its revelation
     • The time period or historical context
   - MAIN INTERPRETATION:
     • Present interpretations in order of authenticity based on chain of narration
     • Include supporting evidence (Quran/Hadith) exactly as cited in the tafsir
     • Explain any specific rulings or implications mentioned
   - WORD EXPLANATIONS:
     • Only explain words that are explicitly defined in the tafsir

3. AUTHENTICITY ENFORCEMENT:
   - NEVER make statements without direct basis in the provided tafsir
   - Present narrations in order of their authenticity as classified in the tafsir
   - When multiple opinions exist, clearly explain why one is considered more authentic based on the tafsir's own assessment
   - For controversial verses, stick strictly to what is mentioned in the tafsir text
   - If asked about something not covered in the tafsir, explicitly state that the topic is not addressed

AVAILABLE TAFSIR SOURCE:
[${scholarName}'s Tafsir]:
${tafsirContent}

QUESTION: ${question}

Provide a focused answer based strictly on the provided tafsir content, maintaining clear source attribution and authenticity hierarchy as established in the text. Always begin with the context of revelation if it is mentioned in the tafsir.`;
    } else {
      const scholarName = selectedTafsir === 'ibn-kathir' ? 'Ibn Kathir' : 'Al-Tabari';
      systemMessage = `As a scholar of Quranic exegesis discussing Surah ${surah}, Verse ${verse}, I must inform you that:

"⚠️ ${scholarName}'s tafsir is not available in our database for this specific verse. To ensure authentic understanding, please:
1. Consult verified printed/digital copies of ${scholarName}'s tafsir
2. Seek guidance from qualified scholars
3. Refer to reputable Islamic research institutions

It would not be appropriate to provide an interpretation without access to ${scholarName}'s tafsir for this verse."`;
    }

    // Generate response with temperature 0.2 for more focused outputs
    const response = await openai.generateResponse(systemMessage);

    // Return formatted response with source information
    return res.json({
      success: true,
      content: response,
      source: hasTafsirContent ? 'tafsir_sources' : 'ai_fallback',
      sources: hasTafsirContent ? [
        {
          name: selectedTafsir === 'ibn-kathir' ? 'Ibn Kathir' : 'Al-Tabari',
          language: tafsirSources[selectedTafsir].language
        }
      ] : []
    });

  } catch (error) {
    console.error('Error in tafsir chat:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate tafsir response'
    });
  }
}));

// Helper function to fetch tafsir content
async function getTafsirContent(source: 'ibn-kathir' | 'tabari', surah: number, verse: number): Promise<string> {
  try {
    // Try to get from cache first
    const cachedEntry = await tafsirCacheService.getTafsir(source, surah, verse);
    if (cachedEntry) {
      console.log(`Retrieved ${source} tafsir from cache for ${surah}:${verse}`);
      return cachedEntry.content;
    }

    // If not in cache, fetch from API
    const response = await axios.get(
      `${tafsirSources[source].baseUrl}/by_ayah/${surah}:${verse}`,
      { timeout: 5000 }
    );

    if (response.data?.tafsir?.text) {
      // Process the content with better structure preservation
      let content = response.data.tafsir.text
        // Convert headers to markdown-style sections
        .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n\n## $1\n\n')
        .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n\n### $1\n\n')
        // Convert paragraphs to double-line-breaks for clear separation
        .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n\n$1\n\n')
        // Convert lists to bullet points
        .replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n')
        // Convert emphasis and strong tags to markdown
        .replace(/<em[^>]*>(.*?)<\/em>/gi, '_$1_')
        .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
        // Remove any remaining HTML tags
        .replace(/<[^>]+>/g, '')
        // Fix multiple line breaks
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .trim();

      // Add section markers for better AI parsing
      if (source === 'ibn-kathir') {
        content = `[Ibn Kathir's Tafsir]\n\n${content}`;
      } else {
        content = `[Tabari's Tafsir]\n\n${content}`;
      }

      // Add language marker if it's Arabic
      if (tafsirSources[source].language === 'ar') {
        content = `[Arabic Text]\n${content}\n[End Arabic Text]`;
      }

      // Save to cache
      await tafsirCacheService.saveTafsir({
        source,
        surah,
        verse,
        content,
        language: tafsirSources[source].language
      });

      return content;
    }
    return '';
  } catch (error) {
    console.error(`Error fetching ${source} tafsir:`, error);
    return '';
  }
}

export default router; 