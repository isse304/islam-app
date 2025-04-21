export interface ReadingHistory {
  type?: 'verse' | 'page';
  surah?: number;
  verse?: number;
  page?: number;
  displayPage?: number;
  timestamp: Date;
}

export interface ReadingHistoryResponse {
  success: boolean;
  message?: string;
  history: ReadingHistory[];
} 