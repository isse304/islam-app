import express, { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/express';
import { withAuth, withPremium } from '../middleware/auth';
import axios from 'axios';
import { OpenAIService } from '../services/openai.service';
import { TafsirCacheService } from '../services/tafsir-cache.service';
import { UserUsage } from '../models/UserUsage';
import { TafsirVerse } from '../models/TafsirVerse';
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
    // console.log('Successfully loaded Surah themes data.');
  } catch (error) {
    // console.error('Error loading Surah themes data:', error);
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
    // console.log('Fetching tafsir for:', { source, surah, verse });

    const sourceConfig = tafsirSources[source as keyof typeof tafsirSources];
    if (!sourceConfig) {
      // console.warn('Invalid tafsir source requested:', source);
      return res.status(400).json({ 
        error: 'Invalid tafsir source',
        text: 'This tafsir source is not available.'
      });
    }

    // Validate surah and verse numbers
    const surahNum = parseInt(surah);
    const verseNum = parseInt(verse);
    if (isNaN(surahNum) || isNaN(verseNum) || surahNum < 1 || surahNum > 114 || verseNum < 1) {
      // console.warn('Invalid surah or verse number:', { surah, verse });
      return res.status(400).json({
        error: 'Invalid surah or verse number',
        text: 'Please provide valid surah and verse numbers.'
      });
    }

    const url = `${sourceConfig.baseUrl}/by_ayah/${surah}:${verse}`;
    // console.log('Making request to QuranCDN:', url);
    
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'IslamApp/1.0'
        }
      });

      // console.log('QuranCDN response:', {
      //   status: response.status,
      //   hasData: !!response.data,
      //   hasTafsir: !!response.data?.tafsir,
      //   hasText: !!response.data?.tafsir?.text
      // });

      if (!response.data?.tafsir?.text) {
        // console.warn('No tafsir content found:', { source, surah, verse });
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

      // console.log('Successfully fetched and cleaned tafsir text:', {
      //   source,
      //   surah,
      //   verse,
      //   textLength: cleanText.length
      // });

      return res.json({
        text: cleanText,
        metadata: {
          source,
          language: sourceConfig.language,
          reference: `${surah}:${verse}`
        }
      });

    } catch (apiError: any) {
      // console.error('QuranCDN API error:', {
      //   source,
      //   surah,
      //   verse,
      //   url,
      //   status: apiError.response?.status,
      //   statusText: apiError.response?.statusText,
      //   error: apiError.message,
      //   data: apiError.response?.data
      // });

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
    // console.error('Server error in tafsir route:', {
    //   error: error.message,
    //   stack: error.stack
    // });
    
    next(error);
  }
});

