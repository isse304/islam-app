import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { map, tap, debounceTime } from 'rxjs/operators';
import { 
  Note, 
  NoteFilter, 
  BookmarkHelpers,
  Tag 
} from '../models/bookmark.model';
import { FirebaseSyncService } from './firebase-sync.service';

/**
 * Service for managing Tafsir notes with Firebase sync and localStorage fallback
 * Includes auto-save functionality and rich text support
 */
@Injectable({
  providedIn: 'root'
})
export class NoteService {
  private notes$ = new BehaviorSubject<Note[]>([]);
  private tags$ = new BehaviorSubject<Tag[]>([]);
  private isLoading$ = new BehaviorSubject<boolean>(false);
  private autoSaveQueue$ = new Subject<Note>();

  // Draft management
  private currentDraft: Note | null = null;
  private draftChanged$ = new Subject<void>();

  constructor(private syncService: FirebaseSyncService) {
    this.loadNotes();
    this.loadTags();
    
    // Set up real-time listener if authenticated
    if (this.syncService.isAuthenticated()) {
      this.subscribeToNotes();
    }

    // Set up auto-save with 3-second debounce
    this.autoSaveQueue$.pipe(
      debounceTime(3000)
    ).subscribe(note => {
      this.saveNote(note).subscribe({
        next: () => console.log('✅ Note auto-saved'),
        error: (error) => console.error('Error auto-saving note:', error)
      });
    });
  }

  /**
   * Get all notes as an observable
   */
  getNotes(): Observable<Note[]> {
    return this.notes$.asObservable();
  }

  /**
   * Get notes filtered by criteria
   */
  getFilteredNotes(filter: NoteFilter): Observable<Note[]> {
    return this.notes$.pipe(
      map(notes => this.applyFilter(notes, filter))
    );
  }

  /**
   * Get notes for a specific verse
   */
  getNotesForVerse(editionId: string, surah: number, verse: number): Observable<Note[]> {
    return this.notes$.pipe(
      map(notes => notes.filter(n => 
        n.editionId === editionId &&
        n.surah === surah &&
        n.verse === verse
      ))
    );
  }

  /**
   * Check if a verse has notes
   */
  hasNotes(editionId: string, surah: number, verse: number): Observable<boolean> {
    return this.getNotesForVerse(editionId, surah, verse).pipe(
      map(notes => notes.length > 0)
    );
  }

  /**
   * Get a single note by ID
   */
  getNote(noteId: string): Observable<Note | undefined> {
    return this.notes$.pipe(
      map(notes => notes.find(n => n.id === noteId))
    );
  }

  /**
   * Create or update a note
   */
  saveNote(note: Partial<Note>): Observable<Note> {
    const now = new Date().toISOString();
    
    // If updating existing note
    if (note.id) {
      const existing = this.notes$.value.find(n => n.id === note.id);
      if (existing) {
        const updated: Note = {
          ...existing,
          ...note,
          plainText: note.content ? BookmarkHelpers.stripHtml(note.content) : existing.plainText,
          updatedAt: now
        };
        return this.syncService.saveNote(updated).pipe(
          tap(saved => {
            const notes = this.notes$.value;
            const index = notes.findIndex(n => n.id === saved.id);
            if (index >= 0) {
              notes[index] = saved;
              this.notes$.next([...notes]);
            }
            this.updateTags();
            
            // Clear draft if this was the current draft
            if (this.currentDraft?.id === saved.id) {
              this.currentDraft = null;
            }
          })
        );
      }
    }

    // Creating new note
    const newNote: Note = {
      id: BookmarkHelpers.generateId(),
      editionId: note.editionId || '',
      surah: note.surah || 1,
      verse: note.verse || 1,
      content: note.content || '',
      plainText: note.content ? BookmarkHelpers.stripHtml(note.content) : '',
      tags: note.tags || [],
      isPrivate: note.isPrivate ?? true,
      attachments: note.attachments || [],
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending'
    };

    return this.syncService.saveNote(newNote).pipe(
      tap(saved => {
        const notes = [saved, ...this.notes$.value];
        this.notes$.next(notes);
        this.updateTags();
      })
    );
  }

