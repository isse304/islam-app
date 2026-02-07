import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { 
  Bookmark, 
  BookmarkFilter, 
  BookmarkHelpers, 
  BookmarkStats, 
  Tag 
} from '../models/bookmark.model';
import { FirebaseSyncService } from './firebase-sync.service';

/**
 * Service for managing Tafsir bookmarks with Firebase sync and localStorage fallback
 */
@Injectable({
  providedIn: 'root'
})
export class BookmarkService {
  private bookmarks$ = new BehaviorSubject<Bookmark[]>([]);
  private tags$ = new BehaviorSubject<Tag[]>([]);
  private isLoading$ = new BehaviorSubject<boolean>(false);

  constructor(private syncService: FirebaseSyncService) {
    this.loadBookmarks();
    this.loadTags();
    
    // Set up real-time listener if authenticated
    if (this.syncService.isAuthenticated()) {
      this.subscribeToBookmarks();
    }
  }

  /**
   * Get all bookmarks as an observable
   */
  getBookmarks(): Observable<Bookmark[]> {
    return this.bookmarks$.asObservable();
  }

  /**
   * Get bookmarks filtered by criteria
   */
  getFilteredBookmarks(filter: BookmarkFilter): Observable<Bookmark[]> {
    return this.bookmarks$.pipe(
      map(bookmarks => this.applyFilter(bookmarks, filter))
    );
  }

  /**
   * Get bookmarks for a specific verse
   */
  getBookmarksForVerse(editionId: string, surah: number, verse: number): Observable<Bookmark[]> {
    return this.bookmarks$.pipe(
      map(bookmarks => bookmarks.filter(b => 
        b.editionId === editionId &&
        b.surah === surah &&
        b.verse === verse
      ))
    );
  }

  /**
   * Check if a verse is bookmarked
   */
  isBookmarked(editionId: string, surah: number, verse: number): Observable<boolean> {
    return this.getBookmarksForVerse(editionId, surah, verse).pipe(
      map(bookmarks => bookmarks.length > 0)
    );
  }

  /**
   * Get a single bookmark by ID
   */
  getBookmark(bookmarkId: string): Observable<Bookmark | undefined> {
    return this.bookmarks$.pipe(
      map(bookmarks => bookmarks.find(b => b.id === bookmarkId))
    );
  }

  /**
   * Create or update a bookmark
   */
  saveBookmark(bookmark: Partial<Bookmark>): Observable<Bookmark> {
    const now = new Date().toISOString();
    
    // If updating existing bookmark
    if (bookmark.id) {
      const existing = this.bookmarks$.value.find(b => b.id === bookmark.id);
      if (existing) {
        const updated: Bookmark = {
          ...existing,
          ...bookmark,
          updatedAt: now
        };
        return this.syncService.saveBookmark(updated).pipe(
          tap(saved => {
            const bookmarks = this.bookmarks$.value;
            const index = bookmarks.findIndex(b => b.id === saved.id);
            if (index >= 0) {
              bookmarks[index] = saved;
              this.bookmarks$.next([...bookmarks]);
            }
            this.updateTags();
          })
        );
      }
    }

    // Creating new bookmark
    const newBookmark: Bookmark = {
      id: BookmarkHelpers.generateId(),
      editionId: bookmark.editionId || '',
      surah: bookmark.surah || 1,
      verse: bookmark.verse || 1,
      verseText: bookmark.verseText || '',
      tafsirExcerpt: bookmark.tafsirExcerpt,
      tags: bookmark.tags || [],
      color: bookmark.color || 'blue',
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending'
    };

    return this.syncService.saveBookmark(newBookmark).pipe(
      tap(saved => {
        const bookmarks = [saved, ...this.bookmarks$.value];
        this.bookmarks$.next(bookmarks);
        this.updateTags();
      })
    );
  }

