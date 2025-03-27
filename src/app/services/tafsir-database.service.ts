import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of, forkJoin, retry, timer } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface TafsirEntry {
  surah: number;
  verse: number;
  source: string;
  content: string;
  metadata?: {
    topics?: string[];
    context?: string;
    references?: string[];
  };
  severity: number;
}

export interface TafsirResponse {
  text: string;
  metadata: {
    source: string;
    language: string;
    reference: string;
  };
}

export interface TafsirChatResponse {
  success: boolean;
  content: string;
}

@Injectable({
  providedIn: 'root'
})
export class TafsirDatabaseService {
  private baseUrl = environment.apiUrl;
  private readonly CACHE_KEY = 'tafsir_database_cache';
  
  // Available tafsir sources
  readonly tafsirSources = [
    { id: 'ibn-kathir', name: 'Tafsir Ibn Kathir', language: 'en' },
    { id: 'tabari', name: 'Tafsir Al-Tabari', language: 'ar' }
  ];

  constructor(private http: HttpClient) {
    this.initializeCache();
  }

  private initializeCache() {
    if (!localStorage.getItem(this.CACHE_KEY)) {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify({}));
    }
  }

  // Fetch and store tafsir for a specific verse from all sources
  fetchAndStoreTafsir(surah: number, verse: number): Observable<TafsirEntry[]> {
    const requests = this.tafsirSources.map(source => 
      this.http.get<any>(`${this.baseUrl}/api/tafsir/${source.id}/${surah}/${verse}`).pipe(
        map(response => ({
          surah,
          verse,
          source: source.id,
          content: response.text || response.content,
          metadata: response.metadata
        } as TafsirEntry)),
        catchError(error => {
          console.error(`Error fetching tafsir from ${source.id}:`, error);
          return of(null);
        })
      )
    );

    return forkJoin(requests).pipe(
      map(entries => entries.filter(entry => entry !== null) as TafsirEntry[]),
      tap(entries => this.cacheTafsirEntries(entries))
    );
  }

  // Get tafsir entries from cache or fetch if not available
  getTafsirEntries(surahNumber: number, verseNumber: number): Observable<TafsirEntry[]> {
    const sources = ['ibn-kathir', 'tabari'];
    const cacheKey = `tafsir_${surahNumber}_${verseNumber}`;
    
    // Check cache first
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsedCache = JSON.parse(cached);
        if (parsedCache.timestamp > Date.now() - 24 * 60 * 60 * 1000) { // 24 hour cache
          return of(parsedCache.entries);
        }
      } catch (e) {
        console.warn('Cache parsing error:', e);
      }
    }
    
    const requests = sources.map(source => {
      return this.http.get<any>(`${this.baseUrl}/api/tafsir/${source}/${surahNumber}/${verseNumber}`).pipe(
        retry({
          count: 3,
          delay: (error, retryCount) => {
            if (error.status === 429) {
              // Exponential backoff for rate limit errors
              const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
              console.log(`Rate limited, retrying in ${delay}ms...`);
              return timer(delay);
            }
            return timer(1000); // Default 1s delay for other errors
          }
        }),
        map(response => ({
          source,
          content: response.text || 'Tafsir not available',
          surah: surahNumber,
          verse: verseNumber,
          severity: 1,
          metadata: response.metadata
        } as TafsirEntry)),
        catchError(error => {
          console.warn(`Error fetching tafsir from ${source}:`, error);
          return of({
            source,
            content: error.status === 429 ? 'Service temporarily unavailable due to rate limiting. Please try again in a few minutes.' : 'Tafsir not available',
            surah: surahNumber,
            verse: verseNumber,
            severity: 1,
            metadata: error.error?.metadata || {
              source,
              language: 'en',
              reference: `${surahNumber}:${verseNumber}`
            }
          } as TafsirEntry);
        })
      );
    });

    return forkJoin(requests).pipe(
      map(entries => entries.filter(entry => entry.content !== 'Tafsir not available')),
      tap(entries => {
        // Cache the results
        localStorage.setItem(cacheKey, JSON.stringify({
          entries,
          timestamp: Date.now()
        }));
        
        if (entries.length === 0) {
          console.warn('No tafsir entries available for:', { surah: surahNumber, verse: verseNumber });
        } else {
          console.log('Loaded tafsir entries:', entries);
        }
      })
    );
  }

  // Get tafsir from a specific source
  getTafsirBySource(surah: number, verse: number, sourceId: string): Observable<TafsirEntry | null> {
    return this.getTafsirEntries(surah, verse).pipe(
      map(entries => entries.find(entry => entry.source === sourceId) || null)
    );
  }

  // Cache management
  private getCachedTafsir(surah: number, verse: number): TafsirEntry[] | null {
    try {
      const cache = JSON.parse(localStorage.getItem(this.CACHE_KEY) || '{}');
      const key = `${surah}:${verse}`;
      return cache[key] || null;
    } catch (error) {
      console.error('Error reading from tafsir cache:', error);
      return null;
    }
  }

  private cacheTafsirEntries(entries: TafsirEntry[]) {
    if (!entries.length) return;
    
    try {
      const cache = JSON.parse(localStorage.getItem(this.CACHE_KEY) || '{}');
      const key = `${entries[0].surah}:${entries[0].verse}`;
      cache[key] = entries;
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.error('Error caching tafsir entries:', error);
    }
  }

  // Search functionality
  searchTafsir(query: string): Observable<TafsirEntry[]> {
    return this.http.post<TafsirEntry[]>(`${this.baseUrl}/api/tafsir/search`, { query }).pipe(
      catchError(error => {
        console.error('Error searching tafsir:', error);
        return of([]);
      })
    );
  }

  getTafsir(source: string, surah: number, verse: number): Observable<TafsirResponse> {
    return this.http.get<TafsirResponse>(`/api/tafsir/${source}/${surah}/${verse}`).pipe(
      catchError(() => of({
        text: 'Tafsir not available',
        metadata: {
          source,
          language: 'en',
          reference: `${surah}:${verse}`
        }
      }))
    );
  }

  askTafsirQuestion(surah: number, verse: number, question: string): Observable<TafsirChatResponse> {
    return this.http.post<TafsirChatResponse>('/api/tafsir/chat', {
      surah,
      verse,
      question
    }).pipe(
      catchError(() => of({
        success: false,
        content: 'Failed to generate AI response. Please try again later.'
      }))
    );
  }
} 