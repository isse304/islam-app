import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, forkJoin, catchError, of, firstValueFrom, from } from 'rxjs';
import { OpenAI } from 'openai';
import { environment } from '../../environments/environment';
import { ApiService } from './api.service';

export interface QuranVerse {
  number: number;
  text: string;
  translation: string;
  transliteration: string;
  audio: string;
  words: Word[];
}

export interface Reciter {
  id: number;
  name: string;
  identifier: string;
  surahIdentifier: string;
  style?: string;
}

export interface Surah {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
}

export interface Juz {
  id: number;
  juzNumber: number;
  verseMapping: {
    startSurah: number;
    startAyah: number;
    endSurah: number;
    endAyah: number;
  };
}

interface QuranComResponse {
  verses: {
    text_uthmani: string;
    words: Array<{
      text_uthmani: string;
      translation: {
        text: string;
      };
      transliteration: {
        text: string;
      };
      audio_url: string;
      timestamp_from: number;
      timestamp_to: number;
    }>;
    audio: {
      segments: [number, number][];
    };
  }[];
}

interface AlQuranResponse {
  data: {
    ayahs: Array<{
      number: number;
      numberInSurah: number;
      text: string;
    }>;
  }[];
}

export interface WordDetails {
  text_uthmani: string;
  text_indopak: string;
  translation: { text: string };
  transliteration: { text: string };
  root: { text: string };
  lemma: { text: string };
  grammar: {
    tag: string;  // Grammar information
  };
}

// Add interface for word type
export interface Word {
  text: string;
  translation: string;
  audioUrl?: string;
  timestamp_from?: number;
  timestamp_to?: number;
}

interface SurahSuggestion {
  type: 'surah';
  number: number;
  name: string;
  translation: string;
}

interface VerseSuggestion {
  type: 'verse';
  surahNumber: string;
  verseNumber: string;
  text: string;
  translation: string;
  highlightedText: string;
}

type SearchSuggestion = SurahSuggestion | VerseSuggestion;

interface VerseSearchResult {
  surah: number;
  verse: number;
  text: string;
  translation: string;
  type: 'verse';
}

interface SurahSearchResult {
  name: string;
  translation: string;
  number: number;
  type: 'surah';
  text?: string;
}

type SearchResult = SurahSearchResult | VerseSearchResult;

interface VerseTimingsResponse {
  verse_timings: Array<{
    verse_number: number;
    timestamp_from: number;
    timestamp_to: number;
  }>;
}

export interface MushafPage {
  page: number;
  imageUrl: string;
  surah?: {
    number: number;
    name: string;
    englishName: string;
  };
}

interface QuranComVerse {
  id: number;
  verse_key: string;
  text_uthmani: string;
  verse_number: number;
  page_number: number;
  line_number: number;
}

interface QuranComPage {
  verses: QuranComVerse[];
  meta: {
    current_page: number;
  };
}

export interface MushafContent {
  showBismillah: boolean;
  lines: Array<{
    text: string;
    verseNumber?: number;
  }>;
  currentSurah?: number;
}

interface ChatHistory {
  surah: number;
  verse: number;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';  // Specify exact role types
    content: string;
  }>;
}

export interface SurahData {
  numberOfAyahs: number;
}

@Injectable({
  providedIn: 'root'
})
export class QuranService {
  private baseUrl = 'https://api.alquran.cloud/v1';
  private quranComUrl = 'https://api.quran.com/api/v4';
  private readonly CACHE_KEY = 'quran_cache';
  private cache: {
    verseSummaries: { [key: string]: string };
    tafsirExplanations: { [key: string]: string };
  } = {
    verseSummaries: {},
    tafsirExplanations: {}
  };
  
  readonly reciters = [
    { 
      id: 7, 
      name: 'Mishary Rashid Alafasy', 
      identifier: 'Alafasy_128kbps',
      surahIdentifier: 'mishaari_raashid_al_3afaasee',
      style: 'Murattal' 
    },
    { 
      id: 1, 
      name: 'Abdul Basit', 
      identifier: 'Abdul_Basit_Murattal_192kbps',
      surahIdentifier: 'abdul_basit_murattal',
      style: 'Murattal' 
    },
    { 
      id: 4, 
      name: 'Saad Al-Ghamdi', 
      identifier: 'Ghamadi_40kbps',
      surahIdentifier: 'sa3d_al-ghaamidi',
      style: 'Murattal' 
    },
    { 
      id: 2, 
      name: 'Al-Hudhaify', 
      identifier: 'Hudhaify_128kbps',
      surahIdentifier: 'hudhaify',
      style: 'Murattal' 
    }
  ];

