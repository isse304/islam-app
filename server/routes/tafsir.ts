import express, { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest, withAuth, withPremium } from '../middleware/auth';
import axios from 'axios';
import { OpenAIService } from '../services/openai.service';
import { TafsirCacheService } from '../services/tafsir-cache.service';
import { UserUsage } from '../models/UserUsage';
import { UsageService } from '../services/usage.service';
import { StripeService } from '../services/stripe.service';
import { EmailService } from '../services/email.service';

const router = express.Router();
const openai = new OpenAIService();
const tafsirCacheService = new TafsirCacheService();
const emailService = new EmailService();
const stripeService = new StripeService(emailService);
const usageService = new UsageService(stripeService);

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
router.get('/:source/:surah/:verse', async (req: Request, res: Response, next: NextFunction) => {
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
    
    next(error);
  }
});

// Tafsir chat endpoint (Requires Auth AND Premium)
router.post('/chat', withPremium(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { surah, verse, question, isFirstResponse = false, selectedTafsir = 'ibn-kathir' } = req.body;
    const userId = req.auth!.uid;
    
    if (!surah || !verse || !question) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters' 
      });
    }

    let userUsage;
    try {
        userUsage = await usageService.getOrCreateUsage(userId);

        if (!await userUsage.canMakeAIRequest()) {
            return res.status(429).json({ 
                success: false,
                error: 'AI request limit exceeded for today',
                limit: userUsage.aiRequestLimit,
                used: userUsage.aiRequests.count
            });
        }
    } catch (usageError) {
        console.error('Error managing user usage in tafsir/chat:', usageError);
        return next(usageError);
    }

    const tafsirContent = await getTafsirContent(selectedTafsir, surah, verse);
    const hasTafsirContent = !!tafsirContent;

    let systemMessage = '';
    if (hasTafsirContent) {
      const scholarName = selectedTafsir === 'ibn-kathir' ? 'Ibn Kathir' : 'Al-Tabari';
      systemMessage = `You are a knowledgeable Muslim scholar answering questions about the Quran based on ${scholarName}'s tafsir. You will be provided with tafsir content for specific verses.

CRITICAL RULES FOR AUTHENTIC RESPONSES:
1. VERSE CONTEXT ENFORCEMENT:
   - You are ONLY discussing verse ${surah}:${verse}
   - DO NOT mix content from other verses unless explicitly comparing
   - If referencing other verses, clearly mark them as "Related Verse: [verse number]"
   - If asked about future events or other verses, state that those are discussed in their respective verses

2. MANDATORY SOURCE ATTRIBUTION AND OPINION HIERARCHY:
   - Every paragraph MUST start with "[Source: ${scholarName}]"
   - When multiple opinions exist in the tafsir:
     a) Present the opinion that has the strongest chain of narration first, labeled as "Most Authentic Opinion:"
     b) Present other opinions as "Alternative Opinion:", explaining their relative authenticity
   - Use exact quotes when available: '[Source: ${scholarName}] As stated in the text: "..."'
   - If a point is not found in the source: '[Note: This specific point is not directly addressed in ${scholarName}'s tafsir.]'

3. RESPONSE STRUCTURE:
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

4. AUTHENTICITY ENFORCEMENT:
   - NEVER make statements without direct basis in the provided tafsir
   - Present narrations in order of their authenticity as classified in the tafsir
   - When multiple opinions exist, clearly explain why one is considered more authentic
   - For controversial verses, stick strictly to what is mentioned in the tafsir text
   - If asked about something not covered in the tafsir, explicitly state that the topic is not addressed

AVAILABLE TAFSIR SOURCE:
[${scholarName}'s Tafsir for Verse ${surah}:${verse}]:
${tafsirContent}

QUESTION: ${question}

Provide a focused answer based strictly on the provided tafsir content for THIS verse only. Always begin with the context of revelation if it is mentioned in the tafsir.`;
    } else {
      const scholarName = selectedTafsir === 'ibn-kathir' ? 'Ibn Kathir' : 'Al-Tabari';
      systemMessage = `As a scholar of Quranic exegesis discussing Surah ${surah}, Verse ${verse}, I must inform you that:

"⚠️ ${scholarName}'s tafsir is not available in our database for this specific verse. To ensure authentic understanding, please:
1. Consult verified printed/digital copies of ${scholarName}'s tafsir
2. Seek guidance from qualified scholars
3. Refer to reputable Islamic research institutions

It would not be appropriate to provide an interpretation without access to ${scholarName}'s tafsir for this verse."`;
    }

    const responseContent = await openai.generateResponse(systemMessage);

    try {
        await userUsage.incrementAIRequestCount();
    } catch (incrementError) {
        console.error('Error incrementing usage count in tafsir/chat:', incrementError);
    }

    return res.json({
      success: true,
      content: responseContent,
      source: hasTafsirContent ? 'tafsir_sources' : 'ai_fallback',
      sources: hasTafsirContent ? [
        {
          name: selectedTafsir === 'ibn-kathir' ? 'Ibn Kathir' : 'Al-Tabari',
          language: tafsirSources[selectedTafsir].language
        }
      ] : []
    });

  } catch (error: any) {
    console.error('Error in tafsir chat route:', error);
    next(error);
  }
}));

