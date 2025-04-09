import { Injectable, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, forkJoin, catchError, of, firstValueFrom, from, mergeMap, retry, throwError, BehaviorSubject, filter, take, tap } from 'rxjs';
import { OpenAI } from 'openai';
import { environment } from '../../environments/environment';
import { ApiService } from './api.service';
import { FirebaseAuthService } from './firebase-auth.service';

export interface QuranVerse {
  number: number;
  text: string;
  translation: string;
  transliteration: string;
  audio: string;
  words: Word[];
}

export interface AIResponse {
  response: string;
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

// Add missing interface definition
export interface TranslationMeta {
  id: number;
  name: string;
  author: string;
  language: string;
}

// Interface for the expected backend /api/tafsir/chat response
export interface TafsirChatResponse {
  success: boolean;
  content?: string;
  error?: string;
  source?: string;
  sources?: any[]; 
}

export interface SurahData {
  numberOfAyahs: number;
}

@Injectable({
  providedIn: 'root'
})
export class QuranService {
  // Update base URLs to use environment configuration
  private baseUrl = `${environment.apiUrl}/api/alquran`;
  private quranComUrl = `${environment.apiUrl}/api/quran`;
  private readonly CACHE_KEY = 'quran_cache';
  private readonly SURAH_CACHE_KEY = 'surah_cache';
  private selectedTafsir: 'ibn-kathir' | 'tabari' = 'ibn-kathir';
  private cache: {
    // verseSummaries: { [key: string]: string };  // Commented out for future AI feature
    tafsirExplanations: { [key: string]: string };
    surahs: { [key: string]: QuranVerse[] };
  } = this.initializeCache();

  // Use BehaviorSubject for surah list
  private _surahs$ = new BehaviorSubject<Surah[]>([]);
  // Public observable, filters out the initial empty array
  surahs$ = this._surahs$.asObservable().pipe(filter(list => list.length > 0));

  // Keep getter for synchronous access where appropriate (e.g., templates if needed AFTER load)
  // Note: Accessing this before data is loaded will return empty array.
  get surahs(): Surah[] {
    return this._surahs$.getValue();
  }

  mushafImageUrl: any;

  // Lazy inject ApiService using Injector
  private _apiService: ApiService | null = null;

  constructor(
    private http: HttpClient,
    private authService: FirebaseAuthService,
    private injector: Injector // Inject Injector
  ) {
    // Fetch surah list and push to BehaviorSubject
    this.getSurahList().pipe(
      retry(3), // Add retry logic
      catchError(error => {
        console.error("Failed to load initial surah list:", error);
        return of([]); // Return empty array on error
      })
    ).subscribe(
      surahs => this._surahs$.next(surahs)
    );
  }

  // Getter to resolve ApiService when needed
  private get apiService(): ApiService {
    if (!this._apiService) {
      // Dynamically get ApiService instance from the injector
      this._apiService = this.injector.get(ApiService);
    }
    return this._apiService;
  }

  private initializeCache() {
    const defaultCache = {
      // verseSummaries: {},  // Commented out for future AI feature
      tafsirExplanations: {},
      surahs: {}
    };

    try {
      const savedCache = localStorage.getItem(this.CACHE_KEY);
      if (!savedCache) return defaultCache;

      const parsedCache = JSON.parse(savedCache);
      return {
        // verseSummaries: parsedCache.verseSummaries || {},  // Commented out for future AI feature
        tafsirExplanations: parsedCache.tafsirExplanations || {},
        surahs: parsedCache.surahs || {}
      };
    } catch (error) {
      // console.error('Error reading Quran cache:', error);
      return defaultCache;
    }
  }

  readonly reciters = [
    { id: 1, name: 'Mishary Alafasy', identifier: 'ar.alafasy', surahIdentifier: 'ar.alafasy', style: 'Murattal' },
    { id: 2, name: 'Abdul Basit', identifier: 'ar.abdulbasitmurattal', surahIdentifier: 'ar.abdulbasitmurattal', style: 'Murattal' },
    { id: 3, name: 'Saood Shuraim', identifier: 'ar.saoodshuraym', surahIdentifier: 'ar.saudalshuraim', style: 'Murattal' }
  ];

