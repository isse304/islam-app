import express, { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import axios from 'axios';
import { OpenAI } from 'openai';
import { promises as fs } from 'fs';
import { join } from 'path';

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

const DUA_INSIGHTS_PATH = join(__dirname, '../data/dua-insights.json');
const EMOTIONAL_DUAS_PATH = join(__dirname, '../data/emotional-duas.json');
const SURAH_THEMES_PATH = join(__dirname, '../data/surah-themes.json');

const SURAH_VERSE_COUNTS: Record<number, number> = {
  1:7,2:286,3:200,4:176,5:120,6:165,7:206,8:75,9:129,10:109,
  11:123,12:111,13:43,14:52,15:99,16:128,17:111,18:110,19:98,20:135,
  21:112,22:78,23:118,24:64,25:77,26:227,27:93,28:88,29:69,30:60,
  31:34,32:30,33:73,34:54,35:45,36:83,37:182,38:88,39:75,40:85,
  41:54,42:53,43:89,44:59,45:37,46:35,47:38,48:29,49:18,50:45,
  51:60,52:49,53:62,54:55,55:78,56:96,57:29,58:22,59:24,60:13,
  61:14,62:11,63:11,64:18,65:12,66:12,67:30,68:52,69:52,70:44,
  71:28,72:28,73:20,74:56,75:40,76:31,77:50,78:40,79:46,80:42,
  81:29,82:19,83:36,84:25,85:22,86:17,87:19,88:26,89:30,90:20,
  91:15,92:21,93:11,94:8,95:8,96:19,97:5,98:8,99:8,100:11,
  101:11,102:8,103:3,104:9,105:5,106:4,107:7,108:3,109:6,110:3,
  111:5,112:4,113:5,114:6
};

function getRandomVerse(surah: number): number {
  const maxVerse = SURAH_VERSE_COUNTS[surah] || 5;
  return Math.floor(Math.random() * maxVerse) + 1;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Priority-based content selection — identical to the tafsir chat pipeline.
 * Scores sections by scholarly importance and assembles the best ones within a token budget.
 */
function processTafsirContent(content: string, maxTokens: number = 6000): string {
  if (!content) return '';
  if (estimateTokens(content) <= maxTokens) return content;

  const sections = content.split(/\n\n+/);

  const priorityPatterns = [
    /سبب.*نزول|context.*revelation|occasion.*revelation/i,
    /تفسير|معنى|شرح|interpretation|meaning|explanation/i,
    /حكم|ruling|فقه|fiqh/i,
    /فائدة|حكمة|benefit|wisdom/i,
    /حديث|أثر|hadith|narration|reported/i
  ];

  const scoredSections = sections.map(section => {
    let score = 0;
    priorityPatterns.forEach((pattern, index) => {
      if (pattern.test(section)) {
        score += (priorityPatterns.length - index);
      }
    });
    return { section, score };
  }).sort((a, b) => b.score - a.score);

  let processedContent = sections[0] + '\n\n';
  let currentTokens = estimateTokens(processedContent);

  for (const { section } of scoredSections) {
    const sectionTokens = estimateTokens(section);
    if (currentTokens + sectionTokens <= maxTokens * 0.95) {
      processedContent += section + '\n\n';
      currentTokens += sectionTokens;
    }
  }

  if (estimateTokens(content) > maxTokens) {
    processedContent += '\n[Note: Some content has been optimized for length while preserving key interpretations and context.]';
  }

  return processedContent.trim();
}

/**
 * Fetch the actual verse text (Arabic + English translation) from the Quran API.
 * This ensures the AI never guesses or misattributes a verse translation.
 */
async function fetchVerseText(surah: number, verse: number): Promise<{ arabic: string; translation: string } | null> {
  try {
    const url = `https://api.quran.com/api/v4/verses/by_key/${surah}:${verse}?language=en&words=false&translations=131&fields=text_uthmani`;
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'Accept': 'application/json' }
    });

    const verseData = response.data?.verse;
    const arabic = verseData?.text_uthmani || '';
    const translation = response.data?.verse?.translations?.[0]?.text?.replace(/<[^>]+>/g, '') || '';

    if (!arabic && !translation) return null;
    return { arabic, translation };
  } catch (error) {
    console.error(`[Newsletter] Failed to fetch verse text for ${surah}:${verse}:`, error);
    return null;
  }
}