  /**
   * Delete a note
   */
  deleteNote(noteId: string): Observable<void> {
    return this.syncService.deleteNote(noteId).pipe(
      tap(() => {
        const notes = this.notes$.value.filter(n => n.id !== noteId);
        this.notes$.next(notes);
        this.updateTags();
        
        // Clear draft if this was the current draft
        if (this.currentDraft?.id === noteId) {
          this.currentDraft = null;
        }
      })
    );
  }

  /**
   * Delete multiple notes
   */
  deleteNotes(noteIds: string[]): Observable<void[]> {
    const deleteTasks = noteIds.map(id => 
      this.syncService.deleteNote(id).toPromise()
    );
    
    return new Observable(observer => {
      Promise.all(deleteTasks).then(() => {
        const notes = this.notes$.value.filter(n => !noteIds.includes(n.id));
        this.notes$.next(notes);
        this.updateTags();
        observer.next([]);
        observer.complete();
      }).catch(error => {
        observer.error(error);
      });
    });
  }

  /**
   * Add tag to a note
   */
  addTag(noteId: string, tag: string): Observable<Note> {
    const note = this.notes$.value.find(n => n.id === noteId);
    if (!note) {
      throw new Error('Note not found');
    }

    if (!note.tags.includes(tag)) {
      note.tags.push(tag);
      return this.saveNote(note);
    }

    return new Observable(observer => {
      observer.next(note);
      observer.complete();
    });
  }

  /**
   * Remove tag from a note
   */
  removeTag(noteId: string, tag: string): Observable<Note> {
    const note = this.notes$.value.find(n => n.id === noteId);
    if (!note) {
      throw new Error('Note not found');
    }

    note.tags = note.tags.filter(t => t !== tag);
    return this.saveNote(note);
  }

  /**
   * Get all unique tags
   */
  getTags(): Observable<Tag[]> {
    return this.tags$.asObservable();
  }

  /**
   * Search notes
   */
  searchNotes(query: string): Observable<Note[]> {
    return this.notes$.pipe(
      map(notes => BookmarkHelpers.search(notes, query, ['plainText', 'tags']))
    );
  }

  /**
   * Export notes to JSON
   */
  exportNotes(): string {
    const notes = this.notes$.value;
    return JSON.stringify(notes, null, 2);
  }