  /**
   * Toggle bookmark for a verse (create if doesn't exist, delete if exists)
   */
  toggleBookmark(
    editionId: string, 
    surah: number, 
    verse: number,
    verseText: string,
    tafsirExcerpt?: string
  ): Observable<'added' | 'removed'> {
    const existing = this.bookmarks$.value.find(b =>
      b.editionId === editionId &&
      b.surah === surah &&
      b.verse === verse
    );

    if (existing) {
      return this.deleteBookmark(existing.id).pipe(
        map(() => 'removed' as const)
      );
    } else {
      return this.saveBookmark({
        editionId,
        surah,
        verse,
        verseText,
        tafsirExcerpt,
        color: 'blue',
        tags: []
      }).pipe(
        map(() => 'added' as const)
      );
    }
  }

  /**
   * Delete a bookmark
   */
  deleteBookmark(bookmarkId: string): Observable<void> {
    return this.syncService.deleteBookmark(bookmarkId).pipe(
      tap(() => {
        const bookmarks = this.bookmarks$.value.filter(b => b.id !== bookmarkId);
        this.bookmarks$.next(bookmarks);
        this.updateTags();
      })
    );
  }

  /**
   * Delete multiple bookmarks
   */
  deleteBookmarks(bookmarkIds: string[]): Observable<void[]> {
    const deleteTasks = bookmarkIds.map(id => 
      this.syncService.deleteBookmark(id).toPromise()
    );
    
    return new Observable(observer => {
      Promise.all(deleteTasks).then(() => {
        const bookmarks = this.bookmarks$.value.filter(b => !bookmarkIds.includes(b.id));
        this.bookmarks$.next(bookmarks);
        this.updateTags();
        observer.next([]);
        observer.complete();
      }).catch(error => {
        observer.error(error);
      });
    });
  }

  /**
   * Add tag to a bookmark
   */
  addTag(bookmarkId: string, tag: string): Observable<Bookmark> {
    const bookmark = this.bookmarks$.value.find(b => b.id === bookmarkId);
    if (!bookmark) {
      throw new Error('Bookmark not found');
    }

    if (!bookmark.tags.includes(tag)) {
      bookmark.tags.push(tag);
      return this.saveBookmark(bookmark);
    }

    return new Observable(observer => {
      observer.next(bookmark);
      observer.complete();
    });
  }

  /**
   * Remove tag from a bookmark
   */
  removeTag(bookmarkId: string, tag: string): Observable<Bookmark> {
    const bookmark = this.bookmarks$.value.find(b => b.id === bookmarkId);
    if (!bookmark) {
      throw new Error('Bookmark not found');
    }

    bookmark.tags = bookmark.tags.filter(t => t !== tag);
    return this.saveBookmark(bookmark);
  }

  /**
   * Get all unique tags
   */
  getTags(): Observable<Tag[]> {
    return this.tags$.asObservable();
  }

  /**
   * Get bookmark statistics
   */
  getStats(): Observable<BookmarkStats> {
    return this.bookmarks$.pipe(
      map(bookmarks => {
        const surahCounts = new Map<number, number>();
        const tagCounts = new Map<string, number>();

        bookmarks.forEach(bookmark => {
          // Count by surah
          surahCounts.set(
            bookmark.surah,
            (surahCounts.get(bookmark.surah) || 0) + 1
          );

          // Count tags
          bookmark.tags.forEach(tag => {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
          });
        });

        // Find most bookmarked surah
        let mostBookmarkedSurah = 1;
        let maxCount = 0;
        surahCounts.forEach((count, surah) => {
          if (count > maxCount) {
            maxCount = count;
            mostBookmarkedSurah = surah;
          }
        });

        // Create tag objects
        const tags: Tag[] = Array.from(tagCounts.entries()).map(([name, count]) => ({
          name,
          count,
          createdAt: ''
        }));

        // Get most recent activity
        const recentActivity = bookmarks.length > 0
          ? new Date(bookmarks[0].createdAt)
          : new Date();

        return {
          totalBookmarks: bookmarks.length,
          totalNotes: 0, // Will be filled by note service
          totalHighlights: 0, // Will be filled by highlight service
          mostBookmarkedSurah,
          recentActivity,
          tags
        };
      })
    );
  }

