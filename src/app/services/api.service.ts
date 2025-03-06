import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

interface TafsirResponse {
  explanation: string;
  context: string;
  modernApplication: string;
  relatedHadith?: string[];
}

interface AIPrompt {
  systemMessage: string;
  userMessage: string;
  temperature: number;
  maxTokens: number;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = 'http://localhost:3000/api'; // Update for production

  constructor(private http: HttpClient) {}

  // OpenAI endpoints
  generateAIResponse(prompt: AIPrompt): Observable<any> {
    return this.http.post<TafsirResponse>(`${this.baseUrl}/ai/generate`, { prompt });
  }

  // STT endpoints
  transcribeAudio(audioData: string) {
    return this.http.post(`${this.baseUrl}/stt/transcribe`, { audioData });
  }

  // Quran API endpoints
  getVerse(surah: number, ayah: number) {
    return this.http.get(`${this.baseUrl}/quran/verse/${surah}/${ayah}`);
  }

  getTafsir(surah: number, ayah: number) {
    return this.http.get(`${this.baseUrl}/quran/tafsir/${surah}/${ayah}`);
  }
} 