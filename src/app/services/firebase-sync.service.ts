import { Injectable } from '@angular/core';
import { 
  Firestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  Timestamp,
  writeBatch,
  onSnapshot,
  QuerySnapshot,
  DocumentData
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { BehaviorSubject, Observable, from, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { Bookmark, Note, Highlight, SyncStatus } from '../models/bookmark.model';

/**
 * Service for syncing bookmarks, notes, and highlights between Firebase and localStorage
 * Handles authentication state and graceful degradation to localStorage-only mode
 */
@Injectable({
  providedIn: 'root'
})
export class FirebaseSyncService {
  private syncStatus$ = new BehaviorSubject<SyncStatus>({
    lastSyncAt: '',
    pendingBookmarks: 0,
    pendingNotes: 0,
    pendingHighlights: 0,
    isSyncing: false,
    errors: []
  });

  private isOnline$ = new BehaviorSubject<boolean>(navigator.onLine);

  constructor(
    private firestore: Firestore,
    private auth: Auth
  ) {
    // Monitor online/offline status
    window.addEventListener('online', () => this.isOnline$.next(true));
    window.addEventListener('offline', () => this.isOnline$.next(false));

    // Auto-sync when coming back online
    this.isOnline$.subscribe(online => {
      if (online) {
        this.syncPendingChanges();
      }
    });
  }

  /**
   * Get current sync status
   */
  getSyncStatus(): Observable<SyncStatus> {
    return this.syncStatus$.asObservable();
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.auth.currentUser;
  }

  /**
   * Get current user ID
   */
  getUserId(): string | null {
    return this.auth.currentUser?.uid || null;
  }

  // ==================== BOOKMARKS ====================

  /**
   * Save bookmark to Firebase (if authenticated) and localStorage
   */
  saveBookmark(bookmark: Bookmark): Observable<Bookmark> {
    // Save to localStorage immediately
    this.saveBookmarkToLocalStorage(bookmark);

    if (!this.isAuthenticated()) {
      bookmark.syncStatus = 'local-only';
      return of(bookmark);
    }

    // Save to Firebase
    const userId = this.getUserId()!;
    bookmark.userId = userId;
    const bookmarkRef = doc(this.firestore, `users/${userId}/tafsir_bookmarks/${bookmark.id}`);

    return from(setDoc(bookmarkRef, this.serializeForFirestore(bookmark))).pipe(
      map(() => {
        bookmark.syncStatus = 'synced';
        this.saveBookmarkToLocalStorage(bookmark); // Update sync status in localStorage
        return bookmark;
      }),
      catchError(error => {
        console.error('Error saving bookmark to Firebase:', error);
        bookmark.syncStatus = 'pending';
        this.saveBookmarkToLocalStorage(bookmark);
        this.addPendingSync('bookmark', bookmark.id);
        return of(bookmark);
      })
    );
  }

  /**
   * Get all bookmarks from Firebase (if authenticated) or localStorage
   */
  getBookmarks(): Observable<Bookmark[]> {
    if (!this.isAuthenticated()) {
      return of(this.getBookmarksFromLocalStorage());
    }

    const userId = this.getUserId()!;
    const bookmarksRef = collection(this.firestore, `users/${userId}/tafsir_bookmarks`);
    const q = query(bookmarksRef, orderBy('createdAt', 'desc'));

    return from(getDocs(q)).pipe(
      map(snapshot => {
        const bookmarks: Bookmark[] = [];
        snapshot.forEach(doc => {
          bookmarks.push(this.deserializeFromFirestore(doc.data()) as Bookmark);
        });
        
        // Merge with localStorage and save to localStorage
        this.saveBookmarksToLocalStorage(bookmarks);
        return bookmarks;
      }),
      catchError(error => {
        console.error('Error fetching bookmarks from Firebase:', error);
        // Fall back to localStorage
        return of(this.getBookmarksFromLocalStorage());
      })
    );
  }

  /**
   * Delete bookmark from Firebase and localStorage
   */
  deleteBookmark(bookmarkId: string): Observable<void> {
    // Delete from localStorage immediately
    this.deleteBookmarkFromLocalStorage(bookmarkId);

    if (!this.isAuthenticated()) {
      return of(undefined);
    }

    const userId = this.getUserId()!;
    const bookmarkRef = doc(this.firestore, `users/${userId}/tafsir_bookmarks/${bookmarkId}`);

    return from(deleteDoc(bookmarkRef)).pipe(
      map(() => undefined),
      catchError(error => {
        console.error('Error deleting bookmark from Firebase:', error);
        return of(undefined);
      })
    );
  }

  /**
   * Subscribe to real-time bookmark updates
   */
  subscribeToBookmarks(callback: (bookmarks: Bookmark[]) => void): () => void {
    if (!this.isAuthenticated()) {
      // Return bookmarks from localStorage immediately and set up no listener
      callback(this.getBookmarksFromLocalStorage());
      return () => {}; // No-op unsubscribe
    }

    const userId = this.getUserId()!;
    const bookmarksRef = collection(this.firestore, `users/${userId}/tafsir_bookmarks`);
    const q = query(bookmarksRef, orderBy('createdAt', 'desc'));

    return onSnapshot(q, 
      (snapshot: QuerySnapshot<DocumentData>) => {
        const bookmarks: Bookmark[] = [];
        snapshot.forEach(doc => {
          bookmarks.push(this.deserializeFromFirestore(doc.data()) as Bookmark);
        });
        this.saveBookmarksToLocalStorage(bookmarks);
        callback(bookmarks);
      },
      (error) => {
        console.error('Error in bookmark subscription:', error);
        callback(this.getBookmarksFromLocalStorage());
      }
    );
  }

  // ==================== NOTES ====================

  /**
   * Save note to Firebase (if authenticated) and localStorage
   */
  saveNote(note: Note): Observable<Note> {
    this.saveNoteToLocalStorage(note);

    if (!this.isAuthenticated()) {
      note.syncStatus = 'local-only';
      return of(note);
    }

    const userId = this.getUserId()!;
    note.userId = userId;
    const noteRef = doc(this.firestore, `users/${userId}/tafsir_notes/${note.id}`);

    return from(setDoc(noteRef, this.serializeForFirestore(note))).pipe(
      map(() => {
        note.syncStatus = 'synced';
        this.saveNoteToLocalStorage(note);
        return note;
      }),
      catchError(error => {
        console.error('Error saving note to Firebase:', error);
        note.syncStatus = 'pending';
        this.saveNoteToLocalStorage(note);
        this.addPendingSync('note', note.id);
        return of(note);
      })
    );
  }

  /**
   * Get all notes from Firebase (if authenticated) or localStorage
   */
  getNotes(): Observable<Note[]> {
    if (!this.isAuthenticated()) {
      return of(this.getNotesFromLocalStorage());
    }

    const userId = this.getUserId()!;
    const notesRef = collection(this.firestore, `users/${userId}/tafsir_notes`);
    const q = query(notesRef, orderBy('createdAt', 'desc'));

    return from(getDocs(q)).pipe(
      map(snapshot => {
        const notes: Note[] = [];
        snapshot.forEach(doc => {
          notes.push(this.deserializeFromFirestore(doc.data()) as Note);
        });
        this.saveNotesToLocalStorage(notes);
        return notes;
      }),
      catchError(error => {
        console.error('Error fetching notes from Firebase:', error);
        return of(this.getNotesFromLocalStorage());
      })
    );
  }

  /**
   * Delete note from Firebase and localStorage
   */
  deleteNote(noteId: string): Observable<void> {
    this.deleteNoteFromLocalStorage(noteId);

    if (!this.isAuthenticated()) {
      return of(undefined);
    }

    const userId = this.getUserId()!;
    const noteRef = doc(this.firestore, `users/${userId}/tafsir_notes/${noteId}`);

    return from(deleteDoc(noteRef)).pipe(
      map(() => undefined),
      catchError(error => {
        console.error('Error deleting note from Firebase:', error);
        return of(undefined);
      })
    );
  }

  // ==================== HIGHLIGHTS ====================

  /**
   * Save highlight to Firebase (if authenticated) and localStorage
   */
  saveHighlight(highlight: Highlight): Observable<Highlight> {
    this.saveHighlightToLocalStorage(highlight);

    if (!this.isAuthenticated()) {
      highlight.syncStatus = 'local-only';
      return of(highlight);
    }

    const userId = this.getUserId()!;
    highlight.userId = userId;
    const highlightRef = doc(this.firestore, `users/${userId}/tafsir_highlights/${highlight.id}`);

    return from(setDoc(highlightRef, this.serializeForFirestore(highlight))).pipe(
      map(() => {
        highlight.syncStatus = 'synced';
        this.saveHighlightToLocalStorage(highlight);
        return highlight;
      }),
      catchError(error => {
        console.error('Error saving highlight to Firebase:', error);
        highlight.syncStatus = 'pending';
        this.saveHighlightToLocalStorage(highlight);
        this.addPendingSync('highlight', highlight.id);
        return of(highlight);
      })
    );
  }

  /**
   * Get all highlights from Firebase (if authenticated) or localStorage
   */
  getHighlights(): Observable<Highlight[]> {
    if (!this.isAuthenticated()) {
      return of(this.getHighlightsFromLocalStorage());
    }

    const userId = this.getUserId()!;
    const highlightsRef = collection(this.firestore, `users/${userId}/tafsir_highlights`);
    const q = query(highlightsRef, orderBy('createdAt', 'desc'));

    return from(getDocs(q)).pipe(
      map(snapshot => {
        const highlights: Highlight[] = [];
        snapshot.forEach(doc => {
          highlights.push(this.deserializeFromFirestore(doc.data()) as Highlight);
        });
        this.saveHighlightsToLocalStorage(highlights);
        return highlights;
      }),
      catchError(error => {
        console.error('Error fetching highlights from Firebase:', error);
        return of(this.getHighlightsFromLocalStorage());
      })
    );
  }

  /**
   * Delete highlight from Firebase and localStorage
   */
  deleteHighlight(highlightId: string): Observable<void> {
    this.deleteHighlightFromLocalStorage(highlightId);

    if (!this.isAuthenticated()) {
      return of(undefined);
    }

    const userId = this.getUserId()!;
    const highlightRef = doc(this.firestore, `users/${userId}/tafsir_highlights/${highlightId}`);

    return from(deleteDoc(highlightRef)).pipe(
      map(() => undefined),
      catchError(error => {
        console.error('Error deleting highlight from Firebase:', error);
        return of(undefined);
      })
    );
  }

  // ==================== SYNC & MIGRATION ====================

  /**
   * Sync all pending changes from localStorage to Firebase
   */
  syncPendingChanges(): Observable<void> {
    if (!this.isAuthenticated() || !this.isOnline$.value) {
      return of(undefined);
    }

    this.updateSyncStatus({ isSyncing: true });

    const bookmarks = this.getBookmarksFromLocalStorage().filter(b => b.syncStatus === 'pending');
    const notes = this.getNotesFromLocalStorage().filter(n => n.syncStatus === 'pending');
    const highlights = this.getHighlightsFromLocalStorage().filter(h => h.syncStatus === 'pending');

    const syncTasks = [
      ...bookmarks.map(b => this.saveBookmark(b)),
      ...notes.map(n => this.saveNote(n)),
      ...highlights.map(h => this.saveHighlight(h))
    ];

    return from(Promise.all(syncTasks.map(task => task.toPromise()))).pipe(
      map(() => {
        this.updateSyncStatus({
          isSyncing: false,
          pendingBookmarks: 0,
          pendingNotes: 0,
          pendingHighlights: 0,
          lastSyncAt: new Date().toISOString()
        });
        console.log('✅ Sync complete!');
      }),
      catchError(error => {
        console.error('Error during sync:', error);
        this.updateSyncStatus({
          isSyncing: false,
          errors: [`Sync failed: ${error.message}`]
        });
        return of(undefined);
      })
    );
  }

  /**
   * Migrate localStorage data to Firebase (for when user logs in)
   */
  migrateLocalDataToFirebase(): Observable<{ bookmarks: number; notes: number; highlights: number }> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('User must be authenticated to migrate data'));
    }

    const bookmarks = this.getBookmarksFromLocalStorage();
    const notes = this.getNotesFromLocalStorage();
    const highlights = this.getHighlightsFromLocalStorage();

    const userId = this.getUserId()!;

    // Update all items with userId
    bookmarks.forEach(b => b.userId = userId);
    notes.forEach(n => n.userId = userId);
    highlights.forEach(h => h.userId = userId);

    const migrationTasks = [
      ...bookmarks.map(b => this.saveBookmark(b)),
      ...notes.map(n => this.saveNote(n)),
      ...highlights.map(h => this.saveHighlight(h))
    ];

    return from(Promise.all(migrationTasks.map(task => task.toPromise()))).pipe(
      map(() => ({
        bookmarks: bookmarks.length,
        notes: notes.length,
        highlights: highlights.length
      }))
    );
  }

  // ==================== LOCALSTORAGE HELPERS ====================

  private saveBookmarkToLocalStorage(bookmark: Bookmark): void {
    const bookmarks = this.getBookmarksFromLocalStorage();
    const index = bookmarks.findIndex(b => b.id === bookmark.id);
    if (index >= 0) {
      bookmarks[index] = bookmark;
    } else {
      bookmarks.push(bookmark);
    }
    localStorage.setItem('tafsir_bookmarks', JSON.stringify(bookmarks));
  }

  private getBookmarksFromLocalStorage(): Bookmark[] {
    const data = localStorage.getItem('tafsir_bookmarks');
    return data ? JSON.parse(data) : [];
  }

  private saveBookmarksToLocalStorage(bookmarks: Bookmark[]): void {
    localStorage.setItem('tafsir_bookmarks', JSON.stringify(bookmarks));
  }

  private deleteBookmarkFromLocalStorage(bookmarkId: string): void {
    const bookmarks = this.getBookmarksFromLocalStorage().filter(b => b.id !== bookmarkId);
    localStorage.setItem('tafsir_bookmarks', JSON.stringify(bookmarks));
  }

  private saveNoteToLocalStorage(note: Note): void {
    const notes = this.getNotesFromLocalStorage();
    const index = notes.findIndex(n => n.id === note.id);
    if (index >= 0) {
      notes[index] = note;
    } else {
      notes.push(note);
    }
    localStorage.setItem('tafsir_notes', JSON.stringify(notes));
  }

  private getNotesFromLocalStorage(): Note[] {
    const data = localStorage.getItem('tafsir_notes');
    return data ? JSON.parse(data) : [];
  }

  private saveNotesToLocalStorage(notes: Note[]): void {
    localStorage.setItem('tafsir_notes', JSON.stringify(notes));
  }

  private deleteNoteFromLocalStorage(noteId: string): void {
    const notes = this.getNotesFromLocalStorage().filter(n => n.id !== noteId);
    localStorage.setItem('tafsir_notes', JSON.stringify(notes));
  }

  private saveHighlightToLocalStorage(highlight: Highlight): void {
    const highlights = this.getHighlightsFromLocalStorage();
    const index = highlights.findIndex(h => h.id === highlight.id);
    if (index >= 0) {
      highlights[index] = highlight;
    } else {
      highlights.push(highlight);
    }
    localStorage.setItem('tafsir_highlights', JSON.stringify(highlights));
  }

  private getHighlightsFromLocalStorage(): Highlight[] {
    const data = localStorage.getItem('tafsir_highlights');
    return data ? JSON.parse(data) : [];
  }

  private saveHighlightsToLocalStorage(highlights: Highlight[]): void {
    localStorage.setItem('tafsir_highlights', JSON.stringify(highlights));
  }

  private deleteHighlightFromLocalStorage(highlightId: string): void {
    const highlights = this.getHighlightsFromLocalStorage().filter(h => h.id !== highlightId);
    localStorage.setItem('tafsir_highlights', JSON.stringify(highlights));
  }

  // ==================== UTILITY FUNCTIONS ====================

  private serializeForFirestore(obj: any): any {
    const serialized = { ...obj };
    // Remove undefined values and sync status
    Object.keys(serialized).forEach(key => {
      if (serialized[key] === undefined || key === 'syncStatus') {
        delete serialized[key];
      }
    });
    return serialized;
  }

  private deserializeFromFirestore(data: any): any {
    return {
      ...data,
      syncStatus: 'synced'
    };
  }

  private updateSyncStatus(updates: Partial<SyncStatus>): void {
    const current = this.syncStatus$.value;
    this.syncStatus$.next({ ...current, ...updates });
  }

  private addPendingSync(type: 'bookmark' | 'note' | 'highlight', id: string): void {
    const current = this.syncStatus$.value;
    if (type === 'bookmark') {
      current.pendingBookmarks++;
    } else if (type === 'note') {
      current.pendingNotes++;
    } else {
      current.pendingHighlights++;
    }
    this.syncStatus$.next({ ...current });
  }
}
