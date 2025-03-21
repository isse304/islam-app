export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  token: string;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string;
}

export interface UserPreferences {
  userId: string;
  selectedReciter: number;
  selectedTranslation: string;
  fontSize: number;
  isDarkMode: boolean;
  arabicFont: string;
  showWordByWord: boolean;
  isMushafView: boolean;
  isDoublePageView: boolean;
  lastState?: {
    lastSurah: number;
    lastVerse: number;
    isMushafView: boolean;
    timestamp: Date;
  };
  readingHistory?: Array<{
    surah: number;
    verse: number;
    timestamp: string;
  }>;
}

export interface ReadingHistoryEntry {
  surah: number;
  verse: number;
  timestamp: string;
}

export interface ReadingHistoryResponse {
  success: boolean;
  history: ReadingHistoryEntry[];
  error?: any;
}

export interface UserPreferencesResponse {
  success: boolean;
  preferences: UserPreferences;
  error?: any;
} 