// Helper function to estimate tokens (rough estimate)
function estimateTokens(text: string): number {
  // GPT models typically use ~4 chars per token on average
  return Math.ceil(text.length / 4);
}

// Process tafsir content to fit within token limits
function processTafsirContent(content: string, maxTokens: number = 6000, isArabic: boolean = false): string {
  if (!content) return '';
  
  // Adjust token limit for Arabic content (Arabic typically needs more tokens)
  const adjustedMaxTokens = isArabic ? Math.floor(maxTokens * 0.7) : maxTokens;
  
  // If content is already within limits, return as is
  if (estimateTokens(content) <= adjustedMaxTokens) return content;

  // Split content into sections, handling both Arabic and English text
  const sections = content.split(/\n\n+/);
  
  // Priority keywords for section selection (including Arabic keywords)
  const priorityPatterns = [
    /سبب.*نزول|context.*revelation|occasion.*revelation/i,    // Context of revelation
    /تفسير|معنى|شرح|interpretation|meaning|explanation/i,     // Main interpretations
    /حكم|ruling|فقه|fiqh/i,                                  // Legal rulings
    /فائدة|حكمة|benefit|wisdom/i,                            // Benefits and wisdom
    /حديث|أثر|hadith|narration|reported/i                     // Supporting hadith
  ];

  // Score and sort sections by priority
  const scoredSections = sections.map(section => {
    let score = 0;
    priorityPatterns.forEach((pattern, index) => {
      if (pattern.test(section)) {
        score += (priorityPatterns.length - index); // Higher priority = higher score
      }
    });
    return { section, score };
  }).sort((a, b) => b.score - a.score);

  // Build processed content within token limit
  let processedContent = '';
  let currentTokens = 0;
  
  // Always include first section (usually introduction/context)
  processedContent = sections[0] + '\n\n';
  currentTokens = estimateTokens(processedContent);

  // Add high-priority sections until we approach the limit
  for (const {section} of scoredSections) {
    const sectionTokens = estimateTokens(section);
    // Use a tighter buffer for Arabic content (85% instead of 95%)
    const bufferLimit = adjustedMaxTokens * (isArabic ? 0.85 : 0.95);
    
    if (currentTokens + sectionTokens <= bufferLimit) {
      processedContent += section + '\n\n';
      currentTokens += sectionTokens;
    }
  }

  // Add note if content was truncated
  if (estimateTokens(content) > adjustedMaxTokens) {
    const note = isArabic 
      ? '\n[ملاحظة: تم تحسين بعض المحتوى للطول مع الحفاظ على التفسيرات والسياق الرئيسي.]'
      : '\n[Note: Some content has been optimized for length while preserving key interpretations and context.]';
    processedContent += note;
  }

  return processedContent.trim();
}

