import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, firstValueFrom, from, BehaviorSubject, switchMap, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import duasData from '../components/dua/duas.json';
import localforage from 'localforage';
import Fuse from 'fuse.js';
import { ApiService } from './api.service';
import { environment } from '../../environments/environment';
import { FirebaseAuthService } from './firebase-auth.service';
import duaInsightsData from '../../../server/data/dua-insights.json';
import emotionalDuasJson from '../../../server/data/emotional-duas.json';

export type DuaCategory = 'morning' | 'evening' | 'protection' | 'forgiveness' | 'anxiety' | 'general' | 'sleep' | 'travel' | 'eating' | 'hardship' | 'gratitude' | 'guidance' | 'sadness' | 'marriage';

export interface Dua {
  id: number;
  title: string;
  arabic: string;
  translation: string;
  transliteration: string;
  reference: string;
  category: DuaCategory;
  recitationCount: number;
  virtue?: string;
  time?: string;
  emotion?: string[];
  tags?: string[];
}

interface AIResponse {
  content: string;  // Make content required, not optional
  success?: boolean;
  error?: string;
  message?: string;
}

export interface DuaInsightsResponse {
  success: boolean;
  duaId: number;
  content: string;
  virtues: string;
  application: string;
  context: string;
  impact: string;
  explanation: string;
  historicalContext: string;
  reflectionPoints: string[];
  modernApplication: string;
  relatedVerses: string[];
  related?: string;
  spiritual_advice?: {
    understanding?: string;
    duas?: Array<{
      arabic: string;
      translation: string;
      reference: string;
      virtue: string;
    }>;
    dhikr?: Array<{
      phrase: string;
      translation: string;
      count: string;
      timing: string;
      benefit: string;
    }>;
    scholarly_guidance?: Array<{
      quote: string;
      scholar: string;
      source: string;
    }>;
    spiritual_remedies?: Array<{
      practice: string;
      method: string;
      benefit: string;
    }>;
  };
}

export interface StreamingResponse {
  status: 'processing' | 'streaming' | 'complete' | 'error';
  chunk?: string;
  partialResponse?: string;
  data?: DuaInsightsResponse;
  error?: string;
}

export type ResponseType = DuaInsightsResponse | StreamingResponse;

export interface EmotionalDuaResponse {
  success: boolean;
  content: string;
  quranic_guidance: string[];
  prophetic_example: string;
  practical_steps: string[];
  spiritual_advice: {
    understanding: string;
    duas: DuaItem[];
    dhikr: DhikrItem[];
    scholarly_guidance: ScholarlyGuidanceItem[];
    spiritual_remedies: SpiritualRemedyItem[];
  };
  related_verses_hadith: {
    verses: string[];
    hadith: string[];
  };
  reflection_points: string[];
  virtues: string;
  application: string;
  context: string;
  related: string;
  impact: string;
  explanation: string;
  modernApplication: string;
  error?: string;
  insights: string;
  relatedVerses: string[];
  historicalContext: string;
  reflectionPoints: string[];
}

interface DuaItem {
  arabic?: string;
  translation?: string;
  reference?: string;
  virtue?: string;
}

interface DhikrItem {
  phrase?: string;
  translation?: string;
  count?: string;
  timing?: string;
  benefit?: string;
}

interface ScholarlyGuidanceItem {
  quote: string;
  scholar: string;
  source?: string;
}

interface SpiritualRemedyItem {
  practice: string;
  method: string;
  benefit: string;
}

interface SpiritualAdvice {
  understanding?: string;
  duas?: DuaItem[];
  dhikr?: DhikrItem[];
  scholarly_guidance?: ScholarlyGuidanceItem[];
  spiritual_remedies?: SpiritualRemedyItem[];
}

interface EmotionalDuasData {
  emotions: {
    [key: string]: Array<{
      content: string;
      quranic_guidance: string[];
      prophetic_example: string;
      practical_steps: string[];
      spiritual_advice: {
        understanding: string;
        duas: Array<{
          arabic: string;
          translation: string;
          reference: string;
          virtue: string;
        }>;
        dhikr: Array<{
          phrase: string;
          translation: string;
          count: string;
          timing: string;
          benefit: string;
        }>;
        scholarly_guidance: Array<{
          quote: string;
          scholar: string;
          source: string;
        }>;
        spiritual_remedies: Array<{
          practice: string;
          method: string;
          benefit: string;
        }>;
      };
    }>;
  };
}

const emotionalDuas: EmotionalDuasData = emotionalDuasJson;

@Injectable({
  providedIn: 'root'
})
export class DuaService {
  private readonly FAVORITES_KEY = 'favoriteDuas';
  private readonly DUA_STORAGE_KEY = 'duas_data';
  private readonly AI_INSIGHTS_KEY = 'dua_ai_insights';
  private readonly CATEGORIES_KEY = 'dua_categories';
  private readonly EMOTIONAL_DUA_CACHE_KEY = 'emotional_dua_cache';
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private localDuas: { [key in DuaCategory]?: Dua[] } = {};
  private aiInsightsCache: { [key: string]: string } = {};
  private categoriesCache: { [key: string]: Dua[] } = {};
  private fuseSearch: Fuse<Dua>;
  private apiUrl = environment.apiUrl;
  private _isLoading = new BehaviorSubject<boolean>(false);
  isLoading$ = this._isLoading.asObservable();
  private insights: { [key: string]: DuaInsightsResponse } = {};
  private aiInsights: string = '';
  
  // Emotion synonyms mapping
  private emotionSynonyms = {
    'anxious': ['worried', 'nervous', 'stressed', 'uneasy', 'fearful', 'tense', 'restless', 'apprehensive', 'concerned'],
    'sad': ['depressed', 'unhappy', 'down', 'blue', 'sorrowful', 'heartbroken', 'grief', 'melancholy', 'gloomy'],
    'angry': ['frustrated', 'mad', 'annoyed', 'irritated', 'furious', 'upset', 'outraged', 'enraged', 'hostile'],
    'grateful': ['thankful', 'blessed', 'appreciative', 'content', 'satisfied', 'fulfilled', 'indebted', 'humbled'],
    'hopeful': ['optimistic', 'positive', 'confident', 'assured', 'encouraged', 'inspired', 'motivated', 'eager'],
    'scared': ['afraid', 'frightened', 'terrified', 'fearful', 'anxious', 'panicked', 'threatened', 'intimidated'],
    'guilty': ['remorseful', 'regretful', 'ashamed', 'sorry', 'repentant', 'apologetic', 'conscience-stricken'],
    'confused': ['uncertain', 'unsure', 'lost', 'perplexed', 'doubtful', 'bewildered', 'puzzled', 'disoriented'],
    'lonely': ['isolated', 'alone', 'abandoned', 'disconnected', 'solitary', 'neglected', 'rejected'],
    'peaceful': ['calm', 'serene', 'tranquil', 'relaxed', 'composed', 'at ease', 'content', 'harmonious'],
    'weak': ['powerless', 'helpless', 'vulnerable', 'fragile', 'feeble', 'exhausted', 'drained'],
    'seeking guidance': ['lost', 'searching', 'directionless', 'seeking help', 'need direction', 'confused'],
    'in pain': ['hurting', 'suffering', 'aching', 'distressed', 'troubled', 'tormented', 'afflicted'],
    'overwhelmed': ['stressed', 'burdened', 'overloaded', 'pressured', 'strained', 'swamped', 'exhausted'],
    'seeking protection': ['threatened', 'vulnerable', 'unsafe', 'insecure', 'exposed', 'endangered'],
    'seeking forgiveness': ['sorry', 'repentant', 'apologetic', 'remorseful', 'regretful', 'guilty']
  };

