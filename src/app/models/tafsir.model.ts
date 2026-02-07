/**
 * Tafsir Data Models
 * Comprehensive interfaces for Kindle-style Tafsir Reader
 */

export interface TafsirEdition {
  id: string;                    // Unique identifier
  name: string;                  // e.g., "Tafsir Ibn Kathir"
  nameArabic?: string;           // Arabic name
  author: string;                // Scholar name
  authorArabic?: string;
  language: string;              // ISO code (en, ar, ur, so, etc.)
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  totalPages?: number;
  coverImage?: string;
  source: 'quranhub' | 'local' | 'qurancdn' | 'other';
  sourceId?: string;             // External API ID
  isOfflineAvailable: boolean;
  isPremium?: boolean;           // Requires premium subscription
  lastUpdated: Date;
  tags: string[];                // ['classical', 'modern', 'scholarly']
  rating?: number;               // User rating (1-5)
  downloads?: number;            // Number of times downloaded
}

export interface TafsirContent {
  editionId: string;
  surah: number;
  verse: number;
  text: string;                  // Main tafsir text
  textArabic?: string;          // For bilingual editions
  footnotes?: TafsirFootnote[];
  references?: TafsirReference[];
  wordCount: number;
  estimatedReadTime: number;     // in minutes
}

export interface TafsirFootnote {
  id: string;
  number: number;
  text: string;
  position: number;              // Character position in main text
}

export interface TafsirReference {
  type: 'verse' | 'hadith' | 'scholar' | 'other';
  reference: string;
  link?: string;
  verseKey?: string;             // For verse references (e.g., "2:255")
}

export interface TafsirBookmark {
  id: string;
  userId: string;
  editionId: string;
  surah: number;
  verse: number;
  pageNumber?: number;
  title?: string;                // User-given title
  tags: string[];
  color: string;                 // Bookmark color (#hex)
  createdAt: Date;
  lastAccessed: Date;
  notes?: string;                // Quick note with bookmark
  position?: number;             // Scroll position for exact location
}

export interface TafsirNote {
  id: string;
  userId: string;
  editionId: string;
  surah: number;
  verse: number;
  content: string;               // Rich text (HTML)
  highlights: NoteHighlight[];
  tags: string[];
  isPrivate: boolean;
  createdAt: Date;
  updatedAt: Date;
  sharedWith?: string[];         // User IDs for shared notes
}

export interface NoteHighlight {
  id: string;
  text: string;
  startOffset: number;
  endOffset: number;
  color: string;                 // Highlight color (#hex)
  note?: string;                 // Optional note for this highlight
}

export interface ReadingProgress {
  userId: string;
  editionId: string;
  surah: number;
  verse: number;
  scrollPosition?: number;
  lastReadAt: Date;
  totalReadTime: number;         // in seconds
  completedVerses: string[];     // Format: "2:255"
  completionPercentage: number;
  currentStreak: number;         // Days
  longestStreak: number;         // Days
}

export interface TafsirSearchResult {
  editionId: string;
  editionName: string;
  surah: number;
  verse: number;
  text: string;
  highlightedText: string;       // Text with <mark> tags around matches
  relevance: number;             // Search relevance score (0-1)
}

export interface DownloadProgress {
  editionId: string;
  totalVerses: number;
  downloadedVerses: number;
  percentage: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  error?: string;
}

export interface UserPreferences {
  userId: string;
  fontFamily: 'serif' | 'sans-serif' | 'amiri' | 'traditional-arabic';
  fontSize: number;              // 14-26px
  lineHeight: number;            // 1.0-2.5
  textAlign: 'left' | 'right' | 'justify';
  maxWidth: number;              // 600-900px or 0 for full width
  margin: number;                // 20-80px
  theme: 'light' | 'dark' | 'sepia' | 'night';
  viewMode: 'single' | 'split' | 'verse-on-demand';
  showArabicVerse: boolean;
  enableKeyboardShortcuts: boolean;
  autoBookmarkLastRead: boolean;
  syncWithQuranReader: boolean;
  offlineMode: boolean;
}

export interface TafsirEditionStats {
  editionId: string;
  totalReads: number;
  totalBookmarks: number;
  totalNotes: number;
  totalHighlights: number;
  averageRating: number;
  totalRatings: number;
  popularVerses: Array<{
    surah: number;
    verse: number;
    reads: number;
  }>;
}

// API Response types
export interface QuranHubEditionsResponse {
  editions: Array<{
    id: number;
    name: string;
    author: string;
    language: string;
    direction: 'ltr' | 'rtl';
    type: 'tafsir' | 'translation' | 'transliteration';
  }>;
}

export interface QuranHubTafsirResponse {
  tafsir: {
    id: number;
    text: string;
    verse_key: string;
  };
}

export interface QuranCDNTafsirResponse {
  tafsir: {
    text: string;
    resource_name: string;
    language_name: string;
  };
}
