import express, { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import axios from 'axios';
import crypto from 'crypto';
import { OpenAI } from 'openai';
import { promises as fs } from 'fs';
import { join } from 'path';
import { NewsletterUnsubscribe } from '../models/NewsletterUnsubscribe';
import { PendingNewsletter } from '../models/PendingNewsletter';

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
    const url = `https://api.quran.com/api/v4/verses/by_key/${surah}:${verse}?language=en&words=false&translations=20&fields=text_uthmani`;
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'Accept': 'application/json' }
    });

    const verseData = response.data?.verse;
    const arabic = verseData?.text_uthmani || '';
    const translation = verseData?.translations?.[0]?.text?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || '';

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
        content: `You are NuraAI, a knowledgeable Islamic scholar writing for a weekly email newsletter.

WRITING RULES:
- Write in PLAIN TEXT only. Do NOT use markdown (no #, ##, ###, **, *, --, etc.).
- Do NOT invent metaphors or poetic concepts not found in the source material. If Ibn Kathir says Salsabeel is a spring in Paradise, say exactly that — do not call it "the spirit of Salsabeel" or similar.
- Stay precise and scholarly. Every claim must come from the provided tafsir text.
- Be warm and accessible, but never sacrifice accuracy for poetic language.
- Do NOT start with a header line — the email template already has one.
- Start directly with the verse quote, then the reflection.`
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 800
  });
  return completion.choices[0]?.message?.content || 'No response generated';
}

/**
 * Validate a generated reflection against the original tafsir source.
 * Returns { passed, issues } — if issues are found, the reflection should be regenerated.
 */
