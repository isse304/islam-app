import { initializeApp as initAdminApp, cert, getApps } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import axios from 'axios';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });

// Initialize Firebase Admin
if (getApps().length === 0) {
  const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG || '{}');
  initAdminApp({
    credential: cert({
      projectId: firebaseConfig.project_id,
      clientEmail: firebaseConfig.client_email,
      privateKey: firebaseConfig.private_key
    })
  });
}

const adminAuth = getAdminAuth();

// Initialize Firebase client (for token exchange)
const clientApp = initializeApp({
  apiKey: "AIzaSyDhBAdoRQx-vc6lz_5lrZgXVPWXEtam-PQ",
  authDomain: "nuraai.firebaseapp.com",
  projectId: "nuraai"
});
const clientAuth = getAuth(clientApp);

const BASE_URL = 'http://localhost:3000';
const TEST_UID = 'test-tafsir-chat-user';

const EDITIONS = [
  {
    key: 'ibn-kathir',
    name: 'Tafsir Ibn Kathir',
    scholarName: 'Ibn Kathir',
    surah: 2, verse: 255,
    question: 'Explain this verse'
  },
  {
    key: 'maarif-ul-quran',
    name: "Ma'arif al-Qur'an",
    scholarName: 'Mufti Muhammad Shafi',
    surah: 2, verse: 255,
    question: 'Explain this verse'
  },
  {
    key: 'tazkirul-quran',
    name: 'Tazkirul Quran',
    scholarName: 'Maulana Wahiduddin Khan',
    surah: 2, verse: 255,
    question: 'Explain this verse'
  }
];

async function resetFreeTier() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI not set');
  await mongoose.connect(mongoUri);
  await mongoose.connection.db.collection('userusages').updateOne(
    { userId: TEST_UID },
    { $set: { 'freeTierQuestions.count': 0, 'freeTierQuestions.lastRequest': new Date(0) } },
    { upsert: true }
  );
  console.log('🔄 Free tier counter reset');
  await mongoose.disconnect();
}

async function getToken() {
  console.log('🔐 Minting test token via Admin SDK...');
  const customToken = await adminAuth.createCustomToken(TEST_UID);
  const userCred = await signInWithCustomToken(clientAuth, customToken);
  const idToken = await userCred.user.getIdToken();
  console.log('✅ Authenticated\n');
  return idToken;
}

async function testEdition(edition, token) {
  const divider = '─'.repeat(60);
  console.log(divider);
  console.log(`📖 Testing: ${edition.name} (${edition.key})`);
  console.log(`   Verse: ${edition.surah}:${edition.verse}`);
  console.log(`   Question: "${edition.question}"`);
  console.log(divider);

  try {
    const start = Date.now();
    const response = await axios.post(
      `${BASE_URL}/api/tafsir/chat`,
      {
        surah: edition.surah,
        verse: edition.verse,
        question: edition.question,
        selectedTafsir: edition.key
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 60000
      }
    );
    const elapsed = Date.now() - start;

    const data = response.data;
    const content = data.content || '';
    const contentLower = content.toLowerCase();

    const mentionsScholar = contentLower.includes(edition.scholarName.toLowerCase())
      || contentLower.includes(edition.scholarName.split(' ').pop().toLowerCase());

    const wrongScholarMentioned = EDITIONS
      .filter(e => e.key !== edition.key)
      .find(e => contentLower.includes(`according to ${e.scholarName.toLowerCase()}`));

    const results = {
      success: data.success === true,
      hasContent: content.length > 50,
      contentLength: content.length,
      source: data.source || 'unknown',
      responseTime: `${elapsed}ms`,
      mentionsScholar,
      wrongScholar: wrongScholarMentioned?.scholarName || null,
      freeTierRemaining: data.freeTierRemaining
    };

    console.log('\n   Results:');
    console.log(`   ├─ Success:          ${results.success ? '✅' : '❌'} ${results.success}`);
    console.log(`   ├─ Has Content:      ${results.hasContent ? '✅' : '❌'} (${results.contentLength} chars)`);
    console.log(`   ├─ Source:           ${results.source}`);
    console.log(`   ├─ Response Time:    ${results.responseTime}`);
    console.log(`   ├─ Mentions Scholar: ${results.mentionsScholar ? '✅' : '⚠️ '} "${edition.scholarName}"`);
    console.log(`   ├─ No Wrong Scholar: ${results.wrongScholar ? '❌ mentions ' + results.wrongScholar : '✅'}`);
    if (results.freeTierRemaining !== undefined) {
      console.log(`   ├─ Free Tier Left:   ${results.freeTierRemaining}`);
    }

    console.log(`   └─ Preview:`);
    const preview = content.substring(0, 400).replace(/\n/g, '\n      ');
    console.log(`      ${preview}${content.length > 400 ? '...' : ''}`);

    const passed = results.success && results.hasContent && !results.wrongScholar;
    console.log(`\n   ${passed ? '✅ PASSED' : '❌ FAILED'}\n`);
    return { edition: edition.name, passed, results };

  } catch (error) {
    const errMsg = error.response?.data?.error || error.message;
    const status = error.response?.status || 'N/A';
    console.log(`\n   ❌ ERROR (HTTP ${status}): ${errMsg}`);
    if (error.response?.data) {
      const body = JSON.stringify(error.response.data, null, 2);
      console.log('   Server response:', body.substring(0, 500));
    }
    console.log(`\n   ❌ FAILED\n`);
    return { edition: edition.name, passed: false, error: errMsg };
  }
}

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║          AI Tafsir Chat — Multi-Edition Test            ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  let token;
  try {
    await resetFreeTier();
    token = await getToken();
  } catch (err) {
    console.error('❌ Failed to set up:', err.message);
    process.exit(1);
  }

  const results = [];
  for (const edition of EDITIONS) {
    const result = await testEdition(edition, token);
    results.push(result);
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                      Summary                           ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  results.forEach(r => {
    const icon = r.passed ? '✅' : '❌';
    const detail = r.error
      ? `Error: ${r.error}`
      : `${r.results?.contentLength || 0} chars, ${r.results?.responseTime || '?'}`;
    console.log(`  ${icon} ${r.edition.padEnd(25)} ${detail}`);
  });

  console.log(`\n  Result: ${passed}/${total} passed\n`);
  process.exit(passed === total ? 0 : 1);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