  readonly translations = [
    { id: 131, name: 'Dr. Mustafa Khattab (English)', language: 'english' },
    { id: 20, name: 'Sahih International (English)', language: 'english' },
    { id: 95, name: 'Dr. Ghali (English)', language: 'english' },
    { id: 85, name: 'Abdullah Yusuf Ali (English)', language: 'english' },
    { id: 161, name: 'Junagarhi (Urdu)', language: 'urdu' },
    { id: 136, name: 'Muhammad Hamidullah (French)', language: 'french' },
    { id: 33, name: 'Indonesian Ministry of Religion (Indonesian)', language: 'indonesian' },
    { id: 77, name: 'Diyanet İşleri (Turkish)', language: 'turkish' }
  ];

  private _surahs: Surah[] = [];
  mushafImageUrl: any;

  get surahs(): Surah[] {
    return this._surahs;
  }

  private chatHistory: Map<string, ChatHistory> = new Map();

  constructor(private http: HttpClient, private apiService: ApiService) {
    this.getSurahList().subscribe(
      surahs => this._surahs = surahs
    );
    this.loadCache();
  }

  private loadCache() {
    try {
      const savedCache = localStorage.getItem(this.CACHE_KEY);
      if (savedCache) {
        this.cache = JSON.parse(savedCache);
      }
    } catch (error) {
      console.error('Error loading Quran cache:', error);
    }
  }

