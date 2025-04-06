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
  // Log entry into the main handler
  console.log(`[Tafsir Chat Route] Handler entered for user ${req.auth?.uid}. Question: "${req.body?.question}"`);
  try {
    const { surah, verse, question, isFirstResponse = false, selectedTafsir = 'ibn-kathir' } = req.body;
    const userId = req.auth!.uid;
    
    // --- Handle General Questions or Greetings FIRST --- 
    // Basic check for non-tafsir related questions BEFORE any DB calls or complex logic
    const lowerCaseQuestion = question?.toLowerCase() || ''; // Handle potential undefined question
    const isGeneralSurahQuestion = /theme of surah|tell me about surah|summary of surah/i.test(lowerCaseQuestion);
    // --- End General Handling --- 
    
    // --- Input Validation --- 
    if (!question) { // Check if question itself is missing
        return res.status(400).json({ 
            success: false, 
            error: 'Missing required parameter: question.' 
          });
    }
    // Allow general surah questions, greetings, capability questions to proceed without surah/verse initially
    if (!isGeneralSurahQuestion && !surah && !verse) {
        // If it's not a general surah question AND surah/verse are missing, 
        // it might be a greeting/capability question OR an invalid tafsir request.
        // Let the AI handle greetings/capabilities based on the unified prompt.
        // If it was an invalid tafsir request (e.g., "explain verse 5"), the AI should state it needs more info.
        console.log("[Tafsir Chat] Proceeding without surah/verse (likely greeting, capability, or general question).");
    } else if (!isGeneralSurahQuestion && (!surah || !verse)) {
        // If it's NOT a general surah question, but surah or verse IS missing, it's an invalid tafsir request.
        return res.status(400).json({
            success: false,
            error: 'Missing required parameters (surah, verse) for specific tafsir question.'
        });
    }
    // --- End Input Validation --- 

    // --- AI Usage Check and Increment are now MOVED INSIDE specific processing blocks --- 

    let systemMessage = '';
    const scholarName = selectedTafsir === 'ibn-kathir' ? 'Ibn Kathir' : 'Al-Tabari';
    const surahNumStr = String(surah); // May be "undefined" if not provided yet
    const currentSurahTheme = surahThemesData[surahNumStr]?.theme || 'Not available in theme data.';
    const currentSurahName = surahThemesData[surahNumStr]?.name || `Surah ${surahNumStr}`;
    let tafsirContent = ''; // Initialize tafsirContent
    let hasTafsirContent = false; // Initialize flag

    // --- Determine if we need to fetch Tafsir content ---
    // Only fetch if surah and verse are provided and it's not just a general theme question
    if (surah && verse && !isGeneralSurahQuestion) {
         console.log(`[Tafsir Chat] Attempting to fetch tafsir content for ${surah}:${verse}`);
        tafsirContent = await getTafsirContent(selectedTafsir, String(surah), String(verse));
        hasTafsirContent = !!tafsirContent;
         console.log(`[Tafsir Chat] Tafsir content fetched. Has Content: ${hasTafsirContent}`);
    } else {
        console.log("[Tafsir Chat] Skipping tafsir content fetch (not a specific verse request).");
    }

    // --- Unified System Prompt ---
    systemMessage = `You are NuraAI, a knowledgeable, respectful, and friendly Muslim AI assistant specializing in the Quran. Your primary goal is to help users understand the Quran and engage in relevant, respectful conversation.

CONTEXT & AVAILABLE DATA:
- Selected Scholar (if relevant): ${scholarName}
- Surah (if relevant): ${surah ? currentSurahName : 'Not specified'} (${surah || 'N/A'})
- Verse (if relevant): ${verse || 'N/A'}
- General Theme of Surah ${surah || 'N/A'} (if relevant): ${surah ? currentSurahTheme : 'Not specified'}
- Tafsir Text for ${surah}:${verse} from ${scholarName} (if relevant and available): ${hasTafsirContent ? '\n' + tafsirContent + '\n' : 'Not Available/Not Requested'}

USER'S CURRENT MESSAGE: ${question}

YOUR TASK & RESPONSE RULES:

1.  **GREETINGS & BASIC CHAT:**
    *   Respond warmly and naturally to greetings (e.g., "Wa alaikum assalam!", "Salam! How may I assist you today?").
    *   Engage politely in brief, relevant conversation ONLY if it pertains to Islam, the Quran, or your capabilities.
    *   If the conversation strays, gently guide it back. Example: "That's an interesting point. Returning to the Quran, did you have a question about a specific verse or theme?"

2.  **CAPABILITY QUESTIONS:**
    *   If asked "what can you do?", "how do you work?", etc., explain your functions clearly: "I can provide tafsir (explanations) for specific Quran verses based on scholars like ${Object.keys(tafsirSources).join(', ')}. I can also discuss the overall theme of a Surah based on available data. Ask me about a specific verse (e.g., 'Explain Surah 2 Verse 155 using Ibn Kathir') or a Surah's theme (e.g., 'What is the theme of Surah Al-Fatiha?')."

3.  **GENERAL SURAH THEME QUESTIONS:**
    *   If the user asks about the theme/summary of a Surah (e.g., "Tell me about Surah Al-Baqarah", "Theme of Surah 18") AND *specific tafsir text was NOT requested/provided for a verse*:
        *   Check the 'General Theme' data provided above.
        *   Provide a concise summary (1-2 paragraphs) based *only* on the provided theme.
        *   If theme data is 'Not available', state that clearly and offer to discuss common topics if known, without hallucinating. Example: "I don't have specific theme data for Surah ${currentSurahName} loaded, but it is known to cover topics such as..."
        *   **DO NOT use the detailed tafsir rules (below) for these general theme questions.**

4.  **SPECIFIC VERSE TAFSIR QUESTIONS:**
    *   If the user asks about a SPECIFIC verse (${surah}:${verse}) AND the relevant 'Tafsir Text' IS AVAILABLE above:
        *   **Usage Check:** (This happens *before* this step in the code).
        *   Follow these rules STRICTLY:
            *   Base your answer **primarily and strictly** on the provided '[${scholarName}'s Tafsir for Verse ${surah}:${verse}]'.
            *   Structure: Context (Sabab an-Nuzul, if mentioned), Main Interpretation(s), Linguistic points (if mentioned), Connection to Surah Theme (if it clarifies the verse interpretation naturally), Relevant Hadith/Narrations *mentioned in the source*.
            *   Attribute clearly: Start relevant extractions with "[Source: ${scholarName}]". Use exact quotes sparingly if impactful: '[Source: ${scholarName}] As stated: "..."'.
            *   If a point is NOT in the source: '[Note: This point is not detailed in the provided ${scholarName} text for this verse.]'.
            *   Verse Context: Focus ONLY on ${surah}:${verse} unless explicitly comparing. Clearly mark other verse references.
            *   Authenticity: NEVER state interpretations not found in the provided source text. If asked something not covered, state: "${scholarName} does not cover this specific point in the available text for verse ${surah}:${verse}."
            *   Theme Connection: **Only weave in the Surah theme (${currentSurahTheme}) if it directly clarifies the verse's interpretation in response to the user's question.** Do not add a separate theme section unless asked.
        *   Respond directly to the user's question about the verse.

5.  **TAFSIR REQUESTED BUT TEXT UNAVAILABLE:**
    *   If the user asks about a SPECIFIC verse (${surah}:${verse}) BUT 'Tafsir Text' is 'Not Available':
        *   **Usage Check:** (This happens *before* this step in the code).
        *   State clearly: "Unfortunately, ${scholarName}'s detailed tafsir text is not available in our database for verse ${surah}:${verse}."
        *   Address the user's question generally based on your knowledge of the Quran and the Surah's theme (${currentSurahTheme}), if applicable. Mention the theme connection cautiously.
        *   Avoid speculation presented as fact. Offer alternatives: "Perhaps we could discuss the general meaning, or look at another verse?"

6.  **INAPPROPRIATE/OFF-TOPIC:**
    *   Politely decline questions unrelated to Quran, Islam, tafsir, or your capabilities. Redirect: "My purpose is to assist with understanding the Quran. How can I help with that?" or "I focus on Quranic insights. Do you have a question about a verse or Surah?" Do not engage in debates.

7.  **INVALID REQUESTS:**
    *   If the user asks for tafsir but doesn't provide a Surah and Verse number, politely ask for them. Example: "To provide the tafsir, please specify the Surah and Verse number you're interested in."

**General Tone:** Be helpful, respectful, accurate, and focused on the Quran. Avoid overly casual language. Do not add greetings like "Wa alaikum assalam" if the user asks a direct question; answer the question directly.
`;
    // --- End Unified System Prompt ---

    // --- Determine if AI Usage Should Be Incremented ---
    let shouldIncrementUsage = false;
    if ((isGeneralSurahQuestion && !verse) || (surah && verse)) {
        // Increment usage ONLY if it's a specific theme question OR a specific verse question (regardless of whether tafsir text was found)
        // This avoids incrementing for greetings, capability questions, or invalid requests handled by the AI prompt.
        console.log(`[Tafsir Chat] AI call required for specific theme/tafsir. Checking usage for user ${userId}...`);
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
             console.log(`[Tafsir Chat] Usage check passed for user ${userId}. Proceeding with AI call.`);
            shouldIncrementUsage = true; // Mark that usage should be incremented AFTER the AI call succeeds.

        } catch (usageError) {
            console.error('Error managing user usage in tafsir/chat:', usageError);
            return next(usageError);
        }
    } else {
         console.log(`[Tafsir Chat] AI call is likely for greeting/capability/general chat. Skipping usage check/increment for user ${userId}.`);
    }
    // --- End Usage Check Logic ---


    // --- Generate AI Response ---
    console.log(`[Tafsir Chat] Generating AI response for user ${userId}. Should increment usage: ${shouldIncrementUsage}`);
    const responseContent = await openai.generateResponse(systemMessage);
    console.log(`[Tafsir Chat] AI response generated for user ${userId}.`);
    // --- End Generate AI Response ---

    // --- Increment Usage (if applicable) ---
    if (shouldIncrementUsage) {
        try {
            // We already retrieved userUsage in the check block
            const userUsage = await UserUsage.findOne({ userId }); // Re-fetch or use variable from check scope if possible/safe
            if (userUsage) {
                 console.log(`[Tafsir Chat] Incrementing AI request count for user ${userId}.`);
                await userUsage.incrementAIRequestCount();
                 console.log(`[Tafsir Chat] Incremented AI request count for user ${userId}.`);
            } else {
                 console.warn(`[Tafsir Chat] Could not find userUsage record to increment count for user ${userId} after AI call.`);
            }
        } catch (incrementError) {
             console.error(`[Tafsir Chat] Error incrementing usage count for user ${userId} after AI call:`, incrementError);
             // Decide if this should be fatal. Usually, we still want to return the response.
        }
    }
    // --- End Increment Usage ---

    // Determine source based on whether tafsir was used or available
    let responseSource = 'ai_general_chat'; // Default for greetings, capabilities, general fallback
     if (isGeneralSurahQuestion && !verse) {
        responseSource = 'ai_surah_theme';
    } else if (surah && verse) {
        responseSource = hasTafsirContent ? 'tafsir_sources' : 'ai_fallback';
    }

    return res.json({
      success: true,
      content: responseContent,
      source: responseSource, // Updated source based on logic
      sources: (responseSource === 'tafsir_sources') ? [ // Only include sources if tafsir was used
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