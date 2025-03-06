import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

interface TafsirResponse {
  explanation: string;
  context: string;
  modernApplication: string;
  relatedHadith?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class TafsirService {  
  constructor(private http: HttpClient, private apiService: ApiService) {}

  generateTafsir(dua: string, translation: string): Observable<TafsirResponse> {
    const prompt = {
      systemMessage: "You are a knowledgeable Islamic scholar specializing in tafsir. Format your responses in clear markdown with headers, lists, and emphasis where appropriate.",
      userMessage: `
        As a knowledgeable Islamic scholar, provide a comprehensive tafsir for this dua:
        
        Arabic: ${dua}
        Translation: ${translation}
        
        Format your response in the following structure:
        
        # Detailed Explanation
        [Provide a clear, detailed explanation of the dua's meaning and significance]

        # Historical Context
        [Explain when and why this dua was revealed/taught, and its historical significance]

        # Modern Applications
        [List 3-4 practical ways Muslims can apply this dua in contemporary life]

        # Related Hadith
        [Share relevant hadith with authentic sources, if applicable]

        # Special Notes
        [Any special virtues, times of recitation, or additional benefits]

        Use markdown formatting for better readability.
      `,
      temperature: 0.7,
      maxTokens: 1000
    };

    return this.apiService.generateAIResponse(prompt);
  }
} 