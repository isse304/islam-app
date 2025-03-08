import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, firstValueFrom } from 'rxjs';
import duasData from '../components/dua/duas.json';
import localforage from 'localforage';
import Fuse from 'fuse.js';
import { ApiService } from './api.service';

export type DuaCategory = 'morning' | 'evening' | 'protection' | 'forgiveness' | 'anxiety' | 'general' | 'sleep' | 'travel' | 'eating' | 'hardship' | 'gratitude' | 'guidance' | 'sadness';

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
}

@Injectable({
  providedIn: 'root'
})
export class DuaService {
  private readonly FAVORITES_KEY = 'favoriteDuas';
  private readonly DUA_STORAGE_KEY = 'duas_data';
  private readonly AI_INSIGHTS_KEY = 'dua_ai_insights';
  private readonly CATEGORIES_KEY = 'dua_categories';
  private localDuas: { [key in DuaCategory]?: Dua[] } = {};
  private aiInsightsCache: { [key: string]: string } = {};
  private categoriesCache: { [key: string]: Dua[] } = {};
  private fuseSearch: Fuse<Dua>;
  
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

  constructor(
    private http: HttpClient,
    private apiService: ApiService
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
    return this.getDuas(category);
  }

  getRelatedEmotions(emotion: string): string[] {
    const emotionMap = new Map<string, string[]>([
      ['anxious', ['worried', 'fearful', 'stressed', 'overwhelmed', 'uncertain']],
      ['worried', ['anxious', 'fearful', 'stressed', 'concerned', 'troubled']],
      ['hopeful', ['optimistic', 'grateful', 'positive', 'faithful', 'confident']],
      ['grateful', ['thankful', 'blessed', 'appreciative', 'content', 'happy']],
      ['fearful', ['scared', 'anxious', 'worried', 'threatened', 'insecure']],
      ['tired', ['exhausted', 'weary', 'sleepy', 'drained', 'fatigued']],
      ['seeking protection', ['vulnerable', 'threatened', 'unsafe', 'insecure', 'fearful']],
      ['seeking peace', ['restless', 'anxious', 'troubled', 'disturbed', 'seeking comfort']],
      ['seeking strength', ['weak', 'tired', 'overwhelmed', 'struggling', 'powerless']],
      ['seeking forgiveness', ['guilty', 'remorseful', 'regretful', 'ashamed', 'repentant']]
    ]);

    const lowerEmotion = emotion.toLowerCase();
    const relatedEmotions = emotionMap.get(lowerEmotion) || [];
    
    // Add emotions that have the search term as a related emotion
    emotionMap.forEach((related, key) => {
      if (related.includes(lowerEmotion) && !relatedEmotions.includes(key)) {
        relatedEmotions.push(key);
      }
    });

    return relatedEmotions;
  }

  async getDuaById(id: string): Promise<Dua | undefined> {
    const numericId = parseInt(id, 10);
    for (const category of Object.keys(this.localDuas)) {
      const dua = this.localDuas[category as DuaCategory]?.find(d => d.id === numericId);
      if (dua) return dua;
    }
    return undefined;
  }

  async getDuaInsights(duaId: string): Promise<string> {
    try {
      // Check AI insights cache first
      if (this.aiInsightsCache[duaId]) {
        return this.aiInsightsCache[duaId];
      }

      // If not in cache, generate new insights
      const dua = await this.getDuaById(duaId);
      if (!dua) return '';

      const prompt = {
        systemMessage: "You are a knowledgeable Islamic scholar specializing in duas and their meanings.",
        userMessage: `Provide insights about this dua:\n${dua.arabic}\nTranslation: ${dua.translation}`,
        temperature: 0.6,
        maxTokens: 500
      };

      const response = await firstValueFrom(this.apiService.generateAIResponse(prompt));
      const insights = response?.content || 'No insights available';
      
      // Cache the result
      this.aiInsightsCache[duaId] = insights;
      await this.saveCaches();
      
      return insights;
    } catch (error) {
      console.error('Error getting dua insights:', error);
      return '';
    }
  }