// Tafsir chat endpoint (Requires Auth - free tier gets 5 lifetime questions, premium gets daily limit)
router.post('/chat', withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // Log entry into the main handler
  // console.log(`[Tafsir Chat Route] Handler entered for user ${req.auth?.uid}. Question: "${req.body?.question}"`);
  try {
    // Add type annotations for req.body properties
    const { 
      surah, 
      verse, 
      question, 
      isFirstResponse = false, 
      selectedTafsir = 'ibn-kathir' 
    }: { 
      surah?: number | string, 
      verse?: number | string, 
      question?: string, 
      isFirstResponse?: boolean, 
      selectedTafsir?: string 
    } = req.body;

    const userId = req.auth!.uid;
    
    // --- START Conditional Hardcoded Response for General Ibn Kathir 1:1 Questions ---
    if (String(surah) === '1' && String(verse) === '1' && selectedTafsir === 'ibn-kathir') {
      const lowerCaseQuestion = (question || '').toLowerCase().trim();
      // Define keywords/phrases indicating a general request for explanation
      const generalKeywords = [
        'explain this verse',
        'tell me about this verse',
        'what is this verse about',
        'meaning of this verse',
        'summarize this verse',
        'tafsir of this verse',
        'explanation for',
        'general meaning',
        'overall meaning'
      ];
      // Check if the question seems general
      const isGeneralQuery = generalKeywords.some(keyword => lowerCaseQuestion.includes(keyword)) || lowerCaseQuestion === 'explain' || lowerCaseQuestion === 'what is it';

      if (isGeneralQuery) {
        // console.log(`[Tafsir Chat] Returning hardcoded response for GENERAL Ibn Kathir 1:1 query for user ${userId}.`);
        const hardcodedResponse = `
📚 Tafsir Ibn Kathir – Explanation of 1:1:
Imam Ibn Kathir (رحمه الله) begins his tafsir of Surah Al-Fātiḥah by discussing the Basmala (Bismillāh al-Raḥmān al-Raḥīm), its wording, meaning, and its status in the Qur'an.

1.  **Is Bismillah Part of Surah Al-Fatiha?**
    Ibn Kathir states:

    > According to Imam Ash-Shafi'i and the reciters of Makkah and Kufa, "Bismillāh al-Raḥmān al-Raḥīm" is counted as a verse in Surah Al-Fātiḥah.

    This is based on authentic reports and recitations from the Sahabah (رضي الله عنهم).

    Other scholars, like Imam Malik, did not count it as a verse of the Surah, but Ibn Kathir follows the Shafi'i view, which includes it as the first verse.

2.  **Meaning of the Words:**
    *   **"بِسْمِ اللَّهِ" – "In the Name of Allah"**
        The word "Allah" is the greatest name of God. All of His other names refer back to it.
        "Bismillah" implies beginning an act with seeking help, blessing, and guidance from Allah.
        It is a reminder to start all actions with the intention to please Allah.

    *   **"الرَّحْمَٰنِ" – "The Most Gracious"**
        Ibn Kathir explains that "Ar-Raḥmān" refers to Allah's vast and all-encompassing mercy, which extends to all creation: believers, disbelievers, humans, animals, etc.
        It is derived from *rahmah* (mercy), but used in a more intensive form here, showing the greatness of Allah's mercy.

    *   **"الرَّحِيمِ" – "The Most Merciful"**
        "Ar-Raḥīm" refers to Allah's special mercy that is directed specifically to the believers.
        Ibn Kathir, citing earlier scholars like Abu 'Aliyah and others, says that "Ar-Raḥmān" is general, while "Ar-Raḥīm" is specific.

3.  **Why Begin with Bismillah?**
    Ibn Kathir mentions the practice of the Prophets who would begin their writings or actions with the name of Allah.
    He refers to the letter of Sulayman (عليه السلام) to the Queen of Sheba, which began with:

    > "إِنَّهُ مِن سُلَيْمَانَ وَإِنَّهُ بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"
    > "Indeed, it is from Sulayman, and it reads: In the Name of Allah, the Most Gracious, the Most Merciful." (Surah An-Naml 27:30)

    This shows the noble tradition of beginning all good with the name of Allah.

🧠 **Summary:**
| Phrase     | Meaning (according to Ibn Kathir)                       |
|------------|---------------------------------------------------------|
| Bismillah  | Seeking Allah's name and help before any action.        |
| Allah      | The personal name of God, to which all His other names return. |
| Ar-Rahman  | Allah's mercy for all creation, general and vast.       |
| Ar-Raheem  | Allah's mercy for the believers, special and specific. |
`;
        return res.json({
          success: true,
          content: hardcodedResponse.trim(),
          source: 'hardcoded_ibn_kathir_1_1' // Clear source identifier
        });
      } else {
        // console.log(`[Tafsir Chat] Specific question detected for Ibn Kathir 1:1. Proceeding to AI generation.`);
        // If the question is specific, we fall through to the normal AI flow below,
        // which already skips fetching external content for 1:1.
      }
    }
    // --- END Conditional Hardcoded Response ---

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
        // console.log("[Tafsir Chat] Proceeding without surah/verse (likely greeting, capability, or general question).");
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
    let tafsirContent = '';
    let hasTafsirContent = false;
    let isPreProcessedTafsir = false;

    let fetchTafsir = surah && verse && !isGeneralSurahQuestion;
    if (String(surah) === '1' && String(verse) === '1') {
        fetchTafsir = false;
        hasTafsirContent = false;
    }

    if (fetchTafsir) {
        const result = await getTafsirContent(selectedTafsir, String(surah), String(verse));
        tafsirContent = result.content;
        isPreProcessedTafsir = result.isPreProcessed;
        hasTafsirContent = !!tafsirContent;
    }

    // --- Unified System Prompt ---
    systemMessage = `You are NuraAI, a knowledgeable, respectful, and friendly Muslim AI assistant specializing in the Quran. Your primary goal is to help users understand the Quran and engage in relevant, respectful conversation.

CONTEXT & AVAILABLE DATA:
- Selected Scholar (if relevant): ${scholarName}
- Surah (if relevant): ${surah ? currentSurahName : 'Not specified'} (${surah || 'N/A'})
- Verse (if relevant): ${verse || 'N/A'}
- General Theme of Surah ${surah || 'N/A'} (if relevant): ${surah ? currentSurahTheme : 'Not specified'}
- Tafsir Text for ${surah}:${verse} from ${scholarName} (if relevant and available): ${hasTafsirContent ? (isPreProcessedTafsir
    ? '\n--- TAFSIR TEXT (pre-filtered for this verse only) ---\n' + tafsirContent + '\n--- END TAFSIR TEXT ---\n'
    : '\n--- BEGIN RAW TAFSIR TEXT (WARNING: may contain commentary on adjacent verses - you must filter) ---\n' + tafsirContent + '\n--- END RAW TAFSIR TEXT ---\n'
  ) : 'Not Available/Not Requested'}

USER'S CURRENT MESSAGE: ${question}

YOUR TASK & RESPONSE RULES:

1.  **GREETINGS & BASIC CHAT:**
    *   If the user says "salam" or "assalamu alaikum", respond with "Wa alaikum assalam! How can I assist you today?"
    *   For other simple greetings like "hi" or "hello", respond naturally with "Hello! How can I assist you today?" or "Hi there! What can I help you with?".
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
        *   Your primary goal is to **faithfully convey the relevant details from that specific source** in response to the user's question.
        *   Follow these rules **ABSOLUTELY STRICTLY**:${!isPreProcessedTafsir ? `
            *   **VERSE BOUNDARY RULE (CRITICAL - PERFORM THIS BEFORE WRITING YOUR ANSWER):**
                The raw tafsir text above often contains commentary on MULTIPLE verses in a single passage because classical scholars discuss related verses together. Before you write anything, you MUST mentally perform this filtering step:
                (a) Scan the raw tafsir text and identify where the scholar begins discussing verse ${surah}:${verse} specifically (look for the verse text, verse number references, or the transition from a previous verse's discussion).
                (b) Identify where the scholar transitions AWAY from verse ${surah}:${verse} to discuss verse ${surah}:${Number(verse) + 1} or later verses (look for phrases like "then Allah says", "the next verse", "and His saying", new verse quotations, or discussion of topics clearly belonging to a different verse).
                (c) ONLY use the content between points (a) and (b). Everything outside that range must be completely ignored, as if it were not provided.` : ''}
            *   **ZERO EXTERNAL KNOWLEDGE RULE (CRITICAL):** Your answer **MUST** contain **ONLY** information that is **explicitly written** in the provided tafsir text above. If a claim, interpretation, theme, symbolism, or moral lesson does NOT appear as actual words in the provided text, you **MUST NOT** include it. Do not infer, extrapolate, or add your own Islamic knowledge. Treat the provided text as the ONLY source of truth. If the text only discusses a hadith about prostration, then your answer is ONLY about that hadith. Do not add what the verse "symbolizes" or "signifies" unless those exact ideas appear in the text.
            *   Focus on extracting the **specific points** (like context, interpretations, linguistic notes, cited hadith) made by ${scholarName} regarding verse ${surah}:${verse} **as presented in the provided text**. Use close paraphrasing or brief, attributed quotes.
            *   Attribute clearly: Start with "According to ${scholarName}..." or similar.
            *   If the provided text is short or covers limited ground, your answer should also be short. Do NOT pad with external knowledge to make a longer response.
            *   If the user asks about something **not covered in the provided text for ${surah}:${verse}**: State clearly: "${scholarName} does not cover this specific point in the provided text for verse ${surah}:${verse}." Do not attempt to answer using external knowledge.
            *   Theme Connection: Only mention the Surah theme if the **provided text itself** explicitly links the verse to it. Do not add it otherwise.
        *   Respond directly to the user's question about the verse, incorporating the extracted details.

5.  **TAFSIR REQUESTED BUT TEXT UNAVAILABLE:**
    *   If the user asks about **Surah 1, Verse 1 (Al-Fatiha 1:1)** AND 'Tafsir Text' is 'Not Available' (because we skipped fetching it):
        *   **Usage Check:** (Handled before this step).
        *   Explain the meaning of "Bismillah al-Rahman al-Rahim" (Verse 1:1) based on your general Islamic knowledge. Focus on the components: 'Bismillah', 'Allah', 'Ar-Rahman', 'Ar-Rahim'.
        *   **Do NOT mention Isti'adhah (seeking refuge)** unless the user specifically asks about the *practice* of starting recitation. Focus solely on the meaning of the Basmala itself.
        *   Do NOT mention the unavailable external text.
    *   If the user asks about **any other SPECIFIC verse (${surah}:${verse})** BUT 'Tafsir Text' is 'Not Available':
        *   **Usage Check:** (Handled before this step).
        *   State clearly: "Unfortunately, ${scholarName}'s detailed tafsir text is not available in our database for verse ${surah}:${verse}."
        *   Address the user's question generally based on your knowledge of the Quran and the Surah's theme (${currentSurahTheme}), if applicable. Mention the theme connection cautiously.
        *   Avoid speculation presented as fact. Offer alternatives: "Perhaps we could discuss the general meaning, or look at another verse?"

6.  **INAPPROPRIATE/OFF-TOPIC:**
    *   Politely decline questions unrelated to Quran, Islam, tafsir, or your capabilities. Redirect: "My purpose is to assist with understanding the Quran. How can I help with that?" or "I focus on Quranic insights. Do you have a question about a verse or Surah?" Do not engage in debates.

7.  **INVALID REQUESTS:**
    *   If the user asks for tafsir but doesn't provide a Surah and Verse number, politely ask for them. Example: "To provide the tafsir, please specify the Surah and Verse number you're interested in."

**General Tone:** Be helpful, respectful, accurate, and focused on the Quran. Avoid overly casual language.
**ABSOLUTE RULE: If the user asks a direct question (not just 'hi' or 'salam'), DO NOT start your response with any greeting** (like "Wa alaikum assalam" or "Hello"). Answer the question directly.
${!isPreProcessedTafsir ? `**ABSOLUTE RULE: When answering about verse ${surah}:${verse}, you must EXCLUDE any content from the tafsir text that pertains to verses ${surah}:${Number(verse) + 1}, ${surah}:${Number(verse) + 2}, or any other verse. The raw tafsir text is a continuous passage covering multiple verses. Your job is to surgically extract ONLY the portion about ${surah}:${verse}.**` : ''}
**ABSOLUTE RULE: Every sentence in your response must be traceable to a specific passage in the provided tafsir text. If you cannot point to where in the text a claim comes from, DELETE that sentence. Do NOT add your own interpretation, symbolism, moral lessons, or thematic analysis. If the source text is brief, your answer must be brief.**
`;
    // --- End Unified System Prompt ---

    // --- Determine user tier and check usage ---
    const isPremiumUser = !!(req.auth as any)?.premium;
    let shouldIncrementUsage = false;
    let isFreeTierUser = !isPremiumUser;
    let userUsage: any = null;

    if ((isGeneralSurahQuestion && !verse) || (surah && verse)) {
        try {
            userUsage = await usageService.getOrCreateUsage(userId);

            if (isPremiumUser) {
                if (!await userUsage.canMakeAIRequest()) {
                    return res.status(429).json({
                        success: false,
                        error: 'Daily AI request limit exceeded. Please try again tomorrow.',
                        limit: userUsage.aiRequestLimit,
                        used: userUsage.aiRequests.count,
                        isPremium: true
                    });
                }
            } else {
                if (!await userUsage.canMakeFreeTierRequest()) {
                    return res.status(403).json({
                        success: false,
                        error: 'You have used all 5 free AI questions for today. Subscribe to Nura Premium for unlimited access, or try again tomorrow.',
                        freeTierExhausted: true,
                        used: userUsage.freeTierQuestions.count,
                        limit: userUsage.freeTierQuestions.limit
                    });
                }
            }
            shouldIncrementUsage = true;
        } catch (usageError) {
            return next(usageError);
        }
    }

    // --- Generate AI Response ---
    const responseContent = await openai.generateResponse(systemMessage, String(question));

    // --- Increment Usage (if applicable) ---
    if (shouldIncrementUsage && userUsage) {
        try {
            const freshUsage = await UserUsage.findOne({ userId });
            if (freshUsage) {
                if (isPremiumUser) {
                    await freshUsage.incrementAIRequestCount();
                } else {
                    await freshUsage.incrementFreeTierCount();
                }
            }
        } catch (incrementError) {
            // Non-fatal: still return the response
        }
    }

    // Determine source based on whether tafsir was used or available
    let responseSource = 'ai_general_chat'; // Default for greetings, capabilities, general fallback
     if (isGeneralSurahQuestion && !verse) {
        responseSource = 'ai_surah_theme';
    } else if (surah && verse) {
        responseSource = hasTafsirContent ? 'tafsir_sources' : 'ai_fallback';
    }

    // console.log(`[Tafsir Chat] PRE-JSON_RESPONSE: About to send final JSON response. Source: ${responseSource}`);
    const responsePayload: any = {
      success: true,
      content: responseContent,
      source: responseSource,
      sources: (responseSource === 'tafsir_sources') ? [
        {
          name: selectedTafsir === 'ibn-kathir' ? 'Ibn Kathir' : 'Al-Tabari',
          language: tafsirSources[selectedTafsir].language
        }
      ] : [],
      isPremium: isPremiumUser
    };

    if (!isPremiumUser && userUsage) {
      responsePayload.freeTierRemaining = Math.max(0, userUsage.freeTierQuestions.limit - userUsage.freeTierQuestions.count - (shouldIncrementUsage ? 1 : 0));
      responsePayload.freeTierLimit = userUsage.freeTierQuestions.limit;
    }

    return res.json(responsePayload);

  } catch (error: any) {
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

/**
 * Extracts only the tafsir sections belonging to the requested verse from a
 * multi-verse HTML blob returned by QuranCDN.
 *
 * Two structural patterns exist in the data:
 *
 * Pattern A (long surahs like An-Nisa): Each H2 section covers ~1 verse.
 *   totalH2Sections >= totalVerses. We keep sections until we hit a boundary.
 *
 * Pattern B (short surahs like Al-Inshiqaq): One H2 section covers many verses.
 *   totalH2Sections < totalVerses. We can't split within a section, so we return
 *   the full blob and let the AI prompt handle per-verse filtering.
 */
function extractVerseSection(html: string, surah: string, verse: string, allVerses: string[]): string {
  const requestedVerseNum = parseInt(verse, 10);
  const nextVerses = allVerses
    .map(v => parseInt(v.split(':')[1], 10))
    .filter(v => v > requestedVerseNum)
    .sort((a, b) => a - b);

  if (nextVerses.length === 0) return html;

  const sections = html.split(/<h2>/i);
  if (sections.length <= 1) return html;

  const totalH2Sections = sections.length - 1;
  const totalVerses = allVerses.length;

  // Pattern B: fewer H2 sections than verses means each section covers multiple
  // verses. We can't reliably split within a section at the code level, so
  // return the full content and rely on the AI prompt's verse boundary rules.
  if (totalH2Sections < totalVerses) {
    return html;
  }

  // Pattern A: sections roughly map 1:1 to verses. Keep only the first verse's sections.
  const keptSections: string[] = [];
  if (sections[0].trim()) {
    keptSections.push(sections[0]);
  }

  const estimatedSectionsForFirstVerse = Math.max(1, Math.floor(totalH2Sections / totalVerses));
  let keepCount = estimatedSectionsForFirstVerse;

  for (let i = estimatedSectionsForFirstVerse + 1; i < sections.length; i++) {
    const closingIdx = sections[i].indexOf('</h2>');
    const bodyText = closingIdx >= 0 ? sections[i].substring(closingIdx + 5) : '';
    const bodyClean = bodyText.replace(/<[^>]+>/g, '').trim();

    // "Allah said," at the start of a section body marks a new verse quotation
    if (/^Allah(?:'s)?\s+(?:said|statement|command)/i.test(bodyClean)) {
      break;
    }
    keepCount = i;
  }

  for (let i = 1; i <= keepCount; i++) {
    keptSections.push('<h2>' + sections[i]);
  }

  return keptSections.join('');
}

interface TafsirResult {
  content: string;
  isPreProcessed: boolean;
}

async function getTafsirContent(source: string, surah: string, verse: string): Promise<TafsirResult> {
  try {
    // Check pre-processed per-verse MongoDB cache first (best quality for AI chat)
    const preProcessed = await TafsirVerse.findOne({
      surah: parseInt(surah, 10),
      verse: parseInt(verse, 10),
      edition: source
    });
    if (preProcessed?.content) {
      return { content: preProcessed.content, isPreProcessed: true };
    }
    
    // Fallback to in-memory cache
    const cacheKey = `${source}-${surah}-${verse}`;
    const cachedContent = await tafsirCacheService.get(cacheKey);
    if (cachedContent) {
      const sourceConfig = tafsirSources[source];
      const isArabic = sourceConfig?.language === 'ar';
      return { content: processTafsirContent(cachedContent, 6000, isArabic), isPreProcessed: false };
    }

    // If not in cache, fetch from API
    const sourceConfig = tafsirSources[source];
    if (!sourceConfig) {
      return { content: '', isPreProcessed: false };
    }

    const isArabic = sourceConfig.language === 'ar';
    const url = `${sourceConfig.baseUrl}/by_ayah/${surah}:${verse}`;
    // console.log('Fetching from API:', { url, language: sourceConfig.language });
    
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'IslamApp/1.0'
      }
    });

    // console.log('API Response:', {
    //   status: response.status,
    //   hasData: !!response.data,
    //   hasTafsir: !!response.data?.tafsir,
    //   hasText: !!response.data?.tafsir?.text,
    //   contentLength: response.data?.tafsir?.text?.length,
    //   isArabic
    // });

    if (!response.data?.tafsir?.text) {
      return { content: '', isPreProcessed: false };
    }

    let rawHtml = response.data.tafsir.text;

    // Filter multi-verse content: the API often returns tafsir spanning multiple
    // verses in a single blob. Use H2 section headings to extract only the portions
    // that belong to the requested verse by checking the verses metadata.
    const versesInResponse = response.data?.tafsir?.verses ? Object.keys(response.data.tafsir.verses) : [];
    const requestedKey = `${surah}:${verse}`;
    if (versesInResponse.length > 1 && versesInResponse.includes(requestedKey)) {
      rawHtml = extractVerseSection(rawHtml, surah, verse, versesInResponse);
    }

    // Process the content
    let cleanText = rawHtml
      .replace(/<h2>/g, '\n\n')
      .replace(/<\/h2>/g, '\n')
      .replace(/<p>/g, '\n')
      .replace(/<\/p>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    // console.log('Initial cleaning:', { 
    //   source,
    //   originalLength: response.data.tafsir.text.length,
    //   cleanedLength: cleanText.length,
    //   isArabic
    // });

    // Special handling for Arabic text
    if (isArabic) {
      try {
        // console.log('Processing Arabic text:', { 
        //   source,
        //   beforeLength: cleanText.length,
        //   containsArabic: /[\u0600-\u06FF]/.test(cleanText)
        // });

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

        // console.log('Arabic processing complete:', { 
        //   source,
        //   afterLength: cleanText.length,
        //   sections: cleanText.split('\n\n').length
        // });

      } catch (error) {
        // console.error('Error processing Arabic text:', {
        //   source,
        //   error: error instanceof Error ? error.message : String(error),
        //   stack: error instanceof Error ? error.stack : undefined
        // });
        return { content: cleanText, isPreProcessed: false };
      }
    }

    // Process content before saving to cache
    // console.log('Processing final content:', { source, length: cleanText.length, isArabic });
    const processedContent = processTafsirContent(cleanText, 6000, isArabic);
    // console.log('Content processed:', { 
    //   source,
    //   originalLength: cleanText.length,
    //   processedLength: processedContent.length,
    //   sections: processedContent.split('\n\n').length,
    //   isArabic
    // });
    
    // Only cache if we have valid content
    if (processedContent) {
      await tafsirCacheService.set(cacheKey, processedContent);
      // console.log('Content cached:', { source, cacheKey });
    }
    
    return { content: processedContent, isPreProcessed: false };

  } catch (error) {
    return { content: '', isPreProcessed: false };
  }
}

export default router; 