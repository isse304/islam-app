import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import mongoose from 'mongoose';
import axios from 'axios';
import OpenAI from 'openai';

// Define schema inline to avoid cross-file import issues with Node 24 ESM
const tafsirVerseSchema = new mongoose.Schema({
  surah: { type: Number, required: true, index: true },
  verse: { type: Number, required: true, index: true },
  edition: { type: String, required: true, index: true },
  content: { type: String, required: true },
  rawBlobVerses: { type: String },
  processedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'tafsir_verses'
});
tafsirVerseSchema.index({ surah: 1, verse: 1, edition: 1 }, { unique: true });
const TafsirVerse = mongoose.models['TafsirVerse'] || mongoose.model('TafsirVerse', tafsirVerseSchema);

const QURANCDN_BASE = 'https://api.qurancdn.com/api/qdc/tafsirs/en-tafisr-ibn-kathir';
const EDITION = 'ibn-kathir';
const RATE_LIMIT_MS = 600;

const SURAH_VERSE_COUNTS: number[] = [
  7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,
  135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,
  54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,
  11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,
  22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,
  5,4,5,6
];

interface BlobGroup {
  blobHash: string;
  html: string;
  verses: { surah: number; verse: number; verseKey: string }[];
  allVerseKeys: string[];
}

const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

async function connectDb() {
  const uri = process.env['MONGODB_URI'] ||
    'mongodb+srv://isse304:ExrjEBm54q0yJWKQ@nura.inxyo.mongodb.net/?retryWrites=true&w=majority&appName=Nura';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
  console.log('Connected to MongoDB');
}