  /**
   * Import notes from JSON
   */
  importNotes(jsonData: string): Observable<number> {
    return new Observable(observer => {
      try {
        const notes: Note[] = JSON.parse(jsonData);
        const importTasks = notes.map(note => {
          // Generate new IDs to avoid conflicts
          const newNote = {
            ...note,
            id: BookmarkHelpers.generateId(),
            syncStatus: 'pending' as const
          };
          return this.syncService.saveNote(newNote).toPromise();
        });

        Promise.all(importTasks).then(() => {
          this.loadNotes();
          observer.next(notes.length);
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

  // ==================== DRAFT MANAGEMENT ====================

  /**
   * Create a new draft note
   */
  createDraft(editionId: string, surah: number, verse: number): Note {
    const draft: Note = {
      id: BookmarkHelpers.generateId(),
      editionId,
      surah,
      verse,
      content: '',
      plainText: '',
      tags: [],
      isPrivate: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'local-only'
    };
    
    this.currentDraft = draft;
    this.saveDraftToLocalStorage(draft);
    return draft;
  }

  /**
   * Load an existing note as a draft for editing
   */
  loadDraft(noteId: string): Observable<Note | null> {
    return this.getNote(noteId).pipe(
      map(note => {
        if (note) {
          this.currentDraft = { ...note };
          this.saveDraftToLocalStorage(this.currentDraft);
        }
        return note || null;
      })
    );
  }

  /**
   * Update the current draft (triggers auto-save)
   */
  updateDraft(updates: Partial<Note>): void {
    if (!this.currentDraft) return;

    this.currentDraft = {
      ...this.currentDraft,
      ...updates,
      plainText: updates.content ? BookmarkHelpers.stripHtml(updates.content) : this.currentDraft.plainText,
      updatedAt: new Date().toISOString()
    };

    this.saveDraftToLocalStorage(this.currentDraft);
    this.autoSaveQueue$.next(this.currentDraft);
    this.draftChanged$.next();
  }

  /**
   * Get the current draft
   */
  getCurrentDraft(): Note | null {
    return this.currentDraft;
  }

  /**
   * Load draft from localStorage (for recovery after page reload)
   */
  loadDraftFromLocalStorage(editionId: string, surah: number, verse: number): Note | null {
    const key = `tafsir_draft_${editionId}_${surah}_${verse}`;
    const data = localStorage.getItem(key);
    if (data) {
      this.currentDraft = JSON.parse(data);
      return this.currentDraft;
    }
    return null;
  }

  /**
   * Clear the current draft
   */
  clearDraft(): void {
    if (this.currentDraft) {
      const key = `tafsir_draft_${this.currentDraft.editionId}_${this.currentDraft.surah}_${this.currentDraft.verse}`;
      localStorage.removeItem(key);
      this.currentDraft = null;
    }
  }

  /**
   * Observe draft changes
   */
  onDraftChanged(): Observable<void> {
    return this.draftChanged$.asObservable();
  }

  // ==================== RICH TEXT HELPERS ====================

  /**
   * Sanitize HTML content (to prevent XSS)
   * In production, use a library like DOMPurify
   */
  sanitizeHtml(html: string): string {
    // Basic sanitization - in production use DOMPurify
    const tmp = document.createElement('div');
    tmp.textContent = html;
    return tmp.innerHTML;
  }

  /**
   * Convert markdown to HTML (basic implementation)
   */
  markdownToHtml(markdown: string): string {
    return markdown
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      .replace(/\n/gim, '<br>');
  }

  /**
   * Get word count from HTML content
   */
  getWordCount(html: string): number {
    const text = BookmarkHelpers.stripHtml(html);
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Get character count from HTML content
   */
  getCharCount(html: string): number {
    const text = BookmarkHelpers.stripHtml(html);
    return text.length;
  }

  // ==================== PRIVATE METHODS ====================

  private loadNotes(): void {
    this.isLoading$.next(true);
    this.syncService.getNotes().subscribe({
      next: (notes) => {
        this.notes$.next(BookmarkHelpers.sortByDate(notes, true));
        this.isLoading$.next(false);
      },
      error: (error) => {
        console.error('Error loading notes:', error);
        this.isLoading$.next(false);
      }
    });
  }

  private subscribeToNotes(): void {
    // For notes, we'll use polling instead of real-time listeners
    // since notes are more private and less frequently updated
    // In future, can add real-time listener similar to bookmarks
  }

  private loadTags(): void {
    this.updateTags();
  }

  private updateTags(): void {
    const notes = this.notes$.value;
    const tagCounts = new Map<string, number>();

    notes.forEach(note => {
      note.tags.forEach(tag => {
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

  private applyFilter(notes: Note[], filter: NoteFilter): Note[] {
    let filtered = [...notes];

    if (filter.editionId) {
      filtered = filtered.filter(n => n.editionId === filter.editionId);
    }

    if (filter.surah) {
      filtered = filtered.filter(n => n.surah === filter.surah);
    }

    if (filter.verse) {
      filtered = filtered.filter(n => n.verse === filter.verse);
    }

    if (filter.tags && filter.tags.length > 0) {
      filtered = filtered.filter(n =>
        filter.tags!.some(tag => n.tags.includes(tag))
      );
    }

    if (filter.isPrivate !== undefined) {
      filtered = filtered.filter(n => n.isPrivate === filter.isPrivate);
    }

    if (filter.searchQuery) {
      filtered = BookmarkHelpers.search(filtered, filter.searchQuery, ['plainText', 'tags']);
    }

    if (filter.dateFrom) {
      const fromDate = new Date(filter.dateFrom).getTime();
      filtered = filtered.filter(n => new Date(n.createdAt).getTime() >= fromDate);
    }

    if (filter.dateTo) {
      const toDate = new Date(filter.dateTo).getTime();
      filtered = filtered.filter(n => new Date(n.createdAt).getTime() <= toDate);
    }

    return filtered;
  }

  private saveDraftToLocalStorage(draft: Note): void {
    const key = `tafsir_draft_${draft.editionId}_${draft.surah}_${draft.verse}`;
    localStorage.setItem(key, JSON.stringify(draft));
  }
}
