export interface Bookmark {
  surah: number;
  verse: number;
  timestamp: Date;
  userId: string;
}

export interface BookmarkResponse {
  success: boolean;
  message: string;
  bookmarks: string[];  // Format: "surah:verse"
} 