  /**
   * Search bookmarks
   */
  searchBookmarks(query: string): Observable<Bookmark[]> {
    return this.bookmarks$.pipe(
      map(bookmarks => BookmarkHelpers.search(bookmarks, query, ['verseText', 'tafsirExcerpt', 'tags']))
    );
  }

  /**
   * Export bookmarks to JSON
   */
  exportBookmarks(): string {
    const bookmarks = this.bookmarks$.value;
    return JSON.stringify(bookmarks, null, 2);
  }

  /**
   * Import bookmarks from JSON
   */
  importBookmarks(jsonData: string): Observable<number> {
    return new Observable(observer => {
      try {
        const bookmarks: Bookmark[] = JSON.parse(jsonData);
        const importTasks = bookmarks.map(bookmark => {
          // Generate new IDs to avoid conflicts
          const newBookmark = {
            ...bookmark,
            id: BookmarkHelpers.generateId(),
            syncStatus: 'pending' as const
          };
          return this.syncService.saveBookmark(newBookmark).toPromise();
        });

        Promise.all(importTasks).then(() => {
          this.loadBookmarks();
          observer.next(bookmarks.length);
          observer.complete();
        });
      } catch (error) {
        observer.error(error);
      }
    });
  }

  /**
   * Get loading state
   */
  isLoading(): Observable<boolean> {
    return this.isLoading$.asObservable();
  }

  // ==================== PRIVATE METHODS ====================

  private loadBookmarks(): void {
    this.isLoading$.next(true);
    this.syncService.getBookmarks().subscribe({
      next: (bookmarks) => {
        this.bookmarks$.next(BookmarkHelpers.sortByDate(bookmarks, true));
        this.isLoading$.next(false);
      },
      error: (error) => {
        console.error('Error loading bookmarks:', error);
        this.isLoading$.next(false);
      }
    });
  }

  private subscribeToBookmarks(): void {
    this.syncService.subscribeToBookmarks((bookmarks) => {
      this.bookmarks$.next(BookmarkHelpers.sortByDate(bookmarks, true));
      this.updateTags();
    });
  }

  private loadTags(): void {
    this.updateTags();
  }

  private updateTags(): void {
    const bookmarks = this.bookmarks$.value;
    const tagCounts = new Map<string, number>();

    bookmarks.forEach(bookmark => {
      bookmark.tags.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    const tags: Tag[] = Array.from(tagCounts.entries())
      .map(([name, count]) => ({
        name,
        count,
        createdAt: ''
      }))
      .sort((a, b) => b.count - a.count);

    this.tags$.next(tags);
  }

  private applyFilter(bookmarks: Bookmark[], filter: BookmarkFilter): Bookmark[] {
    let filtered = [...bookmarks];

    if (filter.editionId) {
      filtered = filtered.filter(b => b.editionId === filter.editionId);
    }

    if (filter.surah) {
      filtered = filtered.filter(b => b.surah === filter.surah);
    }

    if (filter.verse) {
      filtered = filtered.filter(b => b.verse === filter.verse);
    }

    if (filter.tags && filter.tags.length > 0) {
      filtered = filtered.filter(b =>
        filter.tags!.some(tag => b.tags.includes(tag))
      );
    }

    if (filter.color) {
      filtered = filtered.filter(b => b.color === filter.color);
    }

    if (filter.searchQuery) {
      filtered = BookmarkHelpers.search(filtered, filter.searchQuery, ['verseText', 'tafsirExcerpt', 'tags']);
    }

    if (filter.dateFrom) {
      const fromDate = new Date(filter.dateFrom).getTime();
      filtered = filtered.filter(b => new Date(b.createdAt).getTime() >= fromDate);
    }

    if (filter.dateTo) {
      const toDate = new Date(filter.dateTo).getTime();
      filtered = filtered.filter(b => new Date(b.createdAt).getTime() <= toDate);
    }

    return filtered;
  }
}