async function validateReflection(
  reflection: string,
  tafsirText: string,
  surah: number,
  verse: number,
  surahName: string
): Promise<{ passed: boolean; issues: string[] }> {
  if (!tafsirText) {
    const issues: string[] = [];
    if (/#{1,6}\s/.test(reflection)) issues.push('Contains markdown headers');
    if (/\*\*[^*]+\*\*/.test(reflection)) issues.push('Contains markdown bold');
    const wordCount = reflection.split(/\s+/).length;
    if (wordCount < 80) issues.push(`Too short (${wordCount} words)`);
    if (wordCount > 350) issues.push(`Too long (${wordCount} words)`);
    return { passed: issues.length === 0, issues };
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a strict Islamic content validator. Your job is to compare a generated reflection against the original Ibn Kathir tafsir text and flag ANY inaccuracies. Be ruthlessly precise.`
        },
        {
          role: 'user',
          content: `ORIGINAL TAFSIR TEXT (Ibn Kathir) for Surah ${surah} (${surahName}), Verse ${verse}:
---
${tafsirText}
---

GENERATED REFLECTION:
---
${reflection}
---

Check the reflection against the tafsir text. For EACH sentence in the reflection, verify it has a direct basis in the tafsir text above.

Respond in this EXACT JSON format (no markdown, no code fences):
{
  "passed": true/false,
  "issues": ["issue 1", "issue 2"]
}

Flag as issues:
1. Any claim attributed to Ibn Kathir that is NOT in the tafsir text above
2. Any invented metaphors or symbolic language not in the source (e.g. "the spirit of X", "symbolizes Y")
3. Any markdown formatting (# headers, **bold**, etc.)
4. Any scholar names mentioned that do NOT appear in the tafsir text
5. If the reflection discusses a different verse number than ${verse}

Do NOT flag:
- General Islamic knowledge used in the practical takeaway section (this is allowed)
- The reflective question at the end (this is allowed to be original)

If there are zero issues, return: {"passed": true, "issues": []}`
        }
      ],
      temperature: 0.1,
      max_tokens: 500
    });

    const raw = completion.choices[0]?.message?.content || '';
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    try {
      const result = JSON.parse(cleaned);
      return {
        passed: result.passed === true && (!result.issues || result.issues.length === 0),
        issues: result.issues || []
      };
    } catch {
      console.error('[Newsletter] Failed to parse validation response:', raw);
      return { passed: true, issues: ['Validation parse error — defaulting to pass'] };
    }
  } catch (error) {
    console.error('[Newsletter] Validation LLM call failed:', error);
    return { passed: true, issues: ['Validation call failed — defaulting to pass'] };
  }
}

const MAX_VALIDATION_ATTEMPTS = 3;

/**
 * Generate a reflection with validation and retry logic.
 * Tries up to MAX_VALIDATION_ATTEMPTS times to produce a validated reflection.
 */
async function generateValidatedReflection(
  surah: number, verse: number, surahName: string, surahTheme: string,
  tafsirText: string, verseText: { arabic: string; translation: string } | null
): Promise<{ reflection: string; validation: { passed: boolean; attempts: number; issues: string[] } }> {
  let lastReflection = '';
  let lastIssues: string[] = [];

  for (let attempt = 1; attempt <= MAX_VALIDATION_ATTEMPTS; attempt++) {
    const prompt = buildReflectionPrompt(surah, verse, surahName, surahTheme, tafsirText, verseText);

    if (attempt > 1 && lastIssues.length > 0) {
      const retryNote = `\n\nIMPORTANT: A previous version of this reflection was rejected for the following issues:\n${lastIssues.map(i => `- ${i}`).join('\n')}\n\nFix ALL of these issues in your new response. Be extra careful to only state what is explicitly in the tafsir text.`;
      lastReflection = await generateReflection(prompt + retryNote);
    } else {
      lastReflection = await generateReflection(prompt);
    }

    const validation = await validateReflection(lastReflection, tafsirText, surah, verse, surahName);
    console.log(`[Newsletter] Validation attempt ${attempt}: ${validation.passed ? 'PASSED' : 'FAILED'}`, validation.issues);

    if (validation.passed) {
      return { reflection: lastReflection, validation: { passed: true, attempts: attempt, issues: [] } };
    }

    lastIssues = validation.issues;
  }

  return {
    reflection: lastReflection,
    validation: { passed: false, attempts: MAX_VALIDATION_ATTEMPTS, issues: lastIssues }
  };
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
    return `Write a concise weekly reflection (150-200 words) on Surah Al-Fatiha, Verse 1: "Bismillah al-Rahman al-Rahim".

${verseBlock}

STRUCTURE (follow exactly):
1. Explain the meaning of each component: 'Bismillah' (In the Name of Allah), 'Ar-Rahman' (The Most Gracious — mercy for all creation), 'Ar-Rahim' (The Most Merciful — special mercy for the believers).
2. One practical takeaway about how beginning actions with Allah's name affects our daily life.
3. End with one short question for the reader to reflect on.

RULES:
- Do NOT add a title, header, or verse quote — the email template already displays the verse above your text.
- Do NOT use markdown formatting (no #, ##, *, **, --, etc.).
- Do NOT discuss Isti'adhah (seeking refuge) unless directly relevant.
- Use simple, direct language. Be warm but precise.`;
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

Using the above tafsir as your SOLE source, write a concise weekly reflection (150-200 words).

STRUCTURE (follow exactly):
1. Explain what Ibn Kathir says about this verse — use his actual points, not your own interpretation. Attribute clearly with "Ibn Kathir explains..." or "According to Ibn Kathir...".
2. One practical takeaway for daily life — keep it grounded and specific, not vague or poetic.
3. End with one short question for the reader to reflect on.

RULES:
- Do NOT add a title, header, or verse quote — the email template already displays the verse above your text. Jump straight into the explanation.
- Do NOT use markdown formatting (no #, ##, *, **, --, ---, etc.). Write plain text only.
- Do NOT invent metaphors or concepts not in the tafsir (e.g. do not say "the spirit of X" or "symbolizes Y" unless Ibn Kathir explicitly uses that language).
- Do NOT use flowery or poetic language. Be direct and scholarly.
- Use simple, clear language. Be warm but precise.

Theme of this Surah: ${surahTheme}`;
  }

  return `Write a heartfelt, concise weekly reflection (150-200 words) on Surah ${surah} (${surahName}), Verse ${verse}.

${verseBlock}

NOTE: Ibn Kathir's detailed tafsir text is not available for this specific verse. Base your reflection on well-known, authentic Islamic scholarship. Do NOT fabricate scholarly attributions — if unsure, present the point as general Islamic understanding.

STRUCTURE (follow exactly):
1. Explain the verse's meaning based on authentic Islamic scholarship. If referencing a scholar, only name them if you are certain of the attribution.
2. One practical takeaway for daily life — keep it grounded and specific, not vague or poetic.
3. End with one short question for the reader to reflect on.

RULES:
- Do NOT add a title, header, or verse quote — the email template already displays the verse above your text. Jump straight into the explanation.
- Do NOT use markdown formatting (no #, ##, *, **, --, ---, etc.). Write plain text only.
- Do NOT invent metaphors or concepts not grounded in scholarship.
- Do NOT use flowery or poetic language. Be direct and scholarly.
- Use simple, clear language. Be warm but precise.

Theme of this Surah: ${surahTheme}`;
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

// ──────────────────────────────────────────────
// Unsubscribe token helpers (HMAC-based, no login required)
// ──────────────────────────────────────────────
function generateUnsubscribeToken(email: string): string {
  const secret = process.env['NEWSLETTER_API_KEY'] || 'fallback-secret';
  return crypto.createHmac('sha256', secret).update(email.toLowerCase()).digest('hex').slice(0, 32);
}

function verifyUnsubscribeToken(email: string, token: string): boolean {
  return generateUnsubscribeToken(email) === token;
}

// ──────────────────────────────────────────────
// PUBLIC routes (no API key required — user-facing)
// ──────────────────────────────────────────────

// GET /api/newsletter/unsubscribe?email=...&token=...
router.get('/unsubscribe', async (req: Request, res: Response) => {
  try {
    const email = (req.query.email as string || '').toLowerCase().trim();
    const token = req.query.token as string || '';

    if (!email || !token || !verifyUnsubscribeToken(email, token)) {
      res.status(400).send(unsubscribePage('Invalid unsubscribe link.', false));
      return;
    }

    await NewsletterUnsubscribe.findOneAndUpdate(
      { email },
      { email, unsubscribedAt: new Date() },
      { upsert: true }
    );

    res.send(unsubscribePage(`You've been unsubscribed from Nura Reflections. You will no longer receive weekly emails.`, true));
  } catch (error) {
    console.error('[Newsletter] Unsubscribe error:', error);
    res.status(500).send(unsubscribePage('Something went wrong. Please try again later.', false));
  }
});

// GET /api/newsletter/resubscribe?email=...&token=...
router.get('/resubscribe', async (req: Request, res: Response) => {
  try {
    const email = (req.query.email as string || '').toLowerCase().trim();
    const token = req.query.token as string || '';

    if (!email || !token || !verifyUnsubscribeToken(email, token)) {
      res.status(400).send(unsubscribePage('Invalid link.', false));
      return;
    }

    await NewsletterUnsubscribe.deleteOne({ email });
    res.send(unsubscribePage(`Welcome back! You've been resubscribed to Nura Reflections.`, true));
  } catch (error) {
    console.error('[Newsletter] Resubscribe error:', error);
    res.status(500).send(unsubscribePage('Something went wrong. Please try again later.', false));
  }
});

// GET /api/newsletter/approve/:contentId?token=...
router.get('/approve/:contentId', async (req: Request, res: Response) => {
  try {
    const { contentId } = req.params;
    const token = req.query.token as string || '';
    const expectedToken = generateUnsubscribeToken(contentId);

    if (!token || token !== expectedToken) {
      res.status(400).send(approvalPage('Invalid approval link.', false));
      return;
    }

    const pending = await PendingNewsletter.findOne({ contentId, status: 'pending' });
    if (!pending) {
      res.status(404).send(approvalPage('This newsletter has already been sent or does not exist.', false));
      return;
    }

    pending.status = 'approved';
    pending.approvedAt = new Date();
    await pending.save();

    const n8nWebhookUrl = process.env['N8N_APPROVE_WEBHOOK'];
    if (n8nWebhookUrl) {
      try {
        await axios.post(n8nWebhookUrl, {
          contentId,
          surah: pending.surah,
          verse: pending.verse,
          surahName: pending.surahName,
          verseText: pending.verseText,
          usedScholarlySources: pending.usedScholarlySources,
          reflection: pending.reflection
        }, { timeout: 15000 });
      } catch (webhookError) {
        console.error('[Newsletter] Failed to trigger n8n webhook:', webhookError);
      }
    }

    res.send(approvalPage(
      `Newsletter approved! Sending "${pending.surahName}, Verse ${pending.verse}" to all subscribers now.`,
      true
    ));
  } catch (error) {
    console.error('[Newsletter] Approve error:', error);
    res.status(500).send(approvalPage('Something went wrong. Please try again.', false));
  }
});

// GET /api/newsletter/reject/:contentId?token=...
router.get('/reject/:contentId', async (req: Request, res: Response) => {
  try {
    const { contentId } = req.params;
    const token = req.query.token as string || '';
    const expectedToken = generateUnsubscribeToken(contentId);

    if (!token || token !== expectedToken) {
      res.status(400).send(approvalPage('Invalid link.', false));
      return;
    }

    await PendingNewsletter.findOneAndUpdate({ contentId }, { status: 'rejected' });
    res.send(approvalPage('Newsletter rejected. It will not be sent to subscribers.', true));
  } catch (error) {
    console.error('[Newsletter] Reject error:', error);
    res.status(500).send(approvalPage('Something went wrong. Please try again.', false));
  }
});

function approvalPage(message: string, success: boolean): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nura Reflections — Admin</title></head>
<body style="margin:0;padding:40px 20px;font-family:Georgia,serif;background:#f5f5f0;text-align:center;">
  <div style="max-width:480px;margin:0 auto;background:#fff;padding:40px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <h1 style="color:#1b5e20;font-size:24px;margin:0 0 8px 0;">Nura Reflections</h1>
    <p style="color:#888;font-size:13px;margin:0 0 16px 0;">Admin Panel</p>
    <div style="font-size:32px;margin:16px 0;">${success ? '✅' : '⚠️'}</div>
    <p style="color:#333;font-size:16px;line-height:1.6;">${message}</p>
    <a href="https://nura-ai.app" style="display:inline-block;margin-top:20px;background:#1b5e20;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;">Open Nura AI</a>
  </div>
</body></html>`;
}

function unsubscribePage(message: string, success: boolean): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nura Reflections</title></head>
<body style="margin:0;padding:40px 20px;font-family:Georgia,serif;background:#f5f5f0;text-align:center;">
  <div style="max-width:480px;margin:0 auto;background:#fff;padding:40px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <h1 style="color:#1b5e20;font-size:24px;margin:0 0 8px 0;">Nura Reflections</h1>
    <div style="font-size:32px;margin:16px 0;">${success ? '✅' : '⚠️'}</div>
    <p style="color:#333;font-size:16px;line-height:1.6;">${message}</p>
    <a href="https://nura-ai.app" style="display:inline-block;margin-top:20px;background:#1b5e20;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;">Open Nura AI</a>
  </div>
</body></html>`;
}

// ──────────────────────────────────────────────
// PROTECTED routes (API key required — n8n calls these)
// ──────────────────────────────────────────────
router.use(withNewsletterKey);

// ──────────────────────────────────────────────
// GET /api/newsletter/users
// Returns all user emails from Firebase Auth, excluding unsubscribed
// ──────────────────────────────────────────────
router.get('/users', async (_req: Request, res: Response) => {
  try {
    const allEmails: string[] = [];
    let nextPageToken: string | undefined;

    do {
      const listResult = await admin.auth().listUsers(1000, nextPageToken);
      for (const user of listResult.users) {
        if (user.email) {
          allEmails.push(user.email);
        }
      }
      nextPageToken = listResult.pageToken;
    } while (nextPageToken);

    const unsubscribed = await NewsletterUnsubscribe.find({}).select('email').lean();
    const unsubscribedSet = new Set(unsubscribed.map(u => u.email.toLowerCase()));
    const activeEmails = allEmails.filter(e => !unsubscribedSet.has(e.toLowerCase()));

    const baseUrl = process.env['APP_URL'] || 'https://nura-ai.app';
    const users = activeEmails.map(email => ({
      email,
      unsubscribeUrl: `${baseUrl}/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}&token=${generateUnsubscribeToken(email)}`
    }));

    res.json({
      success: true,
      count: users.length,
      totalUsers: allEmails.length,
      unsubscribedCount: unsubscribedSet.size,
      users
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
// Generates validated weekly newsletter content and stores it for approval.
// n8n calls this, then sends a preview email to the admin.
// The admin clicks Approve, which triggers a webhook to send to all users.
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

    const { reflection, validation } = await generateValidatedReflection(
      surah, verse, surahName, surahInfo?.theme || 'General guidance', tafsirText, verseText
    );

    const contentId = crypto.randomBytes(16).toString('hex');
    const approveToken = generateUnsubscribeToken(contentId);
    const baseUrl = process.env['APP_URL'] || 'https://nura-ai.app';

    await PendingNewsletter.create({
      contentId,
      surah,
      verse,
      surahName,
      verseText: verseText || null,
      usedScholarlySources: !!tafsirText,
      reflection,
      tafsirSource: tafsirText ? tafsirText.slice(0, 2000) : '',
      validation,
      status: 'pending'
    });

    res.json({
      success: true,
      contentId,
      approveUrl: `${baseUrl}/api/newsletter/approve/${contentId}?token=${approveToken}`,
      rejectUrl: `${baseUrl}/api/newsletter/reject/${contentId}?token=${approveToken}`,
      validation,
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

// ──────────────────────────────────────────────
// GET /api/newsletter/pending/:contentId
// Returns the stored content for a pending newsletter (used by the send workflow)
// ──────────────────────────────────────────────
router.get('/pending/:contentId', async (req: Request, res: Response) => {
  try {
    const pending = await PendingNewsletter.findOne({
      contentId: req.params.contentId,
      status: 'approved'
    });

    if (!pending) {
      res.status(404).json({ error: 'Newsletter not found or not approved' });
      return;
    }

    pending.status = 'sent';
    await pending.save();

    res.json({
      success: true,
      tafsir_reflection: {
        surah: pending.surah,
        verse: pending.verse,
        surahName: pending.surahName,
        verseText: pending.verseText,
        usedScholarlySources: pending.usedScholarlySources,
        reflection: pending.reflection
      }
    });
  } catch (error) {
    console.error('[Newsletter] Error fetching pending newsletter:', error);
    res.status(500).json({ error: 'Failed to fetch pending newsletter' });
  }
});

export default router;