/**
 * Generate a reflection using GPT-4o-mini for higher accuracy.
 * Separate from the shared OpenAIService to avoid affecting other features.
 */
async function generateReflection(prompt: string): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are NuraAI, a knowledgeable Islamic scholar who provides accurate, respectful information about Islam. You always cite sources directly and never fabricate scholarly attributions. When provided with tafsir text, you base your response SOLELY on that text.'
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 1000
  });
  return completion.choices[0]?.message?.content || 'No response generated';
}

/**
 * Fetch real tafsir text from QuranCDN with priority-based content selection.
 * Same RAG approach and content processing as the tafsir chat pipeline.
 */
async function fetchTafsirFromCDN(surah: number, verse: number): Promise<string> {
  if (surah === 1 && verse === 1) return '';

  try {
    const url = `https://api.qurancdn.com/api/qdc/tafsirs/en-tafisr-ibn-kathir/by_ayah/${surah}:${verse}`;
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'Accept': 'application/json', 'User-Agent': 'NuraAI/1.0' }
    });

    if (!response.data?.tafsir?.text) return '';

    const cleanText = response.data.tafsir.text
      .replace(/<h2>/g, '\n\n')
      .replace(/<\/h2>/g, '\n')
      .replace(/<p>/g, '\n')
      .replace(/<\/p>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    return processTafsirContent(cleanText, 6000);
  } catch (error) {
    console.error(`[Newsletter] Failed to fetch tafsir for ${surah}:${verse}:`, error);
    return '';
  }
}

/**
 * Build the reflection prompt with the actual verse text and strict sourcing rules.
 */
function buildReflectionPrompt(
  surah: number, verse: number, surahName: string, surahTheme: string,
  tafsirText: string, verseText: { arabic: string; translation: string } | null
): string {
  const verseBlock = verseText
    ? `EXACT VERSE TEXT (${surah}:${verse}):
Arabic: ${verseText.arabic}
English: "${verseText.translation}"

You MUST use this exact English translation when quoting the verse. Do NOT paraphrase or use a different translation.`
    : '';

  if (surah === 1 && verse === 1) {
    return `Write a heartfelt, concise weekly reflection (150-200 words) on Surah Al-Fatiha, Verse 1: "Bismillah al-Rahman al-Rahim".

${verseBlock}

Focus on:
- The meaning of each component: 'Bismillah' (In the Name of Allah), 'Ar-Rahman' (The Most Gracious — mercy for all creation), 'Ar-Rahim' (The Most Merciful — special mercy for the believers)
- How beginning all actions with Allah's name transforms our daily life
- End with a contemplation or question

Do NOT discuss Isti'adhah (seeking refuge) unless directly relevant.
Keep the tone warm, reflective, and accessible. This is for a weekly email newsletter called "Nura Reflections".`;
  }

  if (tafsirText) {
    return `You have access to Ibn Kathir's tafsir for Surah ${surah} (${surahName}), Verse ${verse}.

${verseBlock}

IMPORTANT — STRICT SOURCING RULES (follow these ABSOLUTELY):
1. The tafsir text below may cover multiple verses at once. You MUST focus ONLY on what is relevant to Verse ${verse} (${surah}:${verse}).
2. Your reflection MUST be based SOLELY on the provided tafsir text. DO NOT introduce external information, interpretations, or context that is not explicitly present in the text below.
3. When conveying Ibn Kathir's points, attribute clearly: "Ibn Kathir explains..." or "According to Ibn Kathir..."
4. If the provided text does not contain specific commentary for Verse ${verse}, state what is available and do not fabricate details.
5. Do NOT reference or discuss other verse numbers.
6. Use the EXACT English translation provided above when quoting the verse — do not substitute your own.

Here is Ibn Kathir's tafsir text:
---
${tafsirText}
---

Using the above tafsir as your SOLE source, write a heartfelt, concise weekly reflection (150-200 words).

The reflection should:
- Begin with "Surah ${surahName}, Verse ${verse}" as the header
- Quote the verse using the exact English translation provided above
- Present Ibn Kathir's specific scholarly points — avoid summarizing broadly, extract the key arguments and evidence
- Connect it to a practical lesson for modern daily life
- End with a brief contemplation or question for the reader to ponder

Theme of this Surah: ${surahTheme}

Keep the tone warm, reflective, and accessible. This is for a weekly email newsletter called "Nura Reflections". Ground every claim in the scholarly source provided.`;
  }

  return `Write a heartfelt, concise weekly reflection (150-200 words) on Surah ${surah} (${surahName}), Verse ${verse}.

${verseBlock}

NOTE: Ibn Kathir's detailed tafsir text is not available for this specific verse. Base your reflection on well-known, authentic Islamic scholarship about this verse. Do NOT fabricate scholarly attributions — if you are unsure of a specific scholarly opinion, present the point as general Islamic understanding rather than attributing it to a specific scholar.

The reflection should:
- Begin with "Surah ${surahName}, Verse ${verse}" as the header
- Quote the verse using the exact English translation provided above
- Explain its meaning grounded in authentic Islamic understanding
- Connect it to a practical lesson for modern daily life
- End with a brief contemplation or question for the reader to ponder

Theme of this Surah: ${surahTheme}

Keep the tone warm, reflective, and accessible. This is for a weekly email newsletter called "Nura Reflections".`;
}

