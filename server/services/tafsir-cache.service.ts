interface TafsirEntry {
  source: string;
  surah: number;
  verse: number;
  content: string;
  language: string;
}

export class TafsirCacheService {
  private readonly CACHE_NAME = 'tafsir-cache';
  private cache: Map<string, string>;

  constructor() {
    this.cache = new Map();
  }

  async get(key: string): Promise<string | null> {
    return this.cache.get(key) || null;
  }

  async set(key: string, content: string): Promise<void> {
    this.cache.set(key, content);
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
  }

  async getTafsir(source: string, surah: number, verse: number): Promise<TafsirEntry | null> {
    const key = this.getCacheKey(source, surah, verse);
    const content = await this.get(key);
    if (content) {
      return {
        source,
        surah,
        verse,
        content,
        language: 'en' // Assuming a default language
      } as TafsirEntry;
    }
    return null;
  }

  async saveTafsir(entry: TafsirEntry): Promise<void> {
    const key = this.getCacheKey(entry.source, entry.surah, entry.verse);
    await this.set(key, entry.content);
  }

  private getCacheKey(source: string, surah: number, verse: number): string {
    return `${source}:${surah}:${verse}`;
  }
} 