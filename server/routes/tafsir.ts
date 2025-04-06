import express, { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest, withAuth, withPremium } from '../middleware/auth';
import axios from 'axios';
import { OpenAIService } from '../services/openai.service';
import { TafsirCacheService } from '../services/tafsir-cache.service';
import { UserUsage } from '../models/UserUsage';
import { UsageService } from '../services/usage.service';
import { StripeService } from '../services/stripe.service';
import { EmailService } from '../services/email.service';
import { promises as fs } from 'fs';
import path from 'path';

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

// --- Load Surah Themes --- 
interface SurahThemeInfo {
  name: string;
  theme: string;
}

let surahThemesData: Record<string, SurahThemeInfo> = {};

async function loadSurahThemes() {
  try {
    const filePath = path.join(__dirname, '../data/surah-themes.json');
    const data = await fs.readFile(filePath, 'utf8');
    surahThemesData = JSON.parse(data);
    console.log('Successfully loaded Surah themes data.');
  } catch (error) {
    console.error('Error loading Surah themes data:', error);
    // Continue without themes if loading fails
  }
}

// Load themes when the module initializes
loadSurahThemes();
// --- End Load Surah Themes ---

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
    
    // --- Handle General Questions or Greetings FIRST --- 
    // Basic check for non-tafsir related questions BEFORE any DB calls or complex logic
    const lowerCaseQuestion = question?.toLowerCase() || ''; // Handle potential undefined question
    const isGreeting = /^(hi|hello|hey|greetings|salam)/i.test(lowerCaseQuestion);
    const isCapabilityQuestion = /what can you do|how do you work|capabilities/i.test(lowerCaseQuestion);
    const isGeneralSurahQuestion = /theme of surah|tell me about surah|summary of surah/i.test(lowerCaseQuestion);

    if (isGreeting) {
        console.log(`[Tafsir Chat] Responding to greeting from user ${userId}.`); // Added log
        return res.json({ 
            success: true, 
            content: "Wa alaikum assalam! I'm ready to help you understand the Quran based on scholarly tafsir. How can I assist you today?",
            source: 'ai_greeting',
            sources: []
        });
    }
    if (isCapabilityQuestion) {
        console.log(`[Tafsir Chat] Responding to capability question from user ${userId}.`); // Added log
        return res.json({ 
            success: true, 
            content: "I can provide tafsir explanations for specific Quran verses based on selected scholars like Ibn Kathir and Al-Tabari. I can also discuss the overall theme of a Surah. Ask me about a specific verse (e.g., 'Explain Surah 2 Verse 155') or a Surah's theme (e.g., 'What is the theme of Surah Al-Fatiha?').",
            source: 'ai_capability',
            sources: []
        });
    }
    // --- End General Handling --- 
    
    // --- Input Validation for Specific Tafsir Questions --- 
    if (!question) { // Check if question itself is missing
        return res.status(400).json({ 
            success: false, 
            error: 'Missing required parameter: question.' 
          });
    }
    if (!surah || !verse) {
      // Allow general surah questions to proceed
      if (!isGeneralSurahQuestion) {
         return res.status(400).json({ 
            success: false, 
            error: 'Missing required parameters (surah, verse) for specific tafsir question.' 
          });
      }
    }
    // --- End Input Validation --- 

    // --- AI Usage Check --- 
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
    // --- End AI Usage Check --- 

    let systemMessage = '';
    const scholarName = selectedTafsir === 'ibn-kathir' ? 'Ibn Kathir' : 'Al-Tabari';
    const surahNumStr = String(surah);
    const currentSurahTheme = surahThemesData[surahNumStr]?.theme || 'Not available in theme data.';
    const currentSurahName = surahThemesData[surahNumStr]?.name || `Surah ${surahNumStr}`;

    // --- Handle General Surah Theme Question --- 
    if (isGeneralSurahQuestion && !verse) { // Check if it's ONLY a surah question
      systemMessage = `You are an AI assistant knowledgeable about the Quran. The user wants to know about the theme of ${currentSurahName}. 

General Theme Provided: ${currentSurahTheme}

Based on this theme, provide a concise and informative summary (1-2 paragraphs) explaining the main topics and message of ${currentSurahName}. If the theme data was 'Not available', state that you don't have specific theme data but can discuss common topics associated with the Surah if known. Do not hallucinate specific details if theme data is unavailable. Respond directly to the user's question about the Surah's theme. Be polite and focused on the Quranic topic.`;
      
      // Generate response for general surah question
      const responseContent = await openai.generateResponse(systemMessage);
      await userUsage.incrementAIRequestCount(); // Increment usage
      return res.json({
          success: true,
          content: responseContent,
          source: 'ai_surah_theme',
          sources: []
      });
    }
    // --- End General Surah Theme Question --- 

    // --- Logic for Specific Verse Tafsir --- 
    // Ensure surah and verse are valid if we reach here
    if (!surah || !verse) {
         return res.status(400).json({ 
            success: false, 
            error: 'Missing required parameters (surah, verse) for specific tafsir question.' 
          });
    }

    const tafsirContent = await getTafsirContent(selectedTafsir, String(surah), String(verse));
    const hasTafsirContent = !!tafsirContent;

    if (hasTafsirContent) {
      systemMessage = `You are a knowledgeable and respectful Muslim scholar AI assistant specializing in Quranic tafsir based on ${scholarName}. Your primary goal is to help users understand the Quran. You also understand the overall context of the Surah.

Surah Information:
- Name: ${currentSurahName}
- General Theme: ${currentSurahTheme}

Verse for Discussion: ${surah}:${verse}

AVAILABLE TAFSIR SOURCE FOR VERSE ${surah}:${verse}:
[${scholarName}'s Tafsir for Verse ${surah}:${verse}]:
${tafsirContent}

USER'S QUESTION: ${question}

CRITICAL RULES FOR AUTHENTIC & FOCUSED RESPONSES:
1. GREETINGS & CONVERSATION: Respond warmly and naturally to greetings (e.g., "Wa alaikum assalam! How can I help you with the Quran today?"). Engage politely in brief, relevant conversation, but always gently steer back towards Quranic discussion or tafsir if the user strays too far off-topic.

2. INAPPROPRIATE/OFF-TOPIC QUESTIONS: If the user asks questions unrelated to the Quran, Islam, tafsir, or your capabilities, or asks inappropriate questions, politely decline to answer and redirect. Example responses: "My purpose is to assist with understanding the Quran and tafsir. How can I help you with that today?" or "I am focused on providing insights related to the Quran. Do you have a question about a specific verse or Surah theme?" Do not engage in unrelated debates or discussions.

3. VERSE CONTEXT ENFORCEMENT:
   - Focus ONLY on verse ${surah}:${verse} unless explicitly comparing.
   - Clearly mark references to other verses (e.g., "Related Verse: X:Y").
   - If asked about unrelated topics/verses within a tafsir request, state they are discussed elsewhere and offer to discuss verse ${surah}:${verse}.

4. SOURCE ATTRIBUTION & OPINION HIERARCHY:
   - Start relevant paragraphs with "[Source: ${scholarName}]" when drawing from the tafsir text.
   - Present opinions in order of authenticity if mentioned in the source, labeling clearly (e.g., "Most Authentic Opinion:", "Alternative Opinion:").
   - Use exact quotes if helpful: '[Source: ${scholarName}] As stated: "..."'.
   - If a point isn't in the source: '[Note: This specific point is not directly addressed in the provided ${scholarName}'s tafsir for this verse.]'.

5. RESPONSE STRUCTURE (FOR TAFSIR QUESTIONS):
   - CONTEXT OF REVELATION (Sabab an-Nuzul, if mentioned).
   - MAIN INTERPRETATION (ordered by authenticity if applicable).
   - WORD EXPLANATIONS (only if defined in the tafsir).
   - CONNECTION TO SURAH THEME: **Explicitly state how the interpretation of this verse (${surah}:${verse}) connects to or exemplifies the overall theme of ${currentSurahName} (${currentSurahTheme}).**

6. AUTHENTICITY ENFORCEMENT:
   - NEVER state interpretations without basis in the provided tafsir.
   - If asked about something not covered in the provided source, state that clearly (e.g., "${scholarName} does not detail this specific point in the provided text for this verse.").

Provide a focused, respectful, and concise answer to the USER'S QUESTION based primarily on the provided tafsir source. Include context or Hadith if available in the source. Mention the connection to the Surah's theme ONLY if it directly helps answer the user's specific question or if the user explicitly asks about the theme. Prioritize accuracy and adherence to the source material above all else, following all rules.`;
    } else {
      // Fallback if tafsir content is not available for the specific verse
      systemMessage = `You are a helpful and respectful AI assistant knowledgeable about the Quran, discussing ${currentSurahName}, Verse ${verse}.

Surah Information:
- Name: ${currentSurahName}
- General Theme: ${currentSurahTheme}

Unfortunately, ${scholarName}'s detailed tafsir text is not available in our database for this specific verse (${surah}:${verse}).

USER'S QUESTION: ${question}

Address the user's question generally based on your knowledge of the Quran and the Surah's theme. Clearly state that you cannot provide ${scholarName}'s specific interpretation for this verse due to missing source text. You can mention how the verse *might* relate to the Surah's theme (${currentSurahTheme}) based on common understanding. 
Politely redirect if the question is off-topic or inappropriate, focusing the conversation back to Quranic understanding. Example: "While I don't have the specific tafsir you requested, perhaps we could discuss the general meaning of this verse or its connection to the Surah's theme?" Avoid speculation presented as fact.`;
    }

    const responseContent = await openai.generateResponse(systemMessage);
    await userUsage.incrementAIRequestCount(); // Increment usage

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