interface TafsirEntry {
  source: string;
  surah: number;
  verse: number;
  content: string;
  language: string;
}

export class TafsirCacheService {
  private readonly CACHE_NAME = 'tafsir-cache';
  private cache: Map<string, TafsirEntry>;

  constructor() {
    this.cache = new Map();
  }

  async getTafsir(source: string, surah: number, verse: number): Promise<TafsirEntry | null> {
    const key = this.getCacheKey(source, surah, verse);
    return this.cache.get(key) || null;
  }

  async saveTafsir(entry: TafsirEntry): Promise<void> {
    const key = this.getCacheKey(entry.source, entry.surah, entry.verse);
    this.cache.set(key, entry);
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
  }

  private getCacheKey(source: string, surah: number, verse: number): string {
    return `${source}:${surah}:${verse}`;
  }
} 