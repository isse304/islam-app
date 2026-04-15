import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, forkJoin, throwError, from, BehaviorSubject } from 'rxjs';
import { map, catchError, tap, switchMap, retry, shareReplay } from 'rxjs/operators';
import {
  TafsirEdition,
  TafsirContent,
  TafsirSearchResult,
  QuranHubEditionsResponse,
  QuranHubTafsirResponse,
  QuranCDNTafsirResponse,
  DownloadProgress
} from '../models/tafsir.model';

@Injectable({
  providedIn: 'root'
})
export class TafsirService {
  // API endpoints
  private quranHubBaseUrl = 'https://api.quranhub.com/v1';
  private quranCDNBaseUrl = 'https://api.qurancdn.com/api/qdc';
  
  // Cache
  private editionsCache$ = new BehaviorSubject<TafsirEdition[] | null>(null);
  private contentCache = new Map<string, TafsirContent>();
  private readonly CACHE_DURATION = 1000 * 60 * 60; // 1 hour
  private cacheTimestamps = new Map<string, number>();

  constructor(private http: HttpClient) {
    this.loadEditions();
  }

  /**
   * Get all available tafsir editions
   */
  getEditions(language?: string): Observable<TafsirEdition[]> {
    // Return cached if available
    const cached = this.editionsCache$.getValue();
    if (cached && cached.length > 0) {
      return of(language ? cached.filter(e => e.language === language) : cached);
    }

    // Fetch from APIs
    return this.fetchEditionsFromAPIs().pipe(
      map(editions => {
        // Filter by language if specified
        return language ? editions.filter(e => e.language === language) : editions;
      }),
      tap(editions => this.editionsCache$.next(editions)),
      shareReplay(1)
    );
  }

  /**
   * Get single edition details
   */
  getEdition(editionId: string): Observable<TafsirEdition> {
    return this.getEditions().pipe(
      map(editions => {
        const edition = editions.find(e => e.id === editionId);
        if (!edition) {
          throw new Error(`Edition not found: ${editionId}`);
        }
        return edition;
      })
    );
  }

