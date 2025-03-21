export interface ReadingHistory {
  surah: number;
  verse: number;
  timestamp: Date;
  userId: string;
}

export interface ReadingHistoryResponse {
  success: boolean;
  message?: string;
  history: ReadingHistory[];
} 