  private readonly duaMapping = {
    'Alhamdulillah': {
      arabic: 'الْحَمْدُ لِلَّهِ',
      translation: 'All praise is due to Allah',
      reference: 'Sahih Bukhari 6404',
      virtue: 'Fills the scales of good deeds and brings blessings'
    },
    'HasbunAllah': {
      arabic: 'حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ',
      translation: 'Allah is sufficient for us, and He is the best Disposer of affairs',
      reference: 'Quran 3:173',
      virtue: 'Increases trust in Allah and brings peace to the heart'
    },
    'Astaghfirullah': {
      arabic: 'أَسْتَغْفِرُ اللَّهَ',
      translation: 'I seek forgiveness from Allah',
      reference: 'Sahih Muslim 2702',
      virtue: 'Removes distress and brings relief'
    },
    'SubhanAllah': {
      arabic: 'سُبْحَانَ اللَّهِ',
      translation: 'Glory be to Allah',
      reference: 'Sahih Muslim 2691',
      virtue: 'Brings tranquility and peace to the heart'
    },
    'Rabbana atina': {
      arabic: 'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ',
      translation: 'Our Lord, give us in this world [that which is] good and in the Hereafter [that which is] good and protect us from the punishment of the Fire',
      reference: 'Quran 2:201',
      virtue: 'A comprehensive dua for goodness in both worlds'
    }
  };

  private readonly dhikrMapping = {
    'SubhanAllah': {
      phrase: 'سُبْحَانَ اللَّهِ',
      translation: 'Glory be to Allah',
      count: '33 times',
      timing: 'After each prayer',
      benefit: 'Purifies the heart and brings peace'
    },
    'Alhamdulillah': {
      phrase: 'الْحَمْدُ لِلَّهِ',
      translation: 'All praise is due to Allah',
      count: '33 times',
      timing: 'After each prayer',
      benefit: 'Increases gratitude and blessings'
    },
    'Allahu Akbar': {
      phrase: 'اللَّهُ أَكْبَرُ',
      translation: 'Allah is the Greatest',
      count: '34 times',
      timing: 'After each prayer',
      benefit: 'Strengthens faith and removes anxiety'
    },
    'La ilaha illa Allah': {
      phrase: 'لَا إِلَٰهَ إِلَّا اللَّهُ',
      translation: 'There is no deity worthy of worship except Allah',
      count: '100 times',
      timing: 'Morning and evening',
      benefit: 'The best form of remembrance that brings peace to the heart'
    },
    'Astaghfirullah': {
      phrase: 'أَسْتَغْفِرُ اللَّهَ',
      translation: 'I seek forgiveness from Allah',
      count: '100 times',
      timing: 'Morning and evening',
      benefit: 'Removes sins and brings relief from distress'
    }
  };

  private readonly scholarlyGuidance = [
    {
      quote: 'When relief comes after hardship, it is a sign of Allah\'s mercy and a reminder to be grateful.',
      scholar: 'Ibn Al-Qayyim',
      source: 'Madarij Al-Salikeen'
    },
    {
      quote: 'The heart finds rest in the remembrance of Allah, for truly in the remembrance of Allah do hearts find rest.',
      scholar: 'Imam Al-Ghazali',
      source: 'Ihya Ulum al-Din'
    },
    {
      quote: 'Gratitude is a means of increasing blessings, and patience during hardship is a means of relief.',
      scholar: 'Ibn Taymiyyah',
      source: 'Majmu al-Fatawa'
    }
  ];

  private readonly spiritualRemedies = [
    {
      practice: 'Regular Dhikr',
      method: 'Maintain consistent daily dhikr after prayers and during free time',
      benefit: 'Strengthens connection with Allah and brings peace to the heart'
    },
    {
      practice: 'Gratitude Journal',
      method: 'Write down three blessings daily and reflect on Allah\'s favors',
      benefit: 'Increases awareness of Allah\'s blessings and contentment'
    },
    {
      practice: 'Night Prayer (Tahajjud)',
      method: 'Wake up in the last third of the night for prayer and supplication',
      benefit: 'Special time for acceptance of duas and spiritual elevation'
    },
    {
      practice: 'Charity',
      method: 'Give regular charity, even if small, with sincere intention',
      benefit: 'Purifies wealth and heart, brings relief from anxiety'
    },
    {
      practice: 'Quran Recitation',
      method: 'Read and reflect on the Quran daily, even if just a few verses',
      benefit: 'Divine guidance and tranquility for the heart'
    }
  ];

  constructor(
    private http: HttpClient,
    private apiService: ApiService,
    private authService: FirebaseAuthService
  ) {
    this.localDuas = duasData as { [key in DuaCategory]: Dua[] };
    
    // Initialize Fuse.js with all duas from all categories
    const allDuas = Object.values(this.localDuas).flat();
    this.fuseSearch = new Fuse(allDuas, {
      keys: ['title', 'translation', 'transliteration', 'emotion'],
      threshold: 0.4,
      distance: 100,
      includeScore: true
    });

    this.initializeOfflineStorage();
    this.loadCaches();
  }

  private async loadCaches() {
    try {
      // Load AI insights cache
      const savedInsights = await localforage.getItem<string>(this.AI_INSIGHTS_KEY);
      if (savedInsights) {
        this.aiInsightsCache = JSON.parse(savedInsights);
      }

      // Load categories cache
      const savedCategories = await localforage.getItem<string>(this.CATEGORIES_KEY);
      if (savedCategories) {
        this.categoriesCache = JSON.parse(savedCategories);
      }
    } catch (error) {
      console.error('Error loading dua caches:', error);
    }
  }

