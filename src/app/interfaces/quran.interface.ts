export interface QuranVerse {
  number: number;
  surahNumber: number;
  text: string;
  translation: string;
  transliteration?: string;
  audio?: string;
  words?: Array<{
    text: string;
    translation: string;
    transliteration: string;
    audioUrl?: string;
  }>;
}

export interface Word {
  text: string;
  translation: string;
}

export interface Surah {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
}

export interface Reciter {
  id: number;
  name: string;
  style?: string;
  identifier: string;
}

export interface Translation {
  id: string;
  name: string;
  language: string;
  type: string;
}

export interface SearchSuggestion {
  type: 'surah' | 'verse';
  name?: string;
  translation: string;
  number?: number;
  surahNumber?: string;
  verseNumber?: string;
  text?: string;
  highlightedText?: string;
}

export interface MushafPage {
  page: number;
  imageUrl: string;
  ayahs?: any[];
}

export interface QuranReaderPreferences {
  selectedReciter: Reciter;
  selectedTranslation: string;
  selectedTafsir: string;
  isDarkMode: boolean;
  isMushafView: boolean;
  isDoublePageView: boolean;
  showWordByWord: boolean;
  fontSize: number;
  arabicFont: 'uthmani' | 'naskh';
}

export interface WordDetails {
  text_uthmani: string;
  text_indopak: string;
  translation: { text: string };
  transliteration: { text: string };
  root: { text: string };
  lemma: { text: string };
  grammar: {
    tag: string;
  };
}

export interface MushafContent {
  page: number;
  surah: number;
  ayahs: any[];
  pageImageUrl: string;
}

export interface Juz {
  id: number;
  juzNumber: number;
  verseMapping: {
    startSurah: number;
    startAyah: number;
    endSurah: number;
    endAyah: number;
  };
}

export interface SurahResponse {
  verse?: {
    page: number;
  };
} 