  async getEmotionalDuasWithAI(feeling: string): Promise<{ duas: Dua[], insights: string }> {
    try {
      const matchedDuas = await firstValueFrom(this.getDuasByEmotion(feeling));
      
      if (matchedDuas.length === 0) {
        return this.getRecommendedDuasFromSources(feeling);
      }

      const prompt = {
        systemMessage: `You are a knowledgeable Islamic scholar specializing in emotional well-being and spiritual guidance through duas. 
        Provide personalized advice in the following format:
        
        1. Understanding Your Emotion:
        [First paragraph: Brief explanation validating the emotion from an Islamic perspective]
        
        [Second paragraph: A specific example from Quran or Seerah where a prophet, companion, or person mentioned in Quran experienced this emotion. Include the specific reference.]
        
        [Third paragraph: How this example teaches us to handle this emotion constructively]

        2. Recommended Duas:
        [For each dua, provide in a clear, formatted way:
        • Title of Dua
        • Arabic text (properly formatted)
        • Transliteration (clear and accurate)
        • Translation
        • Reference (specific source)
        • Virtue of the dua]
        
        3. Spiritual Advice:
        [Break down into 2-3 short, focused paragraphs with specific Quranic verses or hadith supporting each point]
        
        4. Practical Steps:
        • [Step 1: Immediate action with spiritual basis]
        • [Step 2: Daily practice with prophetic example]
        • [Step 3: Social/community aspect]
        • [Step 4: Long-term spiritual growth]
        • [Step 5: Specific dua or dhikr practice]

        Each step should include a brief explanation and religious basis.
        Keep the tone warm and supportive, ensure all Arabic text is properly formatted, and make all text easily readable with proper spacing and structure.`,
        userMessage: `A person is feeling ${feeling}. Based on Islamic teachings, provide comprehensive guidance and recommend appropriate duas.
        
        Available duas:
        ${matchedDuas.map(dua => `
        - ${dua.title}
        Arabic: ${dua.arabic}
        Translation: ${dua.translation}
        Reference: ${dua.reference}
        Virtue: ${dua.virtue || 'Not specified'}
        `).join('\n')}`,
        temperature: 0.3,
        maxTokens: 2000
      };

      try {
        const response = await firstValueFrom(this.apiService.generateAIResponse(prompt));
        const insights = response?.content || this.getFallbackInsights(feeling);

        const sortedDuas = matchedDuas.sort((a, b) => {
          const aEmotions = a.emotion?.filter(e => e.toLowerCase().includes(feeling.toLowerCase())).length || 0;
          const bEmotions = b.emotion?.filter(e => e.toLowerCase().includes(feeling.toLowerCase())).length || 0;
          return bEmotions - aEmotions;
        });

        return {
          duas: sortedDuas,
          insights
        };
      } catch (error) {
        console.error('Error generating AI insights:', error);
        return {
          duas: matchedDuas,
          insights: this.getFallbackInsights(feeling)
        };
      }
    } catch (error) {
      console.error('Error getting emotional duas with AI:', error);
      return {
        duas: [],
        insights: this.getFallbackInsights(feeling)
      };
    }
  }

  private getFallbackInsights(feeling: string): string {
    return `1. Understanding Your Emotion:
${feeling} is a natural human emotion that Allah (SWT) has created within us. The Prophet Muhammad ﷺ experienced and acknowledged such feelings, teaching us how to channel them positively through faith and patience.

2. Recommended Duas:
• Dua for Inner Peace:
اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ
Transliteration: Allahumma inni a'udhu bika minal-hammi wal-hazan
Translation: "O Allah, I seek refuge in You from anxiety and sorrow"
Reference: Sahih Al-Bukhari 6369
Virtue: The Prophet ﷺ would frequently recite this dua, and it has been reported to bring immediate relief.

3. Spiritual Advice:
Remember that Allah (SWT) is Al-Latif (The Most Gentle) and Al-Wali (The Protective Friend). The Quran reminds us: "Verily, in the remembrance of Allah do hearts find rest" (13:28). This time of ${feeling} is an opportunity to strengthen your connection with Allah through sincere dua and dhikr.

4. Practical Steps:
• Perform wudu and pray two rak'ah of salah, as the Prophet ﷺ would turn to prayer when faced with concerns
• Engage in regular dhikr, especially "HasbunAllahu wa ni'mal wakeel" (Allah is sufficient for us, and He is the best Disposer of affairs)
• Share your feelings with a trusted family member or friend, as the Prophet ﷺ taught us to maintain strong community bonds
• Spend time in nature reflecting on Allah's creation, as mentioned in numerous verses of the Quran
• Practice gratitude by listing your blessings, following the hadith "The one who does not thank people does not thank Allah"`;
  }

  async getRecommendedDuasFromSources(emotion: string): Promise<{ duas: Dua[], insights: string }> {
    try {
      const prompt = {
        systemMessage: `You are a knowledgeable Islamic scholar specializing in duas and emotional well-being. 
        Provide comprehensive guidance in the following format:

        {
          "duas": [
            {
              "title": "Title of the Dua",
              "arabic": "Arabic text in proper formatting",
              "transliteration": "Clear and accurate transliteration",
              "translation": "English translation",
              "reference": "Specific source reference",
              "virtue": "Benefits and virtues of this dua"
            }
          ],
          "insights": "Structured insights following the same format as getFallbackInsights with all sections properly filled"
        }`,
        userMessage: `Recommend authentic duas from Quran and Hadith that can help with the emotion: ${emotion}. Include complete details and ensure proper formatting.`,
        temperature: 0.4,
        maxTokens: 2000
      };

      try {
        const response = await firstValueFrom(this.apiService.generateAIResponse(prompt));
        const result = JSON.parse(response?.content || '{"duas":[],"insights":""}');
        
        if (!result.duas || !result.insights) {
          throw new Error('Invalid response format');
        }

        return {
          duas: result.duas,
          insights: result.insights || this.getFallbackInsights(emotion)
        };
      } catch (error) {
        console.error('Error parsing AI response:', error);
        return {
          duas: this.getDefaultDuas(),
          insights: this.getFallbackInsights(emotion)
        };
      }
    } catch (error) {
      console.error('Error getting recommended duas:', error);
      return {
        duas: this.getDefaultDuas(),
        insights: this.getFallbackInsights(emotion)
      };
    }
  }

  private getDefaultDuas(): Dua[] {
    // Return some general purpose duas as fallback
    return this.localDuas['general'] || [];
  }
} 