function stripHtml(html: string): string {
  return html
    .replace(/<h2>/g, '\n\n## ')
    .replace(/<\/h2>/g, '\n')
    .replace(/<p>/g, '\n')
    .replace(/<\/p>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

async function fetchVerseTexts(verseKeys: string[]): Promise<Record<string, string>> {
  const texts: Record<string, string> = {};
  for (const key of verseKeys) {
    try {
      const [s, v] = key.split(':');
      const res = await axios.get(`https://api.quran.com/api/v4/quran/verses/uthmani?verse_key=${key}`, {
        timeout: 10000, headers: { 'User-Agent': 'NuraApp/1.0' }
      });
      const verse = res.data?.verses?.[0];
      if (verse?.text_uthmani) {
        texts[key] = verse.text_uthmani;
      }
      await sleep(200);
    } catch {
      texts[key] = '';
    }
  }
  return texts;
}

async function splitBlobWithGPT(plainText: string, verseKeys: string[], verseTexts: Record<string, string>): Promise<Record<string, string>> {
  if (verseKeys.length === 1) {
    return { [verseKeys[0]]: plainText };
  }

  const verseReference = verseKeys.map(k => {
    const arabic = verseTexts[k] || '';
    return arabic ? `  ${k}: ${arabic}` : `  ${k}`;
  }).join('\n');

  const prompt = `You are a precise text segmentation tool. Below is a passage from Ibn Kathir's Tafsir that covers these Quran verses: ${verseKeys.join(', ')}.

ACTUAL QURAN VERSE TEXT (use this to match tafsir sections to the correct verse):
${verseReference}

Your task: Split the PASSAGE below so each verse gets ONLY the commentary that belongs to it. Return a JSON object where keys are verse references (like "4:2") and values are the extracted text for that verse.

CRITICAL: Use the Arabic verse text above to identify which parts of the tafsir discuss which verse. Ibn Kathir typically quotes the verse (or part of it) before discussing it. Match the Arabic quotations in the tafsir to the actual verse texts listed above to assign content to the correct verse key.

Rules:
- Every verse in the list MUST appear as a key in your output, even if the passage has minimal or no dedicated commentary for it (use "" for empty).
- Do NOT add any commentary of your own. Only redistribute the existing text.
- Look for verse transitions: phrases like "Allah says," "Then Allah says," "And His saying," followed by Arabic quotations that match a verse above.
- Introductory material (surah intro, prostration rulings, etc.) that applies to the whole surah should go under the FIRST verse key.
- Keep the text intact - do not summarize, rewrite, or paraphrase.

PASSAGE:
${plainText}

Respond with ONLY a valid JSON object. No markdown fences, no explanation.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens: 16000,
    response_format: { type: 'json_object' }
  });

  const raw = response.choices[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const key of verseKeys) {
      if (!(key in parsed)) parsed[key] = '';
    }
    return parsed;
  } catch {
    console.error('Failed to parse GPT response, assigning full text to first verse');
    const fallback: Record<string, string> = {};
    for (const key of verseKeys) fallback[key] = '';
    fallback[verseKeys[0]] = plainText;
    return fallback;
  }
}

async function fetchBlobForVerse(surah: number, verse: number): Promise<{ html: string; verseKeys: string[]; requestedKey: string } | null> {
  const url = `${QURANCDN_BASE}/by_ayah/${surah}:${verse}`;
  const requestedKey = `${surah}:${verse}`;
  try {
    const res = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'NuraApp/1.0' } });
    if (!res.data?.tafsir?.text) return null;
    const verseKeys = res.data.tafsir.verses ? Object.keys(res.data.tafsir.verses) : [requestedKey];
    // API sometimes maps a verse to a blob whose verse keys don't include it
    // (e.g., 84:11 maps to the 84:1-84:10 blob). Include requested verse in the keys.
    if (!verseKeys.includes(requestedKey)) {
      verseKeys.push(requestedKey);
    }
    return { html: res.data.tafsir.text, verseKeys, requestedKey };
  } catch (err: any) {
    console.error(`  Failed to fetch ${surah}:${verse}: ${err.message}`);
    return null;
  }
}

async function processSurah(surah: number) {
  const totalVerses = SURAH_VERSE_COUNTS[surah - 1];
  console.log(`\n=== Surah ${surah} (${totalVerses} verses) ===`);

  const existingCount = await TafsirVerse.countDocuments({ surah, edition: EDITION });
  if (existingCount === totalVerses) {
    console.log(`  Already fully cached (${existingCount}/${totalVerses}). Skipping.`);
    return;
  }
  console.log(`  Cached: ${existingCount}/${totalVerses}. Processing missing verses...`);

  const blobGroups = new Map<string, BlobGroup>();
  const processedVerses = new Set<string>();

  const existing = await TafsirVerse.find({ surah, edition: EDITION }).select('verse');
  for (const doc of existing) {
    processedVerses.add(`${surah}:${doc.verse}`);
  }

  for (let v = 1; v <= totalVerses; v++) {
    const vKey = `${surah}:${v}`;
    if (processedVerses.has(vKey)) continue;

    const result = await fetchBlobForVerse(surah, v);
    if (!result) {
      console.log(`  No content for ${vKey}, saving empty.`);
      await TafsirVerse.findOneAndUpdate(
        { surah, verse: v, edition: EDITION },
        { content: '', rawBlobVerses: vKey, processedAt: new Date() },
        { upsert: true }
      );
      processedVerses.add(vKey);
      await sleep(RATE_LIMIT_MS);
      continue;
    }

    const hash = simpleHash(result.html);
    if (!blobGroups.has(hash)) {
      blobGroups.set(hash, {
        blobHash: hash,
        html: result.html,
        verses: [],
        allVerseKeys: [...result.verseKeys]
      });
    }

    const group = blobGroups.get(hash)!;
    // Merge any new verse keys the API returned for this blob
    for (const key of result.verseKeys) {
      if (!group.allVerseKeys.includes(key)) {
        group.allVerseKeys.push(key);
      }
    }

    if (!group.verses.find(x => x.surah === surah && x.verse === v)) {
      group.verses.push({ surah, verse: v, verseKey: vKey });
    }

    for (const key of result.verseKeys) {
      const [s, vStr] = key.split(':').map(Number);
      if (s === surah && !group.verses.find(x => x.surah === s && x.verse === vStr)) {
        group.verses.push({ surah: s, verse: vStr, verseKey: key });
      }
    }

    processedVerses.add(vKey);
    for (const key of result.verseKeys) processedVerses.add(key);

    await sleep(RATE_LIMIT_MS);
  }

  for (const [, group] of blobGroups) {
    const unprocessedVerses = group.verses.filter(v => {
      return !existing.find((e: any) => e.verse === v.verse);
    });
    if (unprocessedVerses.length === 0) continue;

    const verseKeys = group.allVerseKeys.sort((a, b) => {
      const [, va] = a.split(':').map(Number);
      const [, vb] = b.split(':').map(Number);
      return va - vb;
    });

    console.log(`  Splitting blob covering ${verseKeys.join(', ')} with GPT...`);
    console.log(`  Fetching actual verse texts for matching...`);
    const verseTexts = await fetchVerseTexts(verseKeys);
    const plainText = stripHtml(group.html);

    let splitResult: Record<string, string>;
    try {
      splitResult = await splitBlobWithGPT(plainText, verseKeys, verseTexts);
    } catch (err: any) {
      console.error(`  GPT split failed: ${err.message}. Assigning full text to first verse.`);
      splitResult = {};
      for (const k of verseKeys) splitResult[k] = '';
      splitResult[verseKeys[0]] = plainText;
    }

    const bulkOps: any[] = [];
    for (const [verseKey, content] of Object.entries(splitResult)) {
      const [s, v] = verseKey.split(':').map(Number);
      if (s !== surah) continue;

      bulkOps.push({
        updateOne: {
          filter: { surah: s, verse: v, edition: EDITION },
          update: {
            $set: {
              content: content.trim(),
              rawBlobVerses: verseKeys.join(','),
              processedAt: new Date()
            }
          },
          upsert: true
        }
      });
    }

    if (bulkOps.length > 0) {
      await TafsirVerse.bulkWrite(bulkOps);
      console.log(`  Saved ${bulkOps.length} verses from blob.`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== Ibn Kathir Tafsir Pre-processor ===');
  console.log(`Total surahs: ${SURAH_VERSE_COUNTS.length}`);
  console.log(`Total verses: ${SURAH_VERSE_COUNTS.reduce((a, b) => a + b, 0)}`);

  await connectDb();

  const startSurah = parseInt(process.argv[2] || '1', 10);
  const endSurah = parseInt(process.argv[3] || '114', 10);

  console.log(`Processing surahs ${startSurah} to ${endSurah}...`);

  for (let s = startSurah; s <= endSurah; s++) {
    await processSurah(s);
  }

  const totalCached = await TafsirVerse.countDocuments({ edition: EDITION });
  const totalExpected = SURAH_VERSE_COUNTS.reduce((a, b) => a + b, 0);
  console.log(`\n=== Done! Cached ${totalCached}/${totalExpected} verses ===`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