// Modified getTafsirContent function with improved Arabic handling and error logging
async function getTafsirContent(source: string, surah: string, verse: string): Promise<string> {
  try {
    console.log('Getting tafsir content for:', { source, surah, verse });
    
    // Try to get from cache first
    const cacheKey = `${source}-${surah}-${verse}`;
    const cachedContent = await tafsirCacheService.get(cacheKey);
    if (cachedContent) {
      console.log('Found cached content:', { source, contentLength: cachedContent.length });
      const sourceConfig = tafsirSources[source];
      const isArabic = sourceConfig?.language === 'ar';
      return processTafsirContent(cachedContent, 6000, isArabic);
    }

    // If not in cache, fetch from API
    const sourceConfig = tafsirSources[source];
    if (!sourceConfig) {
      console.error('Invalid tafsir source:', source);
      return '';
    }

    const isArabic = sourceConfig.language === 'ar';
    const url = `${sourceConfig.baseUrl}/by_ayah/${surah}:${verse}`;
    console.log('Fetching from API:', { url, language: sourceConfig.language });
    
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'IslamApp/1.0'
      }
    });

    console.log('API Response:', {
      status: response.status,
      hasData: !!response.data,
      hasTafsir: !!response.data?.tafsir,
      hasText: !!response.data?.tafsir?.text,
      contentLength: response.data?.tafsir?.text?.length,
      isArabic
    });

    if (!response.data?.tafsir?.text) {
      console.warn('No tafsir content found:', { source, surah, verse });
      return '';
    }

    // Process the content
    let cleanText = response.data.tafsir.text
      .replace(/<h2>/g, '\n\n')
      .replace(/<\/h2>/g, '\n')
      .replace(/<p>/g, '\n')
      .replace(/<\/p>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    console.log('Initial cleaning:', { 
      source,
      originalLength: response.data.tafsir.text.length,
      cleanedLength: cleanText.length,
      isArabic
    });

    // Special handling for Arabic text
    if (isArabic) {
      try {
        console.log('Processing Arabic text:', { 
          source,
          beforeLength: cleanText.length,
          containsArabic: /[\u0600-\u06FF]/.test(cleanText)
        });

        // Normalize Arabic text
        cleanText = cleanText
          // Normalize whitespace
          .replace(/\s+/g, ' ')
          // Handle Arabic punctuation marks
          .replace(/[،؛؟]/g, '\n')
          // Split by common Arabic sentence endings
          .split(/[.。।॥]|[۔።।॥]|\u06D4|\u061F/g)
          .map((sentence: string) => {
            const trimmed = sentence.trim();
            // Only keep sentences that have actual content
            return trimmed.length > 0 && !/^\s*$/.test(trimmed) ? trimmed : '';
          })
          .filter(Boolean)
          .join('\n\n');

        // Add section markers for better readability
        cleanText = cleanText
          .replace(/(قال|وقال|روى|وروى|أخبرنا|حدثنا|عن)/g, '\n\n$1')
          .replace(/\n\s*\n\s*\n/g, '\n\n')
          .trim();

        console.log('Arabic processing complete:', { 
          source,
          afterLength: cleanText.length,
          sections: cleanText.split('\n\n').length
        });

      } catch (error) {
        console.error('Error processing Arabic text:', {
          source,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        // Return the original cleaned text if Arabic processing fails
        return cleanText;
      }
    }

    // Process content before saving to cache
    console.log('Processing final content:', { source, length: cleanText.length, isArabic });
    const processedContent = processTafsirContent(cleanText, 6000, isArabic);
    console.log('Content processed:', { 
      source,
      originalLength: cleanText.length,
      processedLength: processedContent.length,
      sections: processedContent.split('\n\n').length,
      isArabic
    });
    
    // Only cache if we have valid content
    if (processedContent) {
      await tafsirCacheService.set(cacheKey, processedContent);
      console.log('Content cached:', { source, cacheKey });
    }
    
    return processedContent;

  } catch (error) {
    console.error('Error in getTafsirContent:', {
      source,
      surah,
      verse,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      response: error instanceof Error && 'response' in error ? (error as any).response?.data : undefined
    });
    return '';
  }
}

export default router; 