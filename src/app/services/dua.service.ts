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

  extractEmotionsFromText(text: string): string[] {
    const emotionKeywords = {
      anxious: ['anxious', 'worried', 'nervous', 'stressed', 'uneasy', 'fear', 'scared', 'frightened'],
      sad: ['sad', 'depressed', 'down', 'heartbroken', 'grief', 'sorrow', 'upset', 'unhappy'],
      angry: ['angry', 'furious', 'rage', 'irritated', 'frustrated', 'mad', 'annoyed'],
      happy: ['happy', 'joyful', 'excited', 'delighted', 'pleased', 'content'],
      grateful: ['grateful', 'thankful', 'blessed', 'appreciative', 'humbled'],
      hopeful: ['hopeful', 'optimistic', 'positive', 'encouraged', 'confident'],
      confused: ['confused', 'uncertain', 'unsure', 'lost', 'perplexed', 'puzzled'],
      lonely: ['lonely', 'alone', 'isolated', 'abandoned', 'disconnected'],
      guilty: ['guilty', 'regretful', 'remorseful', 'ashamed', 'sorry'],
      peaceful: ['peaceful', 'calm', 'serene', 'tranquil', 'relaxed'],
      overwhelmed: ['overwhelmed', 'burdened', 'stressed', 'pressured', 'swamped'],
      fearful: ['fearful', 'afraid', 'terrified', 'anxious', 'scared', 'panicked']
    };

    const words = text.toLowerCase().split(/\W+/);
    const foundEmotions = new Set<string>();

    words.forEach(word => {
      for (const [emotion, synonyms] of Object.entries(emotionKeywords)) {
        if (synonyms.includes(word)) {
          foundEmotions.add(emotion);
        }
      }
    });

    return Array.from(foundEmotions);
  }

  async getEmotionalDuasWithAI(input: string): Promise<{ duas: Dua[], insights: string }> {
    try {
      // Extract emotions from the input text
      const emotions = this.extractEmotionsFromText(input);
      
      if (emotions.length === 0) {
        // If no emotions detected, treat the entire input as an emotion
        emotions.push(input.toLowerCase().trim());
      }

      // Get duas for all emotions
      const allDuas: Dua[] = [];
      for (const emotion of emotions) {
        const matchedDuas = await firstValueFrom(this.getDuasByEmotion(emotion));
        allDuas.push(...matchedDuas);
      }

      // Remove duplicates
      const uniqueDuas = this.getUniqueDuas(allDuas);
      
      if (uniqueDuas.length === 0) {
        return this.getRecommendedDuasFromSources(emotions.join(' and '));
      }

      const prompt = {
        systemMessage: `You are a knowledgeable Islamic scholar specializing in emotional well-being and spiritual guidance through duas. 
        ${emotions.length > 1 ? 'The person is experiencing multiple emotions, so please address each one separately and then provide combined guidance.' : ''}
        
        Provide personalized advice in the following format:
        
        ${emotions.length > 1 ? emotions.map(emotion => `
        ADDRESSING ${emotion.toUpperCase()}:
        1. Understanding This Emotion:
        [Brief explanation validating ${emotion} from an Islamic perspective]
        
        2. Specific Guidance for ${emotion}:
        [How to handle ${emotion} based on Quran and Sunnah]
        
        3. Relevant Example:
        [A specific example from Islamic history related to ${emotion}]
        `).join('\n\n') : ''}
        
        ${emotions.length > 1 ? '\nCOMBINED GUIDANCE:' : ''}
        1. Understanding Your Emotion${emotions.length > 1 ? 's' : ''}:
        [${emotions.length > 1 ? 'Explain how these emotions interact and affect each other' : 'Brief explanation validating the emotion from an Islamic perspective'}]
        
        2. Historical Example:
        [A specific example from Quran or Seerah where a prophet, companion, or person mentioned in Quran experienced this emotion${emotions.length > 1 ? 's' : ''}. Include the specific Surah and verse numbers.]
        
        3. Learning from Example:
        [How this example teaches us to handle ${emotions.length > 1 ? 'these emotions' : 'this emotion'} constructively]

        4. Spiritual Advice:
        [Break down into 2-3 short, focused paragraphs with specific Quranic verses or hadith supporting each point]
        
        5. Practical Steps:
        • [Step 1: Immediate action with spiritual basis]
        • [Step 2: Daily practice with prophetic example]
        • [Step 3: Social/community aspect]
        • [Step 4: Long-term spiritual growth]
        • [Step 5: Specific dua or dhikr practice]

        6. Related Verses & Hadith:
        • [2-3 relevant Quranic verses with Surah and verse numbers]
        • [2-3 relevant hadith with full references]`,
        userMessage: `A person is experiencing: ${emotions.join(' and ')}
        Context: ${input}
        
        Available duas:
        ${uniqueDuas.map(dua => `
        - ${dua.title}
        Arabic: ${dua.arabic}
        Translation: ${dua.translation}
        Reference: ${dua.reference}
        Virtue: ${dua.virtue || 'Not specified'}
        `).join('\n')}
        
        Please provide comprehensive guidance addressing ${emotions.length > 1 ? 'each emotion separately and then combined guidance' : 'this emotion'}.`,
        temperature: 0.4,
        maxTokens: 2000
      };

      try {
        const response = await firstValueFrom(this.apiService.generateAIResponse(prompt));
        const insights = response?.content || this.getFallbackInsights(emotions.join(' and '));

        // Sort duas by relevance to the emotions
        const sortedDuas = uniqueDuas.sort((a, b) => {
          const aEmotions = emotions.filter(emotion => 
            a.emotion?.some(e => e.toLowerCase().includes(emotion.toLowerCase()))
          ).length;
          const bEmotions = emotions.filter(emotion => 
            b.emotion?.some(e => e.toLowerCase().includes(emotion.toLowerCase()))
          ).length;
          return bEmotions - aEmotions;
        });

        return {
          duas: sortedDuas,
          insights
        };
      } catch (error) {
        console.error('Error generating AI insights:', error);
        return {
          duas: uniqueDuas,
          insights: this.getFallbackInsights(emotions.join(' and '))
        };
      }
    } catch (error) {
      console.error('Error getting emotional duas with AI:', error);
      return {
        duas: [],
        insights: this.getFallbackInsights(input)
      };
    }
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