  readonly translations = [
    { id: 131, name: 'Dr. Mustafa Khattab (English)', language: 'english', author: 'Dr. Mustafa Khattab' },
    { id: 20, name: 'Sahih International (English)', language: 'english', author: 'Sahih International' },
    { id: 95, name: 'Dr. Ghali (English)', language: 'english', author: 'Dr. Muhammad Mahmud Ghali' },
    { id: 85, name: 'Abdullah Yusuf Ali (English)', language: 'english', author: 'Abdullah Yusuf Ali' },
    { id: 161, name: 'Junagarhi (Urdu)', language: 'urdu', author: 'Muhammad Junagarhi' },
    { id: 136, name: 'Muhammad Hamidullah (French)', language: 'french', author: 'Muhammad Hamidullah' },
    { id: 33, name: 'Indonesian Ministry of Religion (Indonesian)', language: 'indonesian', author: 'Indonesian Ministry of Religion' },
    { id: 77, name: 'Diyanet İşleri (Turkish)', language: 'turkish', author: 'Diyanet İşleri Başkanlığı' }
  ];

  private saveCache() {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(this.cache));
    } catch (error) {
      console.error('Error saving Quran cache:', error);
    }
  }

  getSurah(surahNumber: number, translationId: string = '131', reciterId: number = 1): Observable<QuranVerse[]> {
    // Check cache first
    const cacheKey = `${surahNumber}_${translationId}`;
    if (this.cache.surahs[cacheKey]) {
      // console.log('Returning cached surah data for:', cacheKey);
      return of(this.cache.surahs[cacheKey]);
    }

    // Ensure the translationId is a string
    const safeTranslationId = String(translationId);
    // console.log(`QuranService: Getting surah ${surahNumber} with translation ID: "${safeTranslationId}" and reciter ID: ${reciterId}`);
    
    const quranComUrl = `${this.quranComUrl}/verses/by_chapter/${surahNumber}?language=en&words=true&word_fields=text_uthmani,translation,transliteration&translation_fields=text&translations=${safeTranslationId}&fields=text_uthmani,chapter_id,verse_number&per_page=300`;
    
    return this.http.get(quranComUrl).pipe(
      map((response: any) => {
        if (!response?.verses) {
          console.error('QuranService: Invalid response format - missing verses property');
          throw new Error('Invalid response format');
        }
        
        const verses = response.verses.map((verse: any) => {
          const mappedVerse = {
            number: verse.verse_number,
            text: verse.text_uthmani,
            translation: verse.translations?.[0]?.text?.replace(/<[^>]*>.*?<\/[^>]*>/g, '') || 'Translation not available',
            transliteration: verse.words?.map((word: any) => word.transliteration?.text || '').join(' ') || '',
            audio: this.getVerseAudioUrl(reciterId, `${surahNumber}:${verse.verse_number}`),
            words: verse.words?.map((word: any) => ({
              text: word.text_uthmani || '',
              translation: word.translation?.text || '',
              transliteration: word.transliteration?.text || ''
            })) || []
          };
          return mappedVerse;
        });

        // Cache the result
        this.cache.surahs[cacheKey] = verses;
        this.saveCache();
        
        return verses;
      }),
      catchError(error => {
        console.error('QuranService: Error fetching surah:', error);
        // If we have cached data, return it as fallback
        if (this.cache.surahs[cacheKey]) {
          // console.log('Returning cached data as fallback after error');
          return of(this.cache.surahs[cacheKey]);
        }
        throw error;
      }),
      retry({
        count: 3,
        delay: 1000,
        resetOnSuccess: true
      })
    );
  }

  getVerse(surahNumber: number, verseNumber: number): Observable<QuranVerse> {
    const url = `https://api.qurancdn.com/api/qdc/verses/by_key/${surahNumber}:${verseNumber}?words=true&translation_fields=text&translations=131&fields=text_uthmani,chapter_id,verse_number,verse_key`;
    
    return this.http.get<any>(url).pipe(
      map(response => {
        if (!response?.verse) {
          throw new Error('Invalid verse response format');
        }
        
        const verse = response.verse;
        return {
          number: verse.verse_number,
          text: verse.text_uthmani,
          translation: verse.translations?.[0]?.text?.replace(/<[^>]*>.*?<\/[^>]*>/g, '') || 'Translation not available',
          transliteration: verse.words?.map((word: any) => word.transliteration?.text || '').join(' ') || '',
          audio: this.getVerseAudioUrl(1, `${surahNumber}:${verseNumber}`),
          words: verse.words?.map((word: any) => ({
            text: word.text_uthmani || '',
            translation: word.translation?.text || '',
            transliteration: word.transliteration?.text || ''
          })) || []
        };
      }),
      catchError(error => {
        console.error('Error fetching verse:', error);
        throw error;
      }),
      retry({
        count: 3,
        delay: 1000,
        resetOnSuccess: true
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
    // console.log('Fetching tafsir from:', url);
    
    return this.http.get(url).pipe(
      map(response => {
        if (!response || !(response as any).tafsir?.text) {
          throw new Error('Tafsir not found');
        }
        return {
          text: (response as any).tafsir.text
            .replace(/<h2>/g, '\n\n')
            .replace(/<\/h2>/g, '\n')
            .replace(/<p>/g, '\n')
            .replace(/<\/p>/g, '')
            .replace(/<[^>]+>/g, '')
            .replace(/\n\s*\n/g, '\n\n')
            .trim()
        };
      }),
      catchError(error => {
        console.error('Tafsir error:', error);
        return of({ text: 'Tafsir not available' });
      })
    );
  }

  getVerseAudioUrl(reciterId: string | number, verseKey: string): string {
    try {
        // Ensure reciterId is a number for comparison
        const reciterIdNum = typeof reciterId === 'string' ? parseInt(reciterId, 10) : reciterId;
        
        // Get reciter information
        let reciter = this.reciters.find(r => r.id === reciterIdNum);
        
        if (!reciter) {
            console.warn(`Reciter not found: ${reciterId}, using default reciter (1)`);
            // Use default reciter (Mishary Alafasy)
            reciter = this.reciters[0];
        }

        // Format surah and verse for the URL
        const [surah, verse] = verseKey.split(':').map(part => part.trim());
        
        // Validate the numbers
        const surahNum = parseInt(surah, 10);
        const verseNum = parseInt(verse, 10);
        
        if (isNaN(surahNum) || isNaN(verseNum) || surahNum < 1 || surahNum > 114 || verseNum < 1) {
            console.error('Invalid surah or verse number:', { surah, verse });
            return '';
        }

        // Calculate global ayah number for the Islamic Network CDN
        const ayahNumber = this.calculateGlobalAyahNumber(surahNum, verseNum);
        
        // Get the correct bitrate for the reciter
        let bitrate = '128';
        switch (reciter.identifier) {
            case 'ar.abdulbasitmurattal':
                bitrate = '192';
                break;
            case 'ar.saoodshuraym':
                bitrate = '64';
                break;
            default:
                bitrate = '128';
        }
        
        // Use Islamic Network CDN with the correct bitrate
        return `https://cdn.islamic.network/quran/audio/${bitrate}/${reciter.identifier}/${ayahNumber}.mp3`;
    } catch (error) {
        console.error('Error generating verse audio URL:', error);
        // Return default reciter URL as fallback
        const defaultReciter = this.reciters[0];
        const [surah, verse] = verseKey.split(':');
        const ayahNumber = this.calculateGlobalAyahNumber(parseInt(surah, 10), parseInt(verse, 10));
        return `https://cdn.islamic.network/quran/audio/128/${defaultReciter.identifier}/${ayahNumber}.mp3`;
    }
  }

  getSurahAudioUrl(surahNumber: number, reciterId: number): string {
    try {
      // Find reciter by ID
      const reciter = this.reciters.find(r => r.id === reciterId);
      
      if (!reciter) {
        console.error('Reciter not found:', reciterId);
        return '';
      }
      
      // Validate surah number
      if (surahNumber < 1 || surahNumber > 114) {
        console.error('Invalid surah number:', surahNumber);
        return '';
      }
      
      // All reciters use 128 kbps for full surah playback
      const bitrate = '128';
      
      // For full surah, use surahIdentifier instead of identifier for Shuraim
      const identifier = reciter.id === 3 ? reciter.surahIdentifier : reciter.identifier;
      
      // Use Islamic Network CDN with the correct bitrate
      return `https://cdn.islamic.network/quran/audio-surah/${bitrate}/${identifier}/${surahNumber}.mp3`;
    } catch (error) {
      console.error('Error generating surah audio URL:', error);
      return '';
    }
  }

  // Optional: If you want to fetch actual word-by-word translations later
  getWordByWordTranslation(surahNumber: number, ayahNumber: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/ayah/${surahNumber}:${ayahNumber}/en.word`);
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

  // Modify getSurahList to return the observable that populates the subject
  getSurahList(): Observable<Surah[]> {
    // Check if already populated
    if (this._surahs$.getValue().length > 0) {
      return of(this._surahs$.getValue());
    }
    // Fetch from API
    return this.http.get<{chapters: any[]}>(`${this.quranComUrl}/chapters`).pipe(
      map(response => response.chapters.map(chapter => ({
        number: chapter.id,
        name: chapter.name_arabic,
        englishName: chapter.name_simple,
        englishNameTranslation: chapter.translated_name.name,
        numberOfAyahs: chapter.verses_count
      }))),
      tap(surahs => this._surahs$.next(surahs)), // Also push to subject here
      catchError(err => {
          console.error("API Error fetching surah list:", err);
          this._surahs$.error(err); // Propagate error through subject
          return throwError(() => new Error('Failed to fetch surah list from API'));
      })
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
    selectedTafsir: 'ibn-kathir' | 'tabari' = 'ibn-kathir',
    isFirstResponse: boolean = false
  ): Observable<string> {
    const cacheKey = `${surah}:${verse}:${question}:${selectedTafsir}`;
    
    // Check cache first
    if (this.cache.tafsirExplanations[cacheKey]) {
      return of(this.cache.tafsirExplanations[cacheKey]);
    }

    return from(this.apiService.generateTafsirResponse(surah, verse, question, selectedTafsir, isFirstResponse)).pipe(
      map(response => {
        const explanation = response.content || 'No explanation available';
        
        // Cache the result
        this.cache.tafsirExplanations[cacheKey] = explanation;
        this.saveCache();
        
        return explanation;
      })
    );
  }

  // Modify getVerseCount to use the BehaviorSubject
  getVerseCount(surahNumber: number): Observable<SurahData> {
    return this.surahs$.pipe( // Use the public observable
      filter(surahs => surahs.length > 0), // Wait for the list to be populated
      take(1), // Take the first non-empty list
      map(surahs => {
        // console.log(`[QuranService] getVerseCount - Searching for Surah: ${surahNumber} (Type: ${typeof surahNumber}) in list of length ${surahs.length}`);
        
        let foundSurah: Surah | undefined = undefined;
        for (const s of surahs) {
            // Detailed log for debugging comparison
            // if (Number(surahNumber) === 12) { // Only log extensively when searching for 12
            //      console.log(`[QuranService] Comparing Input ${surahNumber} with Surah #: ${s.number} (Type: ${typeof s.number}), Name: ${s.englishName}. Match: ${Number(s.number) === Number(surahNumber)}`);
            // }
            if (Number(s.number) === Number(surahNumber)) {
                foundSurah = s;
                break; // Stop searching once found
            }
        }

        if (foundSurah && typeof foundSurah.numberOfAyahs === 'number') {
          // console.log(`[QuranService] Found verse count for Surah ${surahNumber}:`, foundSurah.numberOfAyahs);
          return { numberOfAyahs: foundSurah.numberOfAyahs };
        } else {
          console.error(`[QuranService] Data for Surah ${surahNumber} not found after searching list (length: ${surahs.length}).`);
          // Log first few surah numbers from the list to see their format
          if(surahs.length > 5) {
            console.error(`[QuranService] First 5 surah numbers in list: ${surahs.slice(0,5).map(s => s.number).join(', ')}`);
          }
          throw new Error(`Data for Surah ${surahNumber} not found`);
        }
      }),
      catchError(error => {
          console.error(`[QuranService] Error in getVerseCount pipe for surah ${surahNumber}:`, error);
          return throwError(() => new Error(`Failed to get verse count for Surah ${surahNumber}`));
      })
    );
  }

  getPageBySurah(surah: number, verse: number = 1): Observable<any> {
    return this.http.get(`${this.quranComUrl}/verses/by_key/${surah}:${verse}`);
  }

  // Method to get all available reciters
  getReciters(): any[] {
    return this.reciters;
  }

  // Method to get all available translations
  getAvailableTranslations(): Observable<any[]> {
    // Use hardcoded translations as fallback in case the API endpoint fails
    const fallbackTranslations = [
      { id: '131', name: 'Sahih International', language: 'en' },
      { id: '20', name: 'Sahih Al-Bukhari', language: 'en' },
      { id: '149', name: 'Abdel Haleem', language: 'en' },
      { id: '85', name: 'Abdul Majid Daryabadi', language: 'en' },
      { id: '203', name: 'Dr. Mustafa Khattab', language: 'en' },
      { id: '207', name: 'Saheeh International', language: 'en' },
      { id: '84', name: 'Abdullah Yusuf Ali', language: 'en' },
      { id: '22', name: 'Dr. Ghali', language: 'en' },
      { id: '95', name: 'Muhammad Taqi-ud-Din al-Hilali and Muhammad Muhsin Khan', language: 'en' },
      { id: '57', name: 'Yusuf Ali', language: 'en' },
      { id: '17', name: 'Dr. T.B. Irving', language: 'en' }
    ];

    // Try to get translations from API, fall back to hardcoded list if it fails
    return this.http.get<any[]>(`${environment.apiUrl}/api/quran/translations`).pipe(
      catchError(error => {
        console.error('Error fetching translations:', error);
        return of(fallbackTranslations);
      })
    );
  }

  // Modify getSurahName to use the BehaviorSubject's current value
  getSurahName(surahNumber: number): string {
    if (surahNumber < 1 || surahNumber > 114) {
      return '';
    }
    // Use getValue() for synchronous access, assuming list is likely loaded by the time this is needed
    const surahs = this._surahs$.getValue();
    if (surahs.length === 0) {
        console.warn(`getSurahName called before surah list was loaded.`);
        return `Surah ${surahNumber}`; // Fallback name
    }
    const surah = surahs.find(s => s.number === surahNumber);
    return surah ? surah.name : `Surah ${surahNumber}`; // Fallback if somehow not found
  }

  // Add this helper method to calculate global ayah number
  private calculateGlobalAyahNumber(surah: number, ayah: number): number {
    // Verse counts for each surah (1-based indexing)
    const verseCounts = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];
    
    // Calculate the global ayah number
    let globalAyah = ayah;
    for (let i = 0; i < surah - 1; i++) {
      globalAyah += verseCounts[i];
    }
    
    return globalAyah;
  }

  setSelectedTafsir(tafsir: 'ibn-kathir' | 'tabari') {
    this.selectedTafsir = tafsir;
    // Clear the verse summaries cache when tafsir source changes
    this.cache.tafsirExplanations = {};
    this.saveCache();
  }

  getVerseSummary(surah: number, verse: number): Observable<AIResponse | string> {
    return this.getTafsirExplanation(surah, verse, 'Summarize this verse and explain its key points.', this.selectedTafsir, true);
  }

  clearCache() {
    this.cache = {
      tafsirExplanations: {},
      surahs: {}
    };
    this.saveCache();
    // console.log('QuranService cache cleared');
  }

  // Method to call the backend Tafsir Chat endpoint
  getChatResponse(payload: { 
    surah: number; 
    verse: number; 
    question: string; 
    selectedTafsir: string 
  }): Observable<TafsirChatResponse> { 
    const url = `/api/tafsir/chat`; // Use relative URL
    return this.http.post<TafsirChatResponse>(url, payload).pipe(
      catchError((error) => {
        console.error('Error calling /api/tafsir/chat:', error);
        // Return a fallback error response compatible with TafsirChatResponse interface
        return of({ 
          success: false, 
          error: 'Failed to communicate with the chat service.',
          content: '' // Ensure content is defined
        } as TafsirChatResponse);
      })
    );
  }

  // Modified getTranslations method to return hardcoded list
  getTranslations(): Observable<TranslationMeta[]> {
    // Return the hardcoded list defined in this service using RxJS 'of'
    return of(this.translations as TranslationMeta[]); // Add 'as TranslationMeta[]' to satisfy type checking
    // const url = 'assets/data/quran/translations.json'; // Adjust path if needed
    // return this.http.get<TranslationMeta[]>(url).pipe(
    //   tap(translations => (this as any).translations = translations) // Assuming 'translations' property exists
    // );
  }
}