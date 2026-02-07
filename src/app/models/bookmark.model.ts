/**
 * Data models for Tafsir bookmarks, notes, and highlights
 * Supports both Firebase sync and localStorage fallback
 */

export interface Bookmark {
  id: string;
  userId?: string; // Firebase UID (if logged in)
  editionId: string;
  surah: number;
  verse: number;
  verseText: string; // Cached for quick display
  tafsirExcerpt?: string; // First 100 chars of tafsir
  tags: string[];
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string;
  syncStatus?: 'synced' | 'pending' | 'local-only';
}

export interface Note {
  id: string;
  userId?: string;
  editionId: string;
  surah: number;
  verse: number;
  content: string; // Rich HTML content
  plainText: string; // For search (auto-generated from content)
  tags: string[];
  isPrivate: boolean;
  attachments?: NoteAttachment[];
  createdAt: string;
  updatedAt: string;
  syncStatus?: 'synced' | 'pending' | 'local-only';
}

export interface NoteAttachment {
  id: string;
  type: 'image' | 'audio' | 'link';
  url: string;
  name: string;
  size?: number; // in bytes
}

export interface Highlight {
  id: string;
  userId?: string;
  editionId: string;
  surah: number;
  verse: number;
  text: string; // The highlighted text
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'orange' | 'red' | 'purple';
  startOffset: number; // Character offset in the verse text
  endOffset: number;
  note?: string; // Optional quick note on the highlight
  createdAt: string;
  updatedAt: string;
  syncStatus?: 'synced' | 'pending' | 'local-only';
}

export interface BookmarkFilter {
  editionId?: string;
  surah?: number;
  verse?: number;
  tags?: string[];
  color?: string;
  searchQuery?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface NoteFilter {
  editionId?: string;
  surah?: number;
  verse?: number;
  tags?: string[];
  searchQuery?: string;
  isPrivate?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

export interface Tag {
  name: string;
  count: number;
  color?: string;
  createdAt: string;
}

export interface BookmarkStats {
  totalBookmarks: number;
  totalNotes: number;
  totalHighlights: number;
  mostBookmarkedSurah: number;
  recentActivity: Date;
  tags: Tag[];
}

export interface SyncStatus {
  lastSyncAt: string;
  pendingBookmarks: number;
  pendingNotes: number;
  pendingHighlights: number;
  isSyncing: boolean;
  errors: string[];
}

// Helper functions for working with bookmarks
export class BookmarkHelpers {
  /**
   * Generate a unique ID for a bookmark/note/highlight
   */
  static generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create a bookmark reference string (e.g., "1:1" for Al-Fatiha verse 1)
   */
  static getReference(surah: number, verse: number): string {
    return `${surah}:${verse}`;
  }

  /**
   * Parse a reference string into surah and verse numbers
   */
  static parseReference(ref: string): { surah: number; verse: number } | null {
    const match = ref.match(/^(\d+):(\d+)$/);
    if (!match) return null;
    return {
      surah: parseInt(match[1], 10),
      verse: parseInt(match[2], 10)
    };
  }

  /**
   * Extract plain text from HTML content (for notes)
   */
  static stripHtml(html: string): string {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  /**
   * Truncate text to a specific length
   */
  static truncate(text: string, maxLength: number = 100): string {
    if (text.length <= maxLength) return text;
    return text.substr(0, maxLength).trim() + '...';
  }

  /**
   * Get a color hex value for bookmark colors
   */
  static getColorHex(color: Bookmark['color']): string {
    const colors: Record<Bookmark['color'], string> = {
      blue: '#2196F3',
      green: '#4CAF50',
      yellow: '#FFC107',
      red: '#F44336',
      purple: '#9C27B0'
    };
    return colors[color] || colors.blue;
  }

  /**
   * Get a color hex value for highlight colors
   */
  static getHighlightColorHex(color: Highlight['color']): string {
    const colors: Record<Highlight['color'], string> = {
      yellow: '#FFF59D',
      green: '#A5D6A7',
      blue: '#90CAF9',
      pink: '#F48FB1',
      orange: '#FFAB91',
      red: '#EF9A9A',
      purple: '#CE93D8'
    };
    return colors[color] || colors.yellow;
  }

  /**
   * Sort bookmarks by date (newest first)
   * Generic method that preserves the input array type
   */
  static sortByDate<T extends Bookmark | Note | Highlight>(items: T[], desc = true): T[] {
    return items.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return desc ? dateB - dateA : dateA - dateB;
    });
  }

  /**
   * Group bookmarks by surah
   */
  static groupBySurah(bookmarks: Bookmark[]): Map<number, Bookmark[]> {
    const grouped = new Map<number, Bookmark[]>();
    bookmarks.forEach(bookmark => {
      const surahBookmarks = grouped.get(bookmark.surah) || [];
      surahBookmarks.push(bookmark);
      grouped.set(bookmark.surah, surahBookmarks);
    });
    return grouped;
  }

  /**
   * Search bookmarks/notes by query
   */
  static search<T extends Bookmark | Note>(
    items: T[],
    query: string,
    fields: (keyof T)[] = ['verseText', 'plainText', 'tags'] as (keyof T)[]
  ): T[] {
    const lowerQuery = query.toLowerCase();
    return items.filter(item => {
      return fields.some(field => {
        const value = item[field];
        if (typeof value === 'string') {
          return value.toLowerCase().includes(lowerQuery);
        }
        if (Array.isArray(value)) {
          return value.some(v => 
            typeof v === 'string' && v.toLowerCase().includes(lowerQuery)
          );
        }
        return false;
      });
    });
  }

  /**
   * Search highlights by text content
   */
  static searchHighlights(highlights: Highlight[], query: string): Highlight[] {
    const lowerQuery = query.toLowerCase();
    return highlights.filter(h => 
      h.text.toLowerCase().includes(lowerQuery) ||
      (h.note && h.note.toLowerCase().includes(lowerQuery))
    );
  }
}
