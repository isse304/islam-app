import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Highlight, BookmarkHelpers } from '../models/bookmark.model';
import { FirebaseSyncService } from './firebase-sync.service';

@Injectable({
  providedIn: 'root'
})
export class HighlightService {
  private readonly STORAGE_KEY = 'tafsir_highlights';
  private highlightsSubject = new BehaviorSubject<Highlight[]>([]);
  public highlights$ = this.highlightsSubject.asObservable();

  constructor(private firebaseSyncService: FirebaseSyncService) {
    this.loadHighlights();
  }

  /**
   * Load all highlights from local storage
   */
  private loadHighlights(): void {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      try {
        const highlights = JSON.parse(stored);
        this.highlightsSubject.next(highlights);
      } catch (error) {
        console.error('Error loading highlights:', error);
        this.highlightsSubject.next([]);
      }
    }
  }

  /**
   * Save highlights to local storage
   */
  private saveHighlights(highlights: Highlight[]): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(highlights));
    this.highlightsSubject.next(highlights);
  }

  /**
   * Add a new highlight
   */
  addHighlight(highlight: Omit<Highlight, 'id' | 'createdAt' | 'syncStatus'>): Observable<Highlight> {
    return new Observable(observer => {
      const newHighlight: Highlight = {
        ...highlight,
        id: BookmarkHelpers.generateId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending'
      };

      const highlights = this.highlightsSubject.getValue();
      const updated = [...highlights, newHighlight];
      this.saveHighlights(updated);

      // Sync to Firebase
      this.firebaseSyncService.saveHighlight(newHighlight).subscribe({
        next: () => console.log('Highlight synced to Firebase'),
        error: (err) => console.error('Error syncing highlight to Firebase:', err)
      });

      observer.next(newHighlight);
      observer.complete();
    });
  }

  /**
   * Update an existing highlight
   */
  updateHighlight(id: string, updates: Partial<Highlight>): Observable<Highlight> {
    return new Observable(observer => {
      const highlights = this.highlightsSubject.getValue();
      const index = highlights.findIndex(h => h.id === id);

      if (index === -1) {
        observer.error(new Error('Highlight not found'));
        return;
      }

      const updatedHighlight: Highlight = {
        ...highlights[index],
        ...updates,
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending'
      };

      const updated = [...highlights];
      updated[index] = updatedHighlight;
      this.saveHighlights(updated);

      // Sync to Firebase
      this.firebaseSyncService.saveHighlight(updatedHighlight).subscribe({
        next: () => console.log('Highlight updated in Firebase'),
        error: (err) => console.error('Error updating highlight in Firebase:', err)
      });

      observer.next(updatedHighlight);
      observer.complete();
    });
  }

  /**
   * Delete a highlight
   */
  deleteHighlight(id: string): Observable<void> {
    return new Observable(observer => {
      const highlights = this.highlightsSubject.getValue();
      const updated = highlights.filter(h => h.id !== id);
      this.saveHighlights(updated);

      // Delete from Firebase
      this.firebaseSyncService.deleteHighlight(id).subscribe({
        next: () => console.log('Highlight deleted from Firebase'),
        error: (err) => console.error('Error deleting highlight from Firebase:', err)
      });

      observer.next();
      observer.complete();
    });
  }

  /**
   * Get a single highlight by ID
   */
  getHighlight(id: string): Highlight | undefined {
    return this.highlightsSubject.getValue().find(h => h.id === id);
  }

  /**
   * Get all highlights
   */
  getAllHighlights(): Highlight[] {
    return this.highlightsSubject.getValue();
  }

  /**
   * Get highlights for a specific verse
   */
  getHighlightsForVerse(surah: number, verse: number, editionId?: string): Highlight[] {
    const highlights = this.highlightsSubject.getValue();
    return highlights.filter(h => 
      h.surah === surah && 
      h.verse === verse &&
      (!editionId || h.editionId === editionId)
    );
  }

  /**
   * Get highlights for a specific surah
   */
  getHighlightsForSurah(surah: number, editionId?: string): Highlight[] {
    const highlights = this.highlightsSubject.getValue();
    return highlights.filter(h => 
      h.surah === surah &&
      (!editionId || h.editionId === editionId)
    );
  }

  /**
   * Search highlights by text
   */
  searchHighlights(query: string): Highlight[] {
    if (!query.trim()) {
      return this.getAllHighlights();
    }

    const highlights = this.highlightsSubject.getValue();
    const lowerQuery = query.toLowerCase();

    return highlights.filter(h =>
      h.text.toLowerCase().includes(lowerQuery) ||
      h.note?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get highlight statistics
   */
  getHighlightStats(): { total: number; byColor: Record<string, number> } {
    const highlights = this.highlightsSubject.getValue();
    const byColor: Record<string, number> = {};

    highlights.forEach(h => {
      byColor[h.color] = (byColor[h.color] || 0) + 1;
    });

    return {
      total: highlights.length,
      byColor
    };
  }

  /**
   * Check if a text range is already highlighted
   */
  isRangeHighlighted(surah: number, verse: number, startOffset: number, endOffset: number, editionId?: string): Highlight | undefined {
    const highlights = this.getHighlightsForVerse(surah, verse, editionId);
    return highlights.find(h =>
      h.startOffset === startOffset && h.endOffset === endOffset
    );
  }

  /**
   * Find overlapping highlights for a text range
   */
  findOverlappingHighlights(surah: number, verse: number, startOffset: number, endOffset: number, editionId?: string): Highlight[] {
    const highlights = this.getHighlightsForVerse(surah, verse, editionId);
    return highlights.filter(h =>
      (h.startOffset >= startOffset && h.startOffset < endOffset) ||
      (h.endOffset > startOffset && h.endOffset <= endOffset) ||
      (h.startOffset <= startOffset && h.endOffset >= endOffset)
    );
  }

  /**
   * Export highlights as JSON
   */
  exportHighlights(): string {
    const highlights = this.getAllHighlights();
    return JSON.stringify(highlights, null, 2);
  }

  /**
   * Import highlights from JSON
   */
  importHighlights(jsonData: string): Observable<number> {
    return new Observable(observer => {
      try {
        const imported: Highlight[] = JSON.parse(jsonData);
        
        if (!Array.isArray(imported)) {
          observer.error(new Error('Invalid JSON format'));
          return;
        }

        // Merge with existing highlights (avoid duplicates)
        const existing = this.highlightsSubject.getValue();
        const existingIds = new Set(existing.map(h => h.id));
        
        const newHighlights = imported.filter(h => !existingIds.has(h.id));
        const merged = [...existing, ...newHighlights];
        
        this.saveHighlights(merged);

        // Sync to Firebase
        newHighlights.forEach(h => {
          this.firebaseSyncService.saveHighlight(h).subscribe({
            next: () => console.log('Imported highlight synced to Firebase'),
            error: (err) => console.error('Error syncing imported highlight:', err)
          });
        });

        observer.next(newHighlights.length);
        observer.complete();
      } catch (error) {
        observer.error(error);
      }
    });
  }

  /**
   * Clear all highlights (with confirmation)
   */
  clearAllHighlights(): Observable<void> {
    return new Observable(observer => {
      const highlights = this.highlightsSubject.getValue();
      this.saveHighlights([]);
      
      // Clear from Firebase
      highlights.forEach(h => {
        this.firebaseSyncService.deleteHighlight(h.id).subscribe({
          next: () => console.log('Highlight cleared from Firebase'),
          error: (err) => console.error('Error clearing highlight from Firebase:', err)
        });
      });

      observer.next();
      observer.complete();
    });
  }
}