  private async saveCaches() {
    try {
      await localforage.setItem(this.AI_INSIGHTS_KEY, JSON.stringify(this.aiInsightsCache));
      await localforage.setItem(this.CATEGORIES_KEY, JSON.stringify(this.categoriesCache));
    } catch (error) {
      console.error('Error saving dua caches:', error);
    }
  }

  async initializeOfflineStorage() {
    try {
      const storedDuas = await localforage.getItem(this.DUA_STORAGE_KEY);
      if (!storedDuas) {
        await localforage.setItem(this.DUA_STORAGE_KEY, this.localDuas);
      }
    } catch (error) {
      console.error('Error initializing offline storage:', error);
    }
  }

  async getDuasOffline(category: DuaCategory): Promise<Dua[]> {
    try {
      // Check categories cache first
      if (this.categoriesCache[category]) {
        return this.categoriesCache[category];
      }

      const allDuas = await localforage.getItem<{ [key in DuaCategory]?: Dua[] }>(this.DUA_STORAGE_KEY);
      const duas = allDuas?.[category] || [];
      
      // Cache the result
      this.categoriesCache[category] = duas;
      await this.saveCaches();
      
      return duas;
    } catch (error) {
      console.error('Error getting offline duas:', error);
      return [];
    }
  }

  private getUniqueDuas(duas: Dua[]): Dua[] {
    const uniqueDuas = new Map<string, Dua>();
    duas.forEach(dua => {
      // Create a key combining title and first part of arabic text to catch similar duas
      const key = `${dua.title.toLowerCase()}_${dua.arabic.slice(0, 50)}`;
      if (!uniqueDuas.has(key)) {
        uniqueDuas.set(key, dua);
      }
    });
    return Array.from(uniqueDuas.values());
  }

  getDuas(category: DuaCategory): Observable<Dua[]> {
    const duas = this.localDuas[category] || [];
    return of(this.getUniqueDuas(duas));
  }

  getAllCategories(): DuaCategory[] {
    return [
      'morning',
      'evening',
      'protection',
      'forgiveness',
      'anxiety',
      'general',
      'sleep',
      'travel',
      'eating'
    ];
  }

  searchDuas(query: string): Observable<Dua[]> {
    const searchTerms = query.toLowerCase().split(' ');
    const allDuas = Object.values(this.localDuas).flat();
    
    // Get expanded search terms with synonyms
    const expandedTerms = this.getExpandedSearchTerms(searchTerms);
    
    // Perform fuzzy search
    const searchResults = this.fuseSearch.search(query);
    let matchedDuas = searchResults.map(result => result.item);

    // Add emotion-based matches
    const emotionMatches = allDuas.filter(dua => 
      dua.emotion?.some(emotion => 
        expandedTerms.some(term => emotion.toLowerCase().includes(term))
      )
    );

    // Combine and remove duplicates
    matchedDuas = [...new Set([...matchedDuas, ...emotionMatches])];

    return of(matchedDuas);
  }

  private getExpandedSearchTerms(terms: string[]): string[] {
    const expanded = new Set<string>();
    
    terms.forEach(term => {
      expanded.add(term);
      // Add synonyms if they exist
      Object.entries(this.emotionSynonyms).forEach(([emotion, synonyms]) => {
        if (emotion === term || synonyms.includes(term)) {
          expanded.add(emotion);
          synonyms.forEach(synonym => expanded.add(synonym));
        }
      });
    });

    return Array.from(expanded);
  }

  getFavorites(): number[] {
    const favorites = localStorage.getItem(this.FAVORITES_KEY);
    return favorites ? JSON.parse(favorites) : [];
  }

  toggleFavorite(duaId: number): void {
    const favorites = this.getFavorites();
    const index = favorites.indexOf(duaId);
    
    if (index === -1) {
      favorites.push(duaId);
    } else {
      favorites.splice(index, 1);
    }
    
    localStorage.setItem(this.FAVORITES_KEY, JSON.stringify(favorites));
  }

  getFavoriteDuas(): Observable<Dua[]> {
    const favorites = this.getFavorites();
    if (favorites.length === 0) return of([]);

    const allDuas = Object.values(this.localDuas).flat();
    const favoriteDuas = favorites.map(id => allDuas.find(dua => dua.id === id)).filter(Boolean);
    return of(this.getUniqueDuas(favoriteDuas as Dua[]));
  }

  getDuasByEmotion(feeling: string): Observable<Dua[]> {
    const normalizedFeeling = feeling.toLowerCase().trim();
    const allDuas = Object.values(this.localDuas).flat();
    const matchedDuas = allDuas.filter(dua => 
      dua.emotion?.some(emotion => 
        emotion.toLowerCase().includes(normalizedFeeling)
      ) || false
    );
    return of(this.getUniqueDuas(matchedDuas));
  }

  getDuasByCategory(category: DuaCategory): Observable<Dua[]> {
    // Use local data instead of API call
    return of(this.getUniqueDuas(this.localDuas[category] || []));
  }

  getRelatedEmotions(emotion: string): string[] {
    // This is a static mapping of related emotions
    const emotionMap: { [key: string]: string[] } = {
      'anxiety': ['worry', 'fear', 'stress', 'nervousness'],
      'sadness': ['grief', 'sorrow', 'depression', 'loneliness'],
      'fear': ['anxiety', 'worry', 'dread', 'panic'],
      'anger': ['frustration', 'rage', 'irritation', 'resentment'],
      'happiness': ['joy', 'gratitude', 'contentment', 'peace'],
      'love': ['compassion', 'kindness', 'affection', 'care'],
      'gratitude': ['thankfulness', 'appreciation', 'contentment'],
      'peace': ['tranquility', 'serenity', 'calmness', 'contentment'],
      'confusion': ['uncertainty', 'doubt', 'bewilderment'],
      'regret': ['remorse', 'guilt', 'repentance'],
      'loneliness': ['isolation', 'solitude', 'abandonment'],
      'stress': ['pressure', 'tension', 'overwhelm', 'anxiety'],
      'doubt': ['uncertainty', 'confusion', 'skepticism'],
      'guilt': ['shame', 'regret', 'remorse']
    };
    
    return emotionMap[emotion.toLowerCase()] || [];
  }

  async getDuaById(id: string): Promise<Dua | undefined> {
    const numericId = parseInt(id, 10);
    for (const category of Object.keys(this.localDuas)) {
      const dua = this.localDuas[category as DuaCategory]?.find(d => d.id === numericId);
      if (dua) return dua;
    }
    return undefined;
  }

