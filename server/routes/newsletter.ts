import express, { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import axios from 'axios';
import { OpenAIService } from '../services/openai.service';
import { promises as fs } from 'fs';
import { join } from 'path';

const router = express.Router();
const openAIService = new OpenAIService();

const DUA_INSIGHTS_PATH = join(__dirname, '../data/dua-insights.json');
const EMOTIONAL_DUAS_PATH = join(__dirname, '../data/emotional-duas.json');
const SURAH_THEMES_PATH = join(__dirname, '../data/surah-themes.json');

/**
 * Fetch real tafsir text from QuranCDN (same RAG approach as the tafsir chat).
 * Returns cleaned text from Ibn Kathir's tafsir for the given surah:verse.
 */
async function fetchTafsirFromCDN(surah: number, verse: number): Promise<string> {
  try {
    const url = `https://api.qurancdn.com/api/qdc/tafsirs/en-tafisr-ibn-kathir/by_ayah/${surah}:${verse}`;
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'Accept': 'application/json', 'User-Agent': 'NuraAI/1.0' }
    });

    if (!response.data?.tafsir?.text) return '';

    return response.data.tafsir.text
      .replace(/<h2>/g, '\n\n')
      .replace(/<\/h2>/g, '\n')
      .replace(/<p>/g, '\n')
      .replace(/<\/p>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\n\s*\n/g, '\n\n')
      .trim()
      .substring(0, 3000);
  } catch (error) {
    console.error(`[Newsletter] Failed to fetch tafsir for ${surah}:${verse}:`, error);
    return '';
  }
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

    let surah = req.body?.surah;
    let verse = req.body?.verse;

    if (!surah) {
      surah = Math.floor(Math.random() * totalSurahs) + 1;
    }
    if (!verse) {
      verse = Math.floor(Math.random() * 5) + 1;
    }

    const surahInfo = surahThemes[String(surah)];
    const surahName = surahInfo?.name || `Surah ${surah}`;

    const tafsirText = await fetchTafsirFromCDN(surah, verse);

    const prompt = tafsirText
      ? `You have access to Ibn Kathir's tafsir for Surah ${surah} (${surahName}), Verse ${verse}. 
      
Here is the scholarly tafsir text:
---
${tafsirText}
---

Using the above tafsir as your PRIMARY source, write a heartfelt, concise weekly reflection (150-200 words).

The reflection should:
- Start with the verse text in English translation
- Draw directly from Ibn Kathir's explanation above to convey the meaning
- Connect it to a practical lesson for modern daily life
- End with a brief contemplation or question for the reader to ponder

Theme of this Surah: ${surahInfo?.theme || 'General guidance'}

Keep the tone warm, reflective, and accessible. This is for a weekly email newsletter called "Nura Reflections". Ground your reflection in the scholarly source provided — do not invent interpretations.`
      : `Write a heartfelt, concise weekly reflection (150-200 words) on Surah ${surah} (${surahName}), Verse ${verse}. 
    
The reflection should:
- Start with the verse text in English translation
- Explain its meaning in a way anyone can understand
- Connect it to a practical lesson for modern daily life
- End with a brief contemplation or question for the reader to ponder

Theme of this Surah: ${surahInfo?.theme || 'General guidance'}

Keep the tone warm, reflective, and accessible. This is for a weekly email newsletter called "Nura Reflections".`;

    const reflection = await openAIService.generateResponse(prompt);

    res.json({
      success: true,
      surah,
      verse,
      surahName,
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
    const surah = req.body?.surah || Math.floor(Math.random() * totalSurahs) + 1;
    const verse = req.body?.verse || Math.floor(Math.random() * 5) + 1;
    const surahInfo = surahThemes[String(surah)];
    const surahName = surahInfo?.name || `Surah ${surah}`;

    const tafsirText = await fetchTafsirFromCDN(surah, verse);

    const reflectionPrompt = tafsirText
      ? `You have access to Ibn Kathir's tafsir for Surah ${surah} (${surahName}), Verse ${verse}. 
      
Here is the scholarly tafsir text:
---
${tafsirText}
---

Using the above tafsir as your PRIMARY source, write a heartfelt, concise weekly reflection (150-200 words).

The reflection should:
- Start with the verse text in English translation
- Draw directly from Ibn Kathir's explanation above to convey the meaning
- Connect it to a practical lesson for modern daily life
- End with a brief contemplation or question for the reader to ponder

Theme of this Surah: ${surahInfo?.theme || 'General guidance'}

Keep the tone warm, reflective, and accessible. This is for a weekly email newsletter called "Nura Reflections". Ground your reflection in the scholarly source provided — do not invent interpretations.`
      : `Write a heartfelt, concise weekly reflection (150-200 words) on Surah ${surah} (${surahName}), Verse ${verse}. 

The reflection should:
- Start with the verse text in English translation
- Explain its meaning in a way anyone can understand
- Connect it to a practical lesson for modern daily life
- End with a brief contemplation or question for the reader to ponder

Theme of this Surah: ${surahInfo?.theme || 'General guidance'}

Keep the tone warm, reflective, and accessible. This is for a weekly email newsletter called "Nura Reflections".`;

    const reflection = await openAIService.generateResponse(reflectionPrompt);

    res.json({
      success: true,
      tafsir_reflection: {
        surah,
        verse,
        surahName,
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