  private saveCache() {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(this.cache));
    } catch (error) {
      console.error('Error saving Quran cache:', error);
    }
  }

  getSurah(surahNumber: number, translationId: string = '131'): Observable<QuranVerse[]> {
    const quranComUrl = `${this.quranComUrl}/verses/by_chapter/${surahNumber}?language=en&words=true&word_fields=text_uthmani,translation,transliteration&translation_fields=text&translations=${translationId}&fields=text_uthmani,chapter_id,verse_number&per_page=300`;
    
    return this.http.get(quranComUrl).pipe(
      map((response: any) => {
        if (!response?.verses) {
          throw new Error('Invalid response format');
        }
        return response.verses.map((verse: any) => {
          if (!verse.translations?.[0]?.text) {
            console.error('Missing translation for verse:', verse.verse_number);
          }
          return {
            number: verse.verse_number,
            text: verse.text_uthmani,
            translation: verse.translations?.[0]?.text?.replace(/<[^>]*>.*?<\/[^>]*>/g, '') || 'Translation not available',
            transliteration: verse.words?.map((word: any) => word.transliteration?.text || '').join(' ') || '',
            audio: this.getVerseAudioUrl(7, `${surahNumber}:${verse.verse_number}`),
            words: verse.words?.map((word: any) => ({
              text: word.text_uthmani || '',
              translation: word.translation?.text || '',
              transliteration: word.transliteration?.text || ''
            })) || []
          };
        });
      }),
      catchError(error => {
        console.error('Error fetching surah:', error);
        throw error;
      })
    );
  }

  getVerse(surahNumber: number, verseNumber: number): Observable<QuranVerse> {
    return this.http.get(`${this.baseUrl}/ayah/${surahNumber}:${verseNumber}/editions/quran-uthmani,en.asad`).pipe(
      map((response: any) => {
        const [arabic, translation] = response.data;
        return {
          number: arabic.numberInSurah,
          text: arabic.text,
          translation: translation.text.replace(/<[^>]*>.*?<\/[^>]*>/g, ''), // Remove HTML tags and content
          transliteration: arabic.text, // Keep original Arabic for transliteration
          audio: this.getVerseAudioUrl(7, `${surahNumber}:${verseNumber}`),
          words: arabic.text.split(' ').map((word: string) => ({
            text: word,
            translation: ''
          }))
        };
      })
    );
  }

  getTafsir(surahNumber: number, verseNumber: number, tafsirId: string = 'en.tafsir-ibn-kathir'): Observable<any> {
    // Use QuranCDN API for English tafsir
    if (tafsirId.startsWith('en.')) {
      const url = `https://api.qurancdn.com/api/qdc/tafsirs/en-tafisr-ibn-kathir/by_ayah/${surahNumber}:${verseNumber}`;
      
      return this.http.get(url).pipe(
        map((response: any) => {
          if (!response?.tafsir?.text) {
            throw new Error('Tafsir structure not found in response');
          }
          
          // Clean up the HTML and format the text
          const cleanText = response.tafsir.text
            .replace(/<h2>/g, '\n\n') // Add newlines before headers
            .replace(/<\/h2>/g, '\n') // Add newline after headers
            .replace(/<p>/g, '\n') // Add newline for paragraphs
            .replace(/<\/p>/g, '') // Remove closing paragraph tags
            .replace(/<[^>]+>/g, '') // Remove any remaining HTML tags
            .replace(/\n\s*\n/g, '\n\n') // Remove extra blank lines
            .trim(); // Remove extra whitespace
          
          return {
            text: cleanText
          };
        }),
        catchError(error => {
          console.error('English Tafsir error:', error);
          return of({ text: 'English Tafsir not available' });
        })
      );
    }
    
    // Determine which tafsir ID to use based on language
    const tafsirEndpoint = tafsirId.startsWith('en.') 
      ? 'en-tafisr-ibn-kathir'  // English Ibn Kathir
      : 'ar-tafsir-ibn-kathir'; // Arabic Ibn Kathir

    const url = `https://api.qurancdn.com/api/qdc/tafsirs/${tafsirEndpoint}/by_ayah/${surahNumber}:${verseNumber}`;
    console.log('Fetching tafsir from:', url);
    
    return this.http.get(url).pipe(
      map((response: any) => {
        console.log('Raw Tafsir response:', response);
        if (!response?.tafsir?.text) {
          throw new Error('Tafsir structure not found in response');
        }
        
        // Clean up the HTML and format the text
        const cleanText = response.tafsir.text
          .replace(/<h2>/g, '\n\n') // Add newlines before headers
          .replace(/<\/h2>/g, '\n') // Add newline after headers
          .replace(/<p>/g, '\n') // Add newline for paragraphs
          .replace(/<\/p>/g, '') // Remove closing paragraph tags
          .replace(/<[^>]+>/g, '') // Remove any remaining HTML tags
          .replace(/\n\s*\n/g, '\n\n') // Remove extra blank lines
          .trim(); // Remove extra whitespace
        
        return {
          text: cleanText
        };
      }),
      catchError(error => {
        console.error('Tafsir error:', error);
        return of({ text: `${tafsirId.startsWith('en.') ? 'English' : 'Arabic'} Tafsir not available` });
      })
    );
  }

  getVerseAudioUrl(reciterId: string | number, verseKey: string): string {
    try {
      // Get reciter information
      const reciter = typeof reciterId === 'number' 
        ? this.reciters.find(r => r.id === reciterId)
        : this.reciters.find(r => r.identifier === reciterId);
        
      let reciterIdentifier: string;
      
      if (!reciter) {
        console.warn(`Reciter with ID ${reciterId} not found, using default (Alafasy)`);
        reciterIdentifier = 'Alafasy_128kbps';
      } else {
        reciterIdentifier = reciter.identifier || 'Alafasy_128kbps';
      }
      
      // Format surah and verse for the URL
      const [surah, verse] = verseKey.split(':').map(part => part.trim());
      const formattedSurah = surah.padStart(3, '0');
      const formattedVerse = verse.padStart(3, '0');
      
      // Validate the URL by checking if the surah and verse are valid numbers
      const surahNum = parseInt(surah, 10);
      const verseNum = parseInt(verse, 10);
      
      if (isNaN(surahNum) || isNaN(verseNum) || surahNum < 1 || surahNum > 114 || verseNum < 1) {
        console.warn(`Invalid verse key: ${verseKey}`);
        return '';
      }
      
      // Get audio URL using a reliable source
      let audioUrl = `https://everyayah.com/data/${reciterIdentifier}/${formattedSurah}${formattedVerse}.mp3`;
      
      // Log the generated URL for debugging
      console.log(`Generated verse audio URL: ${audioUrl} for reciter ${reciterIdentifier}`);
      
      return audioUrl;
    } catch (error) {
      console.error('Error generating verse audio URL:', error);
      // Default fallback
      return '';
    }
  }

  getSurahAudioUrl(surahNumber: number, reciterId: number): string {
    // Find reciter by ID
    const reciter = this.reciters.find(r => r.id === reciterId);
    
    if (!reciter) {
      console.warn(`Reciter with ID ${reciterId} not found, using default`);
      // Default to Alafasy
      return this.getSurahAudioUrl(surahNumber, 7);
    }
    
    // Format surah number for URL
    const formattedSurah = surahNumber.toString().padStart(3, '0');
    
    // Validate surah number
    if (surahNumber < 1 || surahNumber > 114) {
      console.warn(`Invalid surah number: ${surahNumber}`);
      return '';
    }
    
    try {
      // Reliable URL patterns for popular reciters
      // Each reciter's server has been verified for reliability
      switch (reciter.id) {
        case 1: // Abdul Basit
          return `https://server7.mp3quran.net/basit/${formattedSurah}.mp3`;
        
        case 2: // Al-Hudhaify
          return `https://server13.mp3quran.net/hutha/${formattedSurah}.mp3`;
        
        case 3: // Al-Minshawi
          return `https://server8.mp3quran.net/minsh/${formattedSurah}.mp3`;
        
        case 4: // Saad Al-Ghamdi
          return `https://server8.mp3quran.net/ghamdi/${formattedSurah}.mp3`;
        
        case 5: // As-Sudais
          return `https://server11.mp3quran.net/sds/${formattedSurah}.mp3`;
        
        case 6: // Al-Ajmi
          return `https://server11.mp3quran.net/ajm/${formattedSurah}.mp3`;
        
        case 7: // Mishary Rashid Alafasy
          return `https://server8.mp3quran.net/afs/${formattedSurah}.mp3`;
        
        case 8: // Maher Al-Muaiqly
          return `https://server12.mp3quran.net/maher/${formattedSurah}.mp3`;
        
        case 9: // Ahmed Al-Ajmi
          return `https://server11.mp3quran.net/ahmad_huth/${formattedSurah}.mp3`;
        
        case 10: // Muhammad Siddiq Al-Minshawi
          return `https://server10.mp3quran.net/minsh/${formattedSurah}.mp3`;
        
        default:
          // Fallback to Alafasy as the most reliable source
          console.log(`Using default reciter for ID: ${reciter.id}`);
          return `https://server8.mp3quran.net/afs/${formattedSurah}.mp3`;
      }
    } catch (error) {
      console.error(`Error generating URL for reciter ${reciterId}:`, error);
      // Fallback to a reliable source
      return `https://server8.mp3quran.net/afs/${formattedSurah}.mp3`;
    }
  }

  // Optional: If you want to fetch actual word-by-word translations later
  getWordByWordTranslation(surahNumber: number, ayahNumber: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/ayah/${surahNumber}:${ayahNumber}/en.word`);
  }

  getTranslations(): Observable<any> {
    return this.http.get(`${this.quranComUrl}/resources/translations`);
  }

  getWordDetails(wordId: number): Observable<WordDetails> {
    return this.http.get<WordDetails>(`${this.quranComUrl}/words/${wordId}?fields=text_uthmani,text_indopak,translation,transliteration,root,lemma,grammar`);
  }

  searchQuran(query: string): Observable<any> {
    if (!query.trim()) {
      return of({ suggestions: [] });
    }

    const searchTerm = query.toLowerCase();
    
    // Surah suggestions
    const surahSuggestions = this.surahs
      .filter(surah => 
        surah.englishName.toLowerCase().includes(searchTerm) ||
        surah.englishNameTranslation.toLowerCase().includes(searchTerm)
      )
      .slice(0, 3)
      .map(surah => ({
        type: 'surah',
        name: surah.englishName,
        translation: surah.englishNameTranslation,
        number: surah.number
      }));

    if (searchTerm.length >= 3) {
      return this.http.get(`${this.quranComUrl}/search?q=${searchTerm}&size=20&page=1`).pipe(
        map((response: any) => ({
          suggestions: [
            ...surahSuggestions,
            ...(response.search?.results || []).map((result: any) => ({
              type: 'verse',
              surahNumber: result.verse_key.split(':')[0],
              verseNumber: result.verse_key.split(':')[1],
              text: result.text,
              translation: result.translations[0]?.text
                .replace(/<\/?em>/g, '')
                .replace(/\s+/g, ' ')
                .trim(),
              highlightedText: result.highlighted 
                ? result.highlighted
                    .replace(/<em>/g, '<span class="bg-yellow-200">')
                    .replace(/<\/em>/g, '</span>')
                : result.text // fallback to regular text if highlighted is null
            }))
          ]
        }))
      );
    }

    return of({ suggestions: surahSuggestions });
  }

  private searchVerses(query: string): Observable<VerseSearchResult[]> {
    return this.http.get<any>(
      `${this.quranComUrl}/verses/by_key?language=en&words=false&translations=131&per_page=10&q=${encodeURIComponent(query)}`
    ).pipe(
      map(response => 
        (response.verses || []).map((verse: any) => ({
          surah: parseInt(verse.verse_key.split(':')[0]),
          verse: parseInt(verse.verse_key.split(':')[1]),
          text: verse.text_uthmani,
          translation: verse.translations[0]?.text.replace(/<[^>]*>/g, '') || '',
          type: 'verse' as const
        }))
      ),
      catchError(error => {
        console.error('Search error:', error);
        return of([]);
      })
    );
  }

  getJuzList(): Observable<Juz[]> {
    return this.http.get<{juzs: Juz[]}>(`${this.quranComUrl}/juzs`).pipe(
      map(response => response.juzs)
    );
  }

  getJuzVerses(juzNumber: number): Observable<QuranVerse[]> {
    return this.http.get<any>(`${this.quranComUrl}/verses/by_juz/${juzNumber}?words=true&word_fields=text_uthmani,translation,audio_url&audio=1`).pipe(
      map(response => response.verses.map((verse: any) => ({
        number: verse.verse_number,
        text: verse.text_uthmani,
        translation: verse.translations?.[0]?.text || '',
        transliteration: '',
        audio: this.getVerseAudioUrl(7, verse.verse_key),
        words: verse.words?.map((word: any) => ({
          text: word.text_uthmani,
          translation: word.translation.text
        }))
      })))
    );
  }

  getSurahList(): Observable<Surah[]> {
    return this.http.get<{chapters: any[]}>(`${this.quranComUrl}/chapters`).pipe(
      map(response => response.chapters.map(chapter => ({
        number: chapter.id,
        name: chapter.name_arabic,
        englishName: chapter.name_simple,
        englishNameTranslation: chapter.translated_name.name,
        numberOfAyahs: chapter.verses_count
      })))
    );
  }

  loadSurah(surahNumber: number): Observable<QuranVerse[]> {
    return this.http.get<any>(
      `${this.quranComUrl}/verses/by_chapter/${surahNumber}?language=en&words=true&translations=131&fields=text_uthmani,chapter_id,verse_number,verse_key`
    ).pipe(
      map(response => response.verses.map((verse: any) => ({
        number: verse.verse_number,
        text: verse.text_uthmani,
        translation: verse.translations[0]?.text || '',
        transliteration: '',
        audio: this.getVerseAudioUrl(7, verse.verse_key),
        words: verse.words?.map((word: any) => ({
          text: word.text_uthmani,
          translation: word.translation.text
        }))
      })))
    );
  }

  getSurahs(): Observable<Surah[]> {
    return this.http.get<{chapters: any[]}>(`${this.quranComUrl}/chapters`).pipe(
      map(response => response.chapters.map(chapter => ({
        number: chapter.id,
        name: chapter.name_arabic,
        englishName: chapter.name_simple,
        englishNameTranslation: chapter.translated_name.name,
        numberOfAyahs: chapter.verses_count
      })))
    );
  }

  getVerseTimings(surahNumber: number): Observable<Array<{
    verse_number: number;
    timestamp_from: number;
    timestamp_to: number;
  }>> {
    return this.http.get<any>(
      `${this.quranComUrl}/verses/by_chapter/${surahNumber}?audio=1`
    ).pipe(
      map(response => response.verses.map((verse: any) => ({
        verse_number: verse.verse_number,
        timestamp_from: verse.audio?.segments?.[0]?.[0] || 0,
        timestamp_to: verse.audio?.segments?.[0]?.[1] || 0
      }))),
      catchError(error => {
        console.error('Error fetching verse timings:', error);
        return of([]);
      })
    );
  }

  getMushafPages(): Observable<MushafPage[]> {
    return this.http.get<any>(`${this.quranComUrl}/pages`).pipe(
      map(response => response.pages.map((page: any) => ({
        page: page.page_number as number,
        imageUrl: `${this.quranComUrl}/images/${page.page_number}`,
        surah: page.surah && {
          number: page.surah.number,
          name: page.surah.name,
          englishName: page.surah.englishName
        }
      })))
    );
  }

  getSurahMushaf(surahNumber: number): Observable<MushafPage[]> {
    const url = `${this.quranComUrl}/verses/by_chapter/${surahNumber}?fields=text_uthmani,page_number`;
    
    return this.http.get<{verses: {page_number: number}[]}>(url).pipe(
      map(response => {
        if (!response.verses) return [];
        
        const pages = new Set(response.verses.map(v => v.page_number));
        return Array.from(pages).map(pageNum => ({
          page: pageNum,
          imageUrl: `${this.quranComUrl}/images/${pageNum}`,
          surah: {
            number: surahNumber,
            name: this.surahs[surahNumber - 1]?.name || '',
            englishName: this.surahs[surahNumber - 1]?.englishName || ''
          }
        }));
      })
    );
  }

  getMushafPage(page: number): Observable<MushafPage> {
    const formattedPage = page.toString().padStart(3, '0');
    const imageUrl = `${this.mushafImageUrl}/madani-${formattedPage}.png`;
  
    return this.http.get(`${this.baseUrl}/verses/by_page/${page}`).pipe(
      map((response: any) => {
        // Retrieve Surah details from the first verse on the page
        const firstVerse = response.verses?.[0];
        return {
          page,
          imageUrl,
          surah: firstVerse?.chapter
            ? {
                number: firstVerse.chapter.id,
                name: firstVerse.chapter.name_arabic,
                englishName: firstVerse.chapter.name_simple
              }
            : undefined
        };
      }),
      catchError((error) => {
        console.error('❌ Error fetching Mushaf page:', error);
        return of({ page, imageUrl, surah: undefined });
      })
    );
  }
  

  getTafsirExplanation(
    surah: number, 
    verse: number, 
    question: string, 
    tafsirSource: string
  ): Observable<string> {
    const cacheKey = `${surah}:${verse}:${question}`;
    
    // Check cache first
    if (this.cache.tafsirExplanations[cacheKey]) {
      return of(this.cache.tafsirExplanations[cacheKey]);
    }

    return from((async () => {
      const verseData = await firstValueFrom(this.getVerse(surah, verse));
      
      const prompt = {
        systemMessage: "You are a knowledgeable Islamic scholar specializing in tafsir.",
        userMessage: `Question about Surah ${surah}, Verse ${verse}: ${question}\n
                    Verse Text: ${verseData?.text || 'Not available'}\n
                    Translation: ${verseData?.translation || 'Not available'}`,
        temperature: 0,
        maxTokens: 1000
      };

      const response = await firstValueFrom(this.apiService.generateAIResponse(prompt));
      const explanation = response.content || 'No explanation available';
      
      // Cache the result
      this.cache.tafsirExplanations[cacheKey] = explanation;
      this.saveCache();
      
      return explanation;
    })());
  }

  getVerseCount(surahNumber: number): Observable<SurahData> {
    return this.http.get<any>(`${this.quranComUrl}/chapters/${surahNumber}`).pipe(
      map(response => ({
        numberOfAyahs: response.chapter.verses_count
      }))
    );
  }
  getVerseSummary(surah: number, verse: number): Observable<string> {
    const cacheKey = `${surah}:${verse}`;
    
    // Check cache first
    if (this.cache.verseSummaries[cacheKey]) {
      return of(this.cache.verseSummaries[cacheKey]);
    }

    return from((async () => {
      const verseData = await firstValueFrom(this.getVerse(surah, verse));
      const prompt = {
        systemMessage: "Provide a bulleted, clear summary of this Quranic verse.",
        userMessage: `Summarize this verse:\n${verseData?.text}\nTranslation: ${verseData?.translation}`,
        temperature: 0,
        maxTokens: 200
      };
      
      const response = await firstValueFrom(this.apiService.generateAIResponse(prompt));
      const summary = response.content || 'No summary available';
      
      // Cache the result
      this.cache.verseSummaries[cacheKey] = summary;
      this.saveCache();
      
      return summary;
    })());
  }

  getPageBySurah(surah: number, verse: number = 1): Observable<any> {
    return this.http.get(`${this.quranComUrl}/verses/by_key/${surah}:${verse}`);
  }
}