  getDuaInsights(duaId: string): Observable<ResponseType> {
    // console.log(`Getting insights for dua ${duaId}`);
    
    // Check local insights first
    const localInsights = this.getLocalInsights(duaId);
    if (localInsights) {
        // console.log('Found local insights, using those');
        return of(localInsights);
    }

    // If no local insights, try the API
    return from(this.authService.getToken()).pipe(
        switchMap(token => {
            if (!token) {
                console.error('No auth token available');
                return throwError(() => new Error('No authentication token available'));
            }

            return new Observable<ResponseType>(observer => {
                const xhr = new XMLHttpRequest();
                let seenBytes = 0;
                let hasEmittedData = false;
                let timeoutId: any;
                
                // Set a timeout of 30 seconds
                timeoutId = setTimeout(() => {
                    if (!hasEmittedData) {
                        // console.log('Request timed out, checking cache...');
                        const cachedInsights = this.aiInsightsCache[duaId];
                        if (cachedInsights) {
                            try {
                                const parsedInsights = JSON.parse(cachedInsights);
                                observer.next(parsedInsights);
                                hasEmittedData = true;
                                observer.complete();
                            } catch (error) {
                                observer.error(new Error('Failed to parse cached insights'));
                            }
                        } else {
                            observer.error(new Error('Request timed out and no cached data available'));
                        }
                    }
                    xhr.abort();
                }, 30000);
                
                xhr.open('POST', `${this.apiUrl}/api/ai/dua/insights?refresh=true&t=${new Date().getTime()}`);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                xhr.setRequestHeader('Accept', 'text/event-stream');

                xhr.onreadystatechange = () => {
                    // console.log(`ReadyState changed to: ${xhr.readyState}`);
                    
                    if (xhr.readyState === 3 || xhr.readyState === 4) {  // Loading/Streaming or Complete
                        const newData = xhr.responseText.substring(seenBytes);
                        seenBytes = xhr.responseText.length;

                        if (xhr.readyState === 4) {
                            // console.log('Request completed. Status:', xhr.status);
                            // console.log('Final response:', xhr.responseText);
                        }

                        if (!newData && xhr.readyState === 4 && !hasEmittedData) {
                            // console.log('No new data received, checking alternatives...');
                            // Try to get insights from local data first
                            const localInsights = this.getLocalInsights(duaId);
                            if (localInsights) {
                                // console.log('Found local insights, using those');
                                observer.next(localInsights);
                                hasEmittedData = true;
                            } else {
                                // If no local insights, try cache
                                const cachedInsights = this.aiInsightsCache[duaId];
                                if (cachedInsights) {
                                    // console.log('Found cached insights, using those');
                                    try {
                                        const parsedInsights = JSON.parse(cachedInsights);
                                        observer.next(parsedInsights);
                                        hasEmittedData = true;
                                    } catch (error) {
                                        // console.error('Failed to parse cached insights:', error);
                                        observer.error(new Error('Failed to parse cached insights'));
                                    }
                                } else if (!hasEmittedData) {
                                    // console.error('No insights available from any source');
                                    observer.error(new Error('No insights available'));
                                }
                            }
                            observer.complete();
                            return;
                        }

                        const events = newData.split('\n\n').filter(e => e.trim());
                        events.forEach(event => {
                            if (event.startsWith('data: ')) {
                                try {
                                    const data = JSON.parse(event.substring(6)) as ResponseType;
                                    // console.log('Received data:', data);
                                    
                                    if (this.isStreamingResponse(data)) {
                                        if (data.data?.duaId === parseInt(duaId)) {
                                            observer.next(data);
                                            hasEmittedData = true;
                                        }
                                        if (data.status === 'complete' || data.status === 'error') {
                                            if (data.status === 'complete' && data.data) {
                                                this.aiInsightsCache[duaId] = JSON.stringify(data.data);
                                                hasEmittedData = true;
                                            }
                                            clearTimeout(timeoutId);
                                            observer.complete();
                                        }
                                    } else if ('duaId' in data && data.duaId === parseInt(duaId)) {
                                        observer.next(data);
                                        hasEmittedData = true;
                                        this.aiInsightsCache[duaId] = JSON.stringify(data);
                                    }
                                } catch (error) {
                                    // console.error('Error parsing SSE message:', error);
                                    if (!hasEmittedData) {
                                        // Try local insights before giving up
                                        const localInsights = this.getLocalInsights(duaId);
                                        if (localInsights) {
                                            observer.next(localInsights);
                                            hasEmittedData = true;
                                            observer.complete();
                                        } else {
                                            observer.error(error);
                                        }
                                    }
                                }
                            }
                        });
                    }
                };

                xhr.onerror = (error) => {
                    // console.error('XHR error:', error);
                    clearTimeout(timeoutId);
                    if (!hasEmittedData) {
                        const localInsights = this.getLocalInsights(duaId);
                        if (localInsights) {
                            observer.next(localInsights);
                            hasEmittedData = true;
                            observer.complete();
                        } else {
                            observer.error(error);
                        }
                    }
                };

                // Get the dua details from all categories
                const allDuas = Object.values(this.localDuas).flat();
                const dua = allDuas.find((d: Dua) => d.id.toString() === duaId);
                if (!dua) {
                    clearTimeout(timeoutId);
                    observer.error(new Error('Dua not found'));
                    return;
                }

                // Send the request with complete dua data
                try {
                    xhr.send(JSON.stringify({ 
                        dua: {
                            id: parseInt(duaId),
                            title: dua.title,
                            arabic: dua.arabic,
                            translation: dua.translation,
                            reference: dua.reference,
                            category: dua.category,
                            virtue: dua.virtue
                        }
                    }));
                } catch (error) {
                    // console.error('Error sending request:', error);
                    clearTimeout(timeoutId);
                    // Try local insights before giving up
                    const localInsights = this.getLocalInsights(duaId);
                    if (localInsights) {
                        observer.next(localInsights);
                        hasEmittedData = true;
                        observer.complete();
                    } else {
                        observer.error(error);
                    }
                }

                return () => {
                    clearTimeout(timeoutId);
                    xhr.abort();
                };
            });
        })
    );
}

private getLocalInsights(duaId: string): ResponseType | null {
    try {
        // console.log('Looking for local insights in duaInsightsData');
        const duaInsight = duaInsightsData.find((insight: any) => insight.duaId === parseInt(duaId));
        if (duaInsight) {
            // console.log('Found local insights for dua:', duaId);
            
            // Return the insights directly since they're already in the correct format
            return {
                success: true,
                duaId: parseInt(duaId),
                content: duaInsight.content || '',
                virtues: Array.isArray(duaInsight.virtues) ? duaInsight.virtues.join('\n• ') : (duaInsight.virtues || ''),
                application: Array.isArray(duaInsight.application) ? duaInsight.application.join('\n• ') : (duaInsight.application || ''),
                context: duaInsight.historical_context || '',
                impact: '',
                explanation: '',
                historicalContext: duaInsight.historical_context || '',
                reflectionPoints: duaInsight.reflection_points || [],
                modernApplication: '',
                relatedVerses: [],
                related: '',
                spiritual_advice: duaInsight.spiritual_advice || {}
            };
        }
        // console.log('No local insights found for dua:', duaId);
        return null;
    } catch (error) {
        console.error('Error loading local insights:', error);
        return null;
    }
}

private isStreamingResponse(response: ResponseType): response is StreamingResponse {
    return 'status' in response;
}

extractEmotionsFromText(text: string): Observable<string[]> {
    // Use local emotion extraction instead of API call
    return of(this.extractEmotionsLocally(text));
}

private extractEmotionsLocally(text: string): string[] {
    const emotionKeywords = {
      'anxious': ['worried', 'nervous', 'stressed', 'uneasy', 'fearful', 'tense', 'restless', 'apprehensive', 'concerned'],
      'sad': ['depressed', 'unhappy', 'down', 'blue', 'sorrowful', 'heartbroken', 'grief', 'melancholy', 'gloomy'],
      'angry': ['frustrated', 'mad', 'annoyed', 'irritated', 'furious', 'upset', 'outraged', 'enraged', 'hostile'],
      'grateful': ['thankful', 'blessed', 'appreciative', 'content', 'satisfied', 'fulfilled', 'indebted', 'humbled'],
      'hopeful': ['optimistic', 'positive', 'confident', 'assured', 'encouraged', 'inspired', 'motivated', 'eager'],
      'scared': ['afraid', 'frightened', 'terrified', 'fearful', 'anxious', 'panicked', 'threatened', 'intimidated'],
      'guilty': ['remorseful', 'regretful', 'ashamed', 'sorry', 'repentant', 'apologetic', 'conscience-stricken'],
      'confused': ['uncertain', 'unsure', 'lost', 'perplexed', 'doubtful', 'bewildered', 'puzzled', 'disoriented'],
      'lonely': ['isolated', 'alone', 'abandoned', 'disconnected', 'solitary', 'neglected', 'rejected'],
      'peaceful': ['calm', 'serene', 'tranquil', 'relaxed', 'composed', 'at ease', 'content', 'harmonious']
    };

    const textLower = text.toLowerCase();
    const foundEmotions: string[] = [];

    Object.entries(emotionKeywords).forEach(([emotion, synonyms]) => {
      if (synonyms.some(synonym => textLower.includes(synonym)) || textLower.includes(emotion)) {
        foundEmotions.push(emotion);
      }
    });

    // If no emotions found, just use the original text as an emotion
    if (foundEmotions.length === 0 && text.trim()) {
      foundEmotions.push(text.trim());
    }

    return foundEmotions;
}

private getFromCache(key: string): any {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) return null;
      
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < this.CACHE_DURATION) {
        return data;
      }
      return null;
    } catch (error) {
      console.warn('Error reading from cache:', error);
      return null;
    }
  }

  private saveToCache(key: string, data: any): void {
    try {
      localStorage.setItem(key, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.warn('Error saving to cache:', error);
    }
  }

  async getEmotionalDuasWithAI(feeling: string): Promise<EmotionalDuaResponse> {
    try {
      // Split multiple emotions
      const emotions = feeling.toLowerCase().split(/[,\s]+/).map(e => e.trim());
      
      if (emotions.length === 0) {
        throw new Error('No emotions provided');
      }

      // If only one emotion, randomly select from predefined responses
      if (emotions.length === 1) {
        const emotion = emotions[0];
        const responses = (emotionalDuas.emotions as Record<string, Array<Omit<EmotionalDuaResponse, 'success' | 'error'>>>)[emotion] || [];
        
        if (responses.length === 0) {
          // If emotion not found, use AI fallback
          return this.getAIFallbackResponse(emotion);
        }

        // Randomly select a response and add success flag
        const response = responses[Math.floor(Math.random() * responses.length)];
        return {
          ...response,
          success: true
        };
      }

      // For multiple emotions, synthesize a response
      return this.synthesizeMultiEmotionResponse(emotions);
    } catch (error) {
      console.error('Error in getEmotionalDuasWithAI:', error);
      return this.getFallbackResponse();
    }
  }

  private synthesizeMultiEmotionResponse(emotions: string[]): EmotionalDuaResponse {
    // Get responses for each emotion
    const responses = emotions
      .map(emotion => (emotionalDuas.emotions as Record<string, Array<Omit<EmotionalDuaResponse, 'success' | 'error'>>>)[emotion]?.[0])
      .filter((response): response is Omit<EmotionalDuaResponse, 'success' | 'error'> => response !== undefined);

    if (responses.length === 0) {
      // If none of the emotions have predefined data, use the enhanced fallback for the *first* emotion
      console.warn(`[DuaService] No predefined data found for emotions: ${emotions.join(', ')}. Using fallback for "${emotions[0]}".`);
      return this.getFallbackResponse(emotions[0]);
    }

    // Combine responses intelligently
    const combined: EmotionalDuaResponse = {
      success: true,
      // Improved introductory content
      content: `Addressing feelings of ${emotions.join(' and ')} involves integrating guidance relevant to each. Here is a synthesis of Islamic perspectives and practices:`, 
      quranic_guidance: [],
      // Select the first available prophetic example as a representative context
      prophetic_example: responses.find(r => r.prophetic_example)?.prophetic_example || this.getFallbackResponse(emotions[0]).prophetic_example,
      practical_steps: [],
      spiritual_advice: {
        // More nuanced understanding introduction
        understanding: `Experiencing ${emotions.join(' and ')} is common. Islam teaches us to approach complex feelings with patience, gratitude (if applicable), and seeking Allah's help. ${responses.map(r => r.spiritual_advice?.understanding).filter(Boolean).join(' ')}`,
        duas: [],
        dhikr: [],
        scholarly_guidance: [],
        spiritual_remedies: []
      },
      related_verses_hadith: {
        verses: [],
        hadith: []
      },
      reflection_points: [],
      // Use fallback fields as default structure
      virtues: this.getFallbackResponse(emotions[0]).virtues,
      application: this.getFallbackResponse(emotions[0]).application,
      context: responses.find(r => r.context)?.context || this.getFallbackResponse(emotions[0]).context,
      related: this.getFallbackResponse(emotions[0]).related,
      impact: this.getFallbackResponse(emotions[0]).impact,
      explanation: this.getFallbackResponse(emotions[0]).explanation,
      modernApplication: this.getFallbackResponse(emotions[0]).modernApplication,
      insights: this.getFallbackResponse(emotions[0]).insights,
      relatedVerses: [], // Will be populated below
      historicalContext: responses.find(r => r.historicalContext)?.historicalContext || this.getFallbackResponse(emotions[0]).historicalContext,
      reflectionPoints: [] // Will be populated below
    };

    // Combine unique elements from each response
    responses.forEach(response => {
      if (response.quranic_guidance) {
        combined.quranic_guidance.push(...response.quranic_guidance);
      }
      if (response.practical_steps) {
        combined.practical_steps.push(...response.practical_steps);
      }
      if (response.spiritual_advice?.duas) {
        combined.spiritual_advice.duas.push(...response.spiritual_advice.duas);
      }
      if (response.spiritual_advice?.dhikr) {
        combined.spiritual_advice.dhikr.push(...response.spiritual_advice.dhikr);
      }
      if (response.spiritual_advice?.scholarly_guidance) {
        combined.spiritual_advice.scholarly_guidance.push(...response.spiritual_advice.scholarly_guidance);
      }
      if (response.spiritual_advice?.spiritual_remedies) {
        combined.spiritual_advice.spiritual_remedies.push(...response.spiritual_advice.spiritual_remedies);
      }
      if (response.related_verses_hadith?.verses) {
          combined.related_verses_hadith.verses.push(...response.related_verses_hadith.verses);
      }
      if (response.related_verses_hadith?.hadith) {
          combined.related_verses_hadith.hadith.push(...response.related_verses_hadith.hadith);
      }
      if (response.reflection_points) {
          combined.reflection_points.push(...response.reflection_points);
      }
    });

    // Remove duplicates and add fallbacks if still empty
    combined.quranic_guidance = [...new Set(combined.quranic_guidance)];
    combined.practical_steps = [...new Set(combined.practical_steps)].filter(step => this.isIslamicStep(step)); // Filter steps
    combined.spiritual_advice.duas = this.getUniqueDuasByArabic(combined.spiritual_advice.duas);
    combined.spiritual_advice.dhikr = this.getUniqueDhikrByPhrase(combined.spiritual_advice.dhikr);
    combined.spiritual_advice.scholarly_guidance = this.getUniqueByQuote(combined.spiritual_advice.scholarly_guidance);
    combined.spiritual_advice.spiritual_remedies = this.getUniqueByPractice(combined.spiritual_advice.spiritual_remedies);
    combined.related_verses_hadith.verses = [...new Set(combined.related_verses_hadith.verses)];
    combined.related_verses_hadith.hadith = [...new Set(combined.related_verses_hadith.hadith)];
    combined.reflection_points = [...new Set(combined.reflection_points)];
    
    // Add fallback content if sections are still empty after synthesis
    const fallback = this.getFallbackResponse(emotions[0]); // Use first emotion for fallback context
    if (combined.practical_steps.length === 0) combined.practical_steps.push(...fallback.practical_steps);
    if (combined.spiritual_advice.duas.length === 0) combined.spiritual_advice.duas.push(...fallback.spiritual_advice.duas);
    if (combined.spiritual_advice.dhikr.length === 0) combined.spiritual_advice.dhikr.push(...fallback.spiritual_advice.dhikr);
    if (combined.spiritual_advice.scholarly_guidance.length === 0) combined.spiritual_advice.scholarly_guidance.push(...fallback.spiritual_advice.scholarly_guidance);
    if (combined.spiritual_advice.spiritual_remedies.length === 0) combined.spiritual_advice.spiritual_remedies.push(...fallback.spiritual_advice.spiritual_remedies);
    if (combined.related_verses_hadith.verses.length === 0) combined.related_verses_hadith.verses.push(...fallback.related_verses_hadith.verses);
    if (combined.related_verses_hadith.hadith.length === 0) combined.related_verses_hadith.hadith.push(...fallback.related_verses_hadith.hadith);
    if (combined.reflection_points.length === 0) combined.reflection_points.push(...fallback.reflection_points);
    if (!combined.prophetic_example) combined.prophetic_example = fallback.prophetic_example; // Ensure historical context exists
    if (!combined.historicalContext) combined.historicalContext = fallback.historicalContext; // Ensure historical context exists
    if (!combined.spiritual_advice.understanding) combined.spiritual_advice.understanding = fallback.spiritual_advice.understanding;
    

    // Update related fields for consistency
    combined.relatedVerses = combined.related_verses_hadith.verses; 
    combined.reflectionPoints = combined.reflection_points;
    combined.historicalContext = combined.prophetic_example; // Align historicalContext with prophetic_example

    return combined;
  }

  private getUniqueDuasByArabic(duas: DuaItem[]): DuaItem[] {
    const seen = new Set<string>();
    return duas.filter(dua => {
      if (!seen.has(dua.arabic || '')) {
        seen.add(dua.arabic || '');
        return true;
      }
      return false;
    });
  }

  private getUniqueDhikrByPhrase(dhikr: DhikrItem[]): DhikrItem[] {
    const seen = new Set<string>();
    return dhikr.filter(d => {
      if (!seen.has(d.phrase || '')) {
        seen.add(d.phrase || '');
        return true;
      }
      return false;
    });
  }

  private getUniqueByQuote(items: ScholarlyGuidanceItem[]): ScholarlyGuidanceItem[] {
    const seen = new Set<string>();
    return items.filter(item => {
      if (!seen.has(item.quote)) {
        seen.add(item.quote);
        return true;
      }
      return false;
    });
  }

  private getUniqueByPractice(items: SpiritualRemedyItem[]): SpiritualRemedyItem[] {
    const seen = new Set<string>();
    return items.filter(item => {
      if (!seen.has(item.practice)) {
        seen.add(item.practice);
        return true;
      }
      return false;
    });
  }

  private async getAIFallbackResponse(emotion: string): Promise<EmotionalDuaResponse> {
    // This function currently might call the backend API.
    // For now, we will enhance the *static* fallback instead of re-enabling a potentially costly API call.
    // If API call was intended, it would look something like this:
    /*
    try {
      const response = await this.http.post<EmotionalDuaResponse>(
        `${this.apiUrl}/api/ai/dua/emotional-search`,
        { emotion, context: '' } // Assuming context isn't used here
      ).toPromise();

      if (!response) {
        throw new Error('No response received from AI fallback API');
      }

      return this.processAIResponse(response);
    } catch (error) {
      console.error('Error in AI fallback API call:', error);
      return this.getFallbackResponse(emotion); // Use static fallback if API fails
    }
    */
    
    // Return the enhanced static fallback directly:
    // console.warn(`[DuaService] Using enhanced static fallback response for emotion: ${emotion}`);
    return this.getFallbackResponse(emotion);
  }

  private getFallbackResponse(emotion: string = 'general'): EmotionalDuaResponse {
    // Determine if emotion is generally positive or negative for context
    const positiveEmotions = ['happy', 'relieved', 'grateful', 'hopeful', 'peaceful', 'joyful', 'content'];
    const isPositive = positiveEmotions.includes(emotion.toLowerCase());
    
    // Basic context switching for fallback
    const understandingText = isPositive
      ? `Feeling ${emotion} is a blessing from Allah. Islam encourages expressing gratitude (Shukr) and remembering Allah during times of ease.`
      : `Feeling ${emotion} is a test from Allah. Islam provides guidance on seeking patience (Sabr), turning to Allah, and finding relief through remembrance and supplication.`;
      
    const propheticExampleText = isPositive
      ? `The Prophet Muhammad ﷺ often expressed gratitude for blessings. He taught us to say "Alhamdulillah" (All praise is due to Allah) frequently. He smiled often and showed joy when good things happened to the Ummah.`
      : `The Prophet Muhammad ﷺ faced many trials with immense patience. When feeling distressed, he would turn to prayer (Salah) and make specific duas, like the Dua of Yunus (AS): "La ilaha illa Anta, subhanaka, inni kuntu mina z-zalimin".`;
      
    const quranicGuidanceList = isPositive
      ? [
          '"If you are grateful, I will surely increase you [in favor]." (Quran 14:7)',
          '"And the good reward is for those who are grateful." (Quran 3:145)',
          '"Remember Me; I will remember you. Be grateful to Me and do not deny Me." (Quran 2:152)'
        ]
      : [
          '"Verily, with hardship comes ease." (Quran 94:6)',
          '"Seek help through patience and prayer." (Quran 2:153)',
          '"And We will surely test you with something of fear and hunger and a loss of wealth and lives and fruits, but give good tidings to the patient." (Quran 2:155)'
        ];
        
    const practicalStepsList = isPositive
      ? [
          "Offer prayers of gratitude (Salat al-Shukr).",
          "Increase remembrance of Allah (Dhikr), saying Alhamdulillah.",
          "Share your blessings with others through charity (Sadaqah).",
          "Reflect on Allah's favors and write them down.",
          "Use the feeling as motivation for further good deeds."
        ]
      : [
          "Perform Wudu (ablution) and offer two rak'ahs of prayer.",
          "Recite specific duas for distress and anxiety.",
          "Engage in Dhikr, such as Istighfar (seeking forgiveness).",
          "Read or listen to the Quran, especially verses of hope and patience.",
          "Seek support from righteous companions or family.",
          "Practice patience (Sabr) and trust in Allah's plan (Tawakkul)."
        ];
        
    const relatedVersesList = isPositive
      ? [
          '"So remember Me; I will remember you. And be grateful to Me and do not deny Me." (Quran 2:152)',
          '"And [remember] when your Lord proclaimed, \'If you are grateful, I will surely increase you [in favor]; but if you deny, indeed, My punishment is severe.\'" (Quran 14:7)'
        ]
      : [
          '"Indeed, Allah is with the patient." (Quran 2:153)',
          '"No disaster strikes except by permission of Allah. And whoever believes in Allah – He will guide his heart. And Allah is Knowing of all things." (Quran 64:11)'
        ];
        
    const relatedHadithList = isPositive
      ? [
          'The Prophet ﷺ said: "He who does not thank people, does not thank Allah." (Tirmidhi)',
          'When the Prophet ﷺ saw something that pleased him, he would say: "Alhamdulillahil-ladhi bi ni\'matihi tatimmus-salihat" (Praise is to Allah by Whose grace good deeds are completed). (Sunan Ibn Majah)'
        ]
      : [
          'The Prophet ﷺ said: "No fatigue, nor disease, nor sorrow, nor sadness, nor hurt, nor distress befalls a Muslim, even if it were the prick he receives from a thorn, but that Allah expiates some of his sins for that." (Bukhari)',
          'The Prophet ﷺ said: "Know that victory comes with patience, relief with affliction, and ease with hardship." (Tirmidhi)'
        ];

    const reflectionPointsList = isPositive 
        ? [
            "How can I use this feeling to draw closer to Allah?",
            "What specific blessings am I feeling grateful for right now?",
            "How can I share this positive feeling or its fruits with others?",
            "Does this relief motivate me to be more obedient to Allah?"
          ]
        : [
            "What lesson might Allah be teaching me through this feeling?",
            "How can I practice patience (Sabr) in this situation?",
            "What specific duas can I make to seek Allah's help?",
            "Is there any sin I need to seek forgiveness for (Istighfar)?"
          ];

    return {
      success: true,
      content: `Guidance for feeling ${emotion}.`, // Generic but will be combined if needed
      quranic_guidance: quranicGuidanceList,
      prophetic_example: propheticExampleText,
      practical_steps: practicalStepsList,
      spiritual_advice: {
        understanding: understandingText,
        // Use relevant mappings based on positive/negative context
        duas: isPositive
          ? [this.duaMapping['Alhamdulillah'], this.duaMapping['Rabbana atina']]
          : [this.duaMapping['HasbunAllah'], this.duaMapping['Astaghfirullah']],
        dhikr: isPositive
          ? [this.dhikrMapping['Alhamdulillah'], this.dhikrMapping['SubhanAllah']]
          : [this.dhikrMapping['Astaghfirullah'], this.dhikrMapping['La ilaha illa Allah']],
        scholarly_guidance: this.scholarlyGuidance, // Keep generic scholarly guidance for now
        spiritual_remedies: this.spiritualRemedies // Keep generic remedies for now
      },
      related_verses_hadith: {
        verses: relatedVersesList,
        hadith: relatedHadithList
      },
      reflection_points: reflectionPointsList,
      // Add placeholder text for other fields to ensure structure exists
      virtues: 'Turning to Allah in all emotional states brings reward and closeness.',
      application: 'Apply these principles through consistent prayer, remembrance, and reflection.',
      context: `General Islamic context for handling emotions like ${emotion}.`,
      related: 'Concepts like Sabr (patience), Shukr (gratitude), Tawakkul (trust in Allah) are relevant.',
      impact: 'Following this guidance can lead to peace, resilience, and stronger faith.',
      explanation: `An explanation based on Quran and Sunnah for managing ${emotion}.`,
      modernApplication: `In today's world, apply these by consciously practicing gratitude or patience, seeking knowledge, and connecting with supportive Muslims.`,
      error: undefined, // Explicitly set error to undefined for success
      insights: 'Generated fallback insights.', // Indicate it's a fallback
      relatedVerses: relatedVersesList, // Ensure consistency
      historicalContext: propheticExampleText, // Ensure consistency
      reflectionPoints: reflectionPointsList // Ensure consistency
    };
  }

  // Helper to check if a step sounds Islamic
  private isIslamicStep(step: string): boolean {
      const islamicKeywords = ['allah', 'prayer', 'salah', 'dua', 'dhikr', 'quran', 'sunnah', 'prophet', 'islam', 'muslim', 'faith', 'iman', 'sabr', 'shukr', 'tawakkul', 'istighfar', 'halal', 'haram', 'wudu', 'ablution', 'masjid', 'mosque', 'charity', 'sadaqah', 'zakat', 'fasting', 'sawm', 'hajj', 'umrah', 'jannah', 'hell', 'hereafter', 'akhirah', 'companion', 'righteous', 'blessing', 'mercy', 'forgiveness', 'repentance', 'guidance'];
      const stepLower = step.toLowerCase();
      return islamicKeywords.some(keyword => stepLower.includes(keyword));
  }

  private processAIResponse(response: EmotionalDuaResponse): EmotionalDuaResponse {
    // Basic validation and sanitization if needed (Example)
    if (!response.spiritual_advice) {
        response.spiritual_advice = { understanding: '', duas: [], dhikr: [], scholarly_guidance: [], spiritual_remedies: [] }; // Initialize understanding
    } else if (typeof response.spiritual_advice.understanding === 'undefined') {
        response.spiritual_advice.understanding = ''; // Ensure understanding exists
    }
    // Ensure arrays exist
    response.quranic_guidance = response.quranic_guidance || [];
    response.practical_steps = (response.practical_steps || []).filter(step => this.isIslamicStep(step)); // Filter steps
    response.spiritual_advice.duas = response.spiritual_advice.duas || [];
    response.spiritual_advice.dhikr = response.spiritual_advice.dhikr || [];
    response.spiritual_advice.scholarly_guidance = response.spiritual_advice.scholarly_guidance || [];
    response.spiritual_advice.spiritual_remedies = response.spiritual_advice.spiritual_remedies || [];
    response.related_verses_hadith = response.related_verses_hadith || { verses: [], hadith: [] };
    response.related_verses_hadith.verses = response.related_verses_hadith.verses || [];
    response.related_verses_hadith.hadith = response.related_verses_hadith.hadith || [];
    response.reflection_points = response.reflection_points || [];
    
    // Ensure historical context is present, potentially using prophetic_example as fallback
    response.historicalContext = response.historicalContext || response.prophetic_example || '';
    response.prophetic_example = response.prophetic_example || response.historicalContext || '';
    
    // Ensure relatedVerses and reflectionPoints are populated for consistency with fallback structure
    response.relatedVerses = response.related_verses_hadith.verses; 
    response.reflectionPoints = response.reflection_points;
    
    response.success = true; // Assume success if processing reaches here
    return response;
  }

  private getArabicForDua(text: string): string {
    const duaMapping: { [key: string]: string } = {
        'Alhamdulillah': 'الْحَمْدُ لِلَّهِ',
        'HasbunAllahu wa ni\'mal wakeel': 'حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ',
        'La hawla wa la quwwata illa billah': 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ',
        'Astaghfirullah': 'أَسْتَغْفِرُ اللَّهَ',
        'SubhanAllah': 'سُبْحَانَ اللَّهِ',
        'Allahu Akbar': 'اللَّهُ أَكْبَرُ'
    };

    for (const [key, value] of Object.entries(duaMapping)) {
        if (text.toLowerCase().includes(key.toLowerCase())) {
            return value;
        }
    }
    return 'Arabic text pending verification';
  }

  private getArabicForDhikr(text: string): string {
    const dhikrMapping: { [key: string]: string } = {
        'SubhanAllah': 'سُبْحَانَ اللَّهِ',
        'Alhamdulillah': 'الْحَمْدُ لِلَّهِ',
        'Allahu Akbar': 'اللَّهُ أَكْبَرُ',
        'Astaghfirullah': 'أَسْتَغْفِرُ اللَّهَ',
        'La ilaha illa Allah': 'لَا إِلَٰهَ إِلَّا اللَّهُ',
        'La hawla wa la quwwata illa billah': 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ'
    };

    for (const [key, value] of Object.entries(dhikrMapping)) {
        if (text.toLowerCase().includes(key.toLowerCase())) {
            return value;
        }
    }
    return 'Arabic text pending verification';
  }

  private getFallbackInsights(feeling: string): string {
    return `Understanding Your Emotion:
${feeling} is a natural human emotion that Allah (SWT) has created within us. The Prophet Muhammad ﷺ experienced and acknowledged such feelings, teaching us how to channel them positively through faith and patience.

Historical Example:
Prophet Yaqub (AS) experienced intense grief when separated from his beloved son Yusuf (AS). The Quran mentions in Surah Yusuf, verse 86: "He said, 'I only complain of my suffering and my grief to Allah, and I know from Allah that which you do not know.'" (12:86)

Learning from Example:
This example teaches us that even the prophets experienced strong emotions, but they directed their feelings towards Allah through patience and prayer. Prophet Yaqub's response shows us the importance of turning to Allah during emotional difficulties.

Spiritual Advice:
Remember that Allah (SWT) is Al-Latif (The Most Gentle) and Al-Wali (The Protective Friend). The Quran reminds us: "Verily, in the remembrance of Allah do hearts find rest" (13:28).

Every emotion we experience is an opportunity to strengthen our connection with Allah through sincere dua and dhikr.

Practical Steps:
• Perform wudu and pray two rak'ah of salah, as the Prophet ﷺ would turn to prayer when faced with concerns
• Engage in regular dhikr, especially "HasbunAllahu wa ni'mal wakeel" (Allah is sufficient for us, and He is the best Disposer of affairs)
• Share your feelings with a trusted family member or friend, as the Prophet ﷺ taught us to maintain strong community bonds
• Spend time in nature reflecting on Allah's creation, as mentioned in numerous verses of the Quran
• Practice gratitude by listing your blessings, following the hadith "The one who does not thank people does not thank Allah"

Related Verses & Hadith:
• "And seek help through patience and prayer. Indeed, it is difficult except for the humbly submissive [to Allah]" (Quran 2:45)
• "And whoever relies upon Allah - then He is sufficient for him." (Quran 65:3)
• The Prophet ﷺ said: "How wonderful is the affair of the believer, for his affairs are all good." (Sahih Muslim)`;
  }

  async getRecommendedDuasFromSources(emotion: string): Promise<{ duas: Dua[]; insights: string }> {
    try {
      const prompt = {
        systemMessage: 'You are a knowledgeable Islamic scholar specializing in duas and emotional well-being.',
        userMessage: `Please provide guidance for the emotion: ${emotion}`
      };

      // Implementation will be added later
      return {
        duas: [],
        insights: this.getFallbackInsights(emotion)
      };
    } catch (error) {
      console.error('Error getting recommended duas:', error);
      return {
        duas: [],
        insights: this.getFallbackInsights(emotion)
      };
    }
  }
}