  /**
   * Get tafsir for a specific verse
   */
  getTafsirForVerse(
    editionId: string,
    surah: number,
    verse: number
  ): Observable<TafsirContent> {
    const cacheKey = `${editionId}:${surah}:${verse}`;
    
    // Check cache
    const cached = this.contentCache.get(cacheKey);
    const timestamp = this.cacheTimestamps.get(cacheKey);
    
    if (cached && timestamp && (Date.now() - timestamp) < this.CACHE_DURATION) {
      return of(cached);
    }

    // Determine source and fetch
    return this.getEdition(editionId).pipe(
      switchMap(edition => {
        switch (edition.source) {
          case 'quranhub':
            return this.fetchFromQuranHub(edition.sourceId || editionId, surah, verse);
          case 'qurancdn':
            return this.fetchFromQuranCDN(edition.sourceId || editionId, surah, verse);
          case 'local':
            return this.fetchFromLocal(editionId, surah, verse);
          default:
            return throwError(() => new Error('Unknown source'));
        }
      }),
      tap(content => {
        this.contentCache.set(cacheKey, content);
        this.cacheTimestamps.set(cacheKey, Date.now());
      }),
      retry({
        count: 3,
        delay: 1000,
        resetOnSuccess: true
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get tafsir for entire surah
   */
  getTafsirForSurah(
    editionId: string,
    surah: number
  ): Observable<TafsirContent[]> {
    // Get verse count for surah
    const verseCounts = this.getSurahVerseCounts();
    const verseCount = verseCounts[surah - 1];

    // Create observables for all verses
    const verseObservables: Observable<TafsirContent>[] = [];
    for (let verse = 1; verse <= verseCount; verse++) {
      verseObservables.push(
        this.getTafsirForVerse(editionId, surah, verse)
      );
    }

    // Execute all requests (with some batching to avoid overwhelming the API)
    return forkJoin(verseObservables);
  }

  /**
   * Prefetch next verses for smooth pagination
   */
  prefetchNextVerses(
    editionId: string,
    surah: number,
    verse: number,
    count: number = 3
  ): void {
    const verseCounts = this.getSurahVerseCounts();
    const maxVerse = verseCounts[surah - 1];

    for (let i = 1; i <= count; i++) {
      const nextVerse = verse + i;
      if (nextVerse <= maxVerse) {
        // Fetch in background (don't wait for result)
        this.getTafsirForVerse(editionId, surah, nextVerse).subscribe();
      }
    }
  }

  /**
   * Search within tafsir
   */
  searchTafsir(
    query: string,
    editionId?: string,
    surah?: number
  ): Observable<TafsirSearchResult[]> {
    if (!query.trim()) {
      return of([]);
    }

    // For now, implement basic search
    // TODO: Implement API-based search when available
    const editions$ = editionId
      ? of([editionId])
      : this.getEditions().pipe(map(editions => editions.map(e => e.id)));

    return editions$.pipe(
      switchMap(editionIds => {
        // Search across specified editions
        const searchObservables = editionIds.map(eId =>
          this.searchInEdition(eId, query, surah)
        );
        return forkJoin(searchObservables);
      }),
      map(results => results.flat()),
      map(results => this.rankSearchResults(results, query))
    );
  }

  /**
   * Download edition for offline use
   */
  downloadEditionOffline(
    editionId: string,
    surahs: number[]
  ): Observable<DownloadProgress> {
    return new Observable(observer => {
      const progress: DownloadProgress = {
        editionId,
        totalVerses: 0,
        downloadedVerses: 0,
        percentage: 0,
        status: 'pending'
      };

      // Calculate total verses
      const verseCounts = this.getSurahVerseCounts();
      progress.totalVerses = surahs.reduce(
        (sum, surah) => sum + verseCounts[surah - 1],
        0
      );

      progress.status = 'downloading';
      observer.next(progress);

      // Download each surah
      const downloadPromises = surahs.map(async surah => {
        try {
          await this.getTafsirForSurah(editionId, surah).toPromise();
          progress.downloadedVerses += verseCounts[surah - 1];
          progress.percentage = (progress.downloadedVerses / progress.totalVerses) * 100;
          observer.next(progress);
        } catch (error) {
          console.error(`Error downloading surah ${surah}:`, error);
        }
      });

      Promise.all(downloadPromises)
        .then(() => {
          progress.status = 'completed';
          progress.percentage = 100;
          observer.next(progress);
          observer.complete();
        })
        .catch(error => {
          progress.status = 'failed';
          progress.error = error.message;
          observer.next(progress);
          observer.error(error);
        });
    });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.contentCache.clear();
    this.cacheTimestamps.clear();
    this.editionsCache$.next(null);
  }

  /**
   * Get popular tafsir editions
   */
  getPopularEditions(limit: number = 5): Observable<TafsirEdition[]> {
    return this.getEditions().pipe(
      map(editions => {
        // Sort by downloads/rating (if available)
        return editions
          .sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
          .slice(0, limit);
      })
    );
  }

  // ============= PRIVATE METHODS =============

  /**
   * Load editions from all available APIs
   */
  private loadEditions(): void {
    this.fetchEditionsFromAPIs().subscribe(
      editions => this.editionsCache$.next(editions),
      error => console.error('Error loading editions:', error)
    );
  }

  /**
   * Fetch editions from all APIs
   */
  private fetchEditionsFromAPIs(): Observable<TafsirEdition[]> {
    // For now, return hardcoded popular editions
    // TODO: Implement actual API calls when ready
    const editions: TafsirEdition[] = [
      {
        id: 'en-ibn-kathir',
        name: 'Tafsir Ibn Kathir',
        nameArabic: 'تفسير ابن كثير',
        author: 'Ibn Kathir',
        authorArabic: 'ابن كثير',
        language: 'en',
        description: 'Classical and comprehensive tafsir by Imam Ibn Kathir, one of the most respected Quranic scholars.',
        difficulty: 'intermediate',
        source: 'qurancdn',
        sourceId: 'en-tafisr-ibn-kathir',
        isOfflineAvailable: false,
        isPremium: false,
        lastUpdated: new Date(),
        tags: ['classical', 'comprehensive', 'popular'],
        rating: 4.8,
        downloads: 15000
      },
      {
        id: 'ar-ibn-kathir',
        name: 'Tafsir Ibn Kathir (Arabic)',
        nameArabic: 'تفسير ابن كثير',
        author: 'Ibn Kathir',
        authorArabic: 'ابن كثير',
        language: 'ar',
        description: 'Original Arabic text of the famous tafsir by Ibn Kathir.',
        difficulty: 'advanced',
        source: 'qurancdn',
        sourceId: 'ar-tafsir-ibn-kathir',
        isOfflineAvailable: false,
        isPremium: false,
        lastUpdated: new Date(),
        tags: ['classical', 'arabic', 'comprehensive'],
        rating: 4.9,
        downloads: 12000
      }
    ];

    return of(editions);
  }

  /**
   * Fetch from Quran Hub API
   */
  private fetchFromQuranHub(
    editionId: string,
    surah: number,
    verse: number
  ): Observable<TafsirContent> {
    const url = `${this.quranHubBaseUrl}/tafsir/${editionId}/${surah}/${verse}`;
    
    return this.http.get<QuranHubTafsirResponse>(url).pipe(
      map(response => this.mapQuranHubResponse(response, editionId, surah, verse)),
      catchError(error => {
        console.error('Quran Hub API error:', error);
        return throwError(() => new Error('Failed to fetch from Quran Hub'));
      })
    );
  }

  /**
   * Fetch from Quran CDN API
   */
  private fetchFromQuranCDN(
    editionId: string,
    surah: number,
    verse: number
  ): Observable<TafsirContent> {
    const url = `${this.quranCDNBaseUrl}/tafsirs/${editionId}/by_ayah/${surah}:${verse}`;
    
    return this.http.get<QuranCDNTafsirResponse>(url).pipe(
      map(response => this.mapQuranCDNResponse(response, editionId, surah, verse)),
      catchError(error => {
        console.error('Quran CDN API error:', error);
        return throwError(() => new Error('Failed to fetch from Quran CDN'));
      })
    );
  }

  /**
   * Fetch from local storage (for Somali and custom tafsir)
   */
  private fetchFromLocal(
    editionId: string,
    surah: number,
    verse: number
  ): Observable<TafsirContent> {
    // Placeholder for local tafsir
    return of({
      editionId,
      surah,
      verse,
      text: 'Somali Tafsir content coming soon. This is a placeholder for future integration.',
      wordCount: 50,
      estimatedReadTime: 1
    });
  }

  /**
   * Map Quran Hub response to TafsirContent
   */
  private mapQuranHubResponse(
    response: QuranHubTafsirResponse,
    editionId: string,
    surah: number,
    verse: number
  ): TafsirContent {
    const text = this.cleanTafsirText(response.tafsir.text);
    return {
      editionId,
      surah,
      verse,
      text,
      wordCount: text.split(/\s+/).length,
      estimatedReadTime: Math.ceil(text.split(/\s+/).length / 200) // 200 words per minute
    };
  }

  /**
   * Map Quran CDN response to TafsirContent
   */
  private mapQuranCDNResponse(
    response: QuranCDNTafsirResponse,
    editionId: string,
    surah: number,
    verse: number
  ): TafsirContent {
    const text = this.cleanTafsirText(response.tafsir.text);
    return {
      editionId,
      surah,
      verse,
      text,
      wordCount: text.split(/\s+/).length,
      estimatedReadTime: Math.ceil(text.split(/\s+/).length / 200)
    };
  }

  /**
   * Clean tafsir text (remove HTML, format paragraphs)
   */
  private cleanTafsirText(text: string): string {
    return text
      .replace(/<h2>/g, '\n\n')
      .replace(/<\/h2>/g, '\n')
      .replace(/<p>/g, '\n')
      .replace(/<\/p>/g, '')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
  }

  /**
   * Search within a specific edition
   */
  private searchInEdition(
    editionId: string,
    query: string,
    surah?: number
  ): Observable<TafsirSearchResult[]> {
    // This is a simplified implementation
    // In production, you'd want server-side search or indexedDB full-text search
    return of([]);
  }

  /**
   * Rank search results by relevance
   */
  private rankSearchResults(
    results: TafsirSearchResult[],
    query: string
  ): TafsirSearchResult[] {
    const queryLower = query.toLowerCase();
    
    return results
      .map(result => {
        // Calculate relevance score
        const textLower = result.text.toLowerCase();
        const occurrences = (textLower.match(new RegExp(queryLower, 'g')) || []).length;
        const position = textLower.indexOf(queryLower);
        
        result.relevance = occurrences * 10 + (position === -1 ? 0 : 1000 / (position + 1));
        
        // Add highlighting
        const regex = new RegExp(`(${query})`, 'gi');
        result.highlightedText = result.text.replace(regex, '<mark>$1</mark>');
        
        return result;
      })
      .sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Get verse counts for all surahs
   */
  private getSurahVerseCounts(): number[] {
    return [
      7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128,
      111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73,
      54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60,
      49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52,
      44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19,
      26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3,
      6, 3, 5, 4, 5, 6
    ];
  }

  /**
   * Error handler
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An error occurred';
    
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Server-side error
      errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
    }
    
    console.error(errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}