/**
 * Middleware: Verify the request has a valid newsletter API key.
 * n8n will send this key in the X-Newsletter-Key header.
 * This replaces Firebase Auth for server-to-server calls.
 */
function withNewsletterKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-newsletter-key'] as string;
  const expectedKey = process.env['NEWSLETTER_API_KEY'];

  if (!expectedKey) {
    console.error('[Newsletter] NEWSLETTER_API_KEY not configured in environment');
    res.status(500).json({ error: 'Newsletter API key not configured on server' });
    return;
  }

  if (!apiKey || apiKey !== expectedKey) {
    res.status(401).json({ error: 'Invalid or missing newsletter API key' });
    return;
  }

  next();
}

router.use(withNewsletterKey);

// ──────────────────────────────────────────────
// GET /api/newsletter/users
// Returns all user emails from Firebase Auth
// ──────────────────────────────────────────────
router.get('/users', async (_req: Request, res: Response) => {
  try {
    const emails: string[] = [];
    let nextPageToken: string | undefined;

    do {
      const listResult = await admin.auth().listUsers(1000, nextPageToken);
      for (const user of listResult.users) {
        if (user.email) {
          emails.push(user.email);
        }
      }
      nextPageToken = listResult.pageToken;
    } while (nextPageToken);

    res.json({
      success: true,
      count: emails.length,
      emails
    });
  } catch (error) {
    console.error('[Newsletter] Error listing users:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// ──────────────────────────────────────────────
// POST /api/newsletter/tafsir-reflection
// Generates a tafsir reflection for a specific or random ayah
// Body (optional): { surah: number, verse: number }
// If not provided, picks a random surah/verse
// ──────────────────────────────────────────────
router.post('/tafsir-reflection', async (req: Request, res: Response) => {
  try {
    const surahThemes = JSON.parse(await fs.readFile(SURAH_THEMES_PATH, 'utf8'));
    const totalSurahs = Object.keys(surahThemes).length;

    const surah = req.body?.surah || (Math.floor(Math.random() * totalSurahs) + 1);
    const verse = req.body?.verse || getRandomVerse(surah);
    const surahInfo = surahThemes[String(surah)];
    const surahName = surahInfo?.name || `Surah ${surah}`;

    const [tafsirText, verseText] = await Promise.all([
      fetchTafsirFromCDN(surah, verse),
      fetchVerseText(surah, verse)
    ]);

    const prompt = buildReflectionPrompt(surah, verse, surahName, surahInfo?.theme || 'General guidance', tafsirText, verseText);
    const reflection = await generateReflection(prompt);

    res.json({
      success: true,
      surah,
      verse,
      surahName,
      verseText: verseText || undefined,
      usedScholarlySources: !!tafsirText,
      reflection
    });
  } catch (error) {
    console.error('[Newsletter] Error generating tafsir reflection:', error);
    res.status(500).json({ error: 'Failed to generate tafsir reflection' });
  }
});

// ──────────────────────────────────────────────
// POST /api/newsletter/emotional-dua
// COMMENTED OUT — uncomment when ready to include in newsletter
// ──────────────────────────────────────────────
// router.post('/emotional-dua', async (req: Request, res: Response) => {
//   try {
//     const data = JSON.parse(await fs.readFile(EMOTIONAL_DUAS_PATH, 'utf8'));
//     const emotions = Object.keys(data.emotions);
//     let emotion = req.body?.emotion;
//     if (!emotion || !data.emotions[emotion]) {
//       emotion = emotions[Math.floor(Math.random() * emotions.length)];
//     }
//     const entries = data.emotions[emotion];
//     const entry = entries[Math.floor(Math.random() * entries.length)];
//     const dua = entry.spiritual_advice?.duas?.[0];
//     const dhikr = entry.spiritual_advice?.dhikr?.[0];
//     res.json({
//       success: true, emotion,
//       content: entry.content,
//       quranic_guidance: entry.quranic_guidance?.[0] || '',
//       dua: dua ? { arabic: dua.arabic, translation: dua.translation, reference: dua.reference, virtue: dua.virtue } : null,
//       dhikr: dhikr ? { phrase: dhikr.phrase, translation: dhikr.translation, count: dhikr.count, benefit: dhikr.benefit } : null,
//       practical_step: entry.practical_steps?.[0] || ''
//     });
//   } catch (error) {
//     console.error('[Newsletter] Error getting emotional dua:', error);
//     res.status(500).json({ error: 'Failed to get emotional dua' });
//   }
// });

// ──────────────────────────────────────────────
// POST /api/newsletter/dua-insight
// COMMENTED OUT — uncomment when ready to include in newsletter
// ──────────────────────────────────────────────
// router.post('/dua-insight', async (req: Request, res: Response) => {
//   try {
//     const allInsights = JSON.parse(await fs.readFile(DUA_INSIGHTS_PATH, 'utf8'));
//     let insight;
//     if (req.body?.duaId) {
//       insight = allInsights.find((i: any) => i.duaId === req.body.duaId);
//     }
//     if (!insight) {
//       insight = allInsights[Math.floor(Math.random() * allInsights.length)];
//     }
//     res.json({
//       success: true, duaTitle: insight.duaTitle, category: insight.category,
//       content: insight.content, virtues: insight.virtues?.slice(0, 2) || [],
//       application: insight.application?.[0] || '', historical_context: insight.historical_context || '',
//       dua: insight.spiritual_advice?.duas?.[0] || null
//     });
//   } catch (error) {
//     console.error('[Newsletter] Error getting dua insight:', error);
//     res.status(500).json({ error: 'Failed to get dua insight' });
//   }
// });

// ──────────────────────────────────────────────
// POST /api/newsletter/generate
// Generates the weekly newsletter content (tafsir reflection only for now)
// This is the main endpoint n8n should call
// Body (optional): { surah, verse }
// ──────────────────────────────────────────────
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const surahThemes = JSON.parse(await fs.readFile(SURAH_THEMES_PATH, 'utf8'));

    const totalSurahs = Object.keys(surahThemes).length;
    const surah = req.body?.surah || (Math.floor(Math.random() * totalSurahs) + 1);
    const verse = req.body?.verse || getRandomVerse(surah);
    const surahInfo = surahThemes[String(surah)];
    const surahName = surahInfo?.name || `Surah ${surah}`;

    const [tafsirText, verseText] = await Promise.all([
      fetchTafsirFromCDN(surah, verse),
      fetchVerseText(surah, verse)
    ]);

    const prompt = buildReflectionPrompt(surah, verse, surahName, surahInfo?.theme || 'General guidance', tafsirText, verseText);
    const reflection = await generateReflection(prompt);

    res.json({
      success: true,
      tafsir_reflection: {
        surah,
        verse,
        surahName,
        verseText: verseText || undefined,
        usedScholarlySources: !!tafsirText,
        reflection
      }
    });
  } catch (error) {
    console.error('[Newsletter] Error generating newsletter content:', error);
    res.status(500).json({ error: 'Failed to generate newsletter content' });
  }
});

export default router;
