import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { environment } from '../../environments/environment';
import { Dua } from './dua.service';

export interface AIResponse {
  explanation: string;
  relatedVerses?: string[];
  historicalContext?: string;
  reflectionPoints?: string[];
  modernApplication?: string;
}

interface AIRequestPrompt {
  systemMessage: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
}

interface AIGenerateResponse {
  content: string;
}

@Injectable({
  providedIn: 'root'
})
export class OpenAIService {
  private readonly apiUrl = `${environment.apiUrl}/ai/generate`;
  
  // Temperature settings for different types of content
  private readonly TEMPERATURES = {
    CORE_RELIGIOUS: 0,    // For Quranic verses, basic explanations, historical facts
    DYNAMIC: 0.6,          // For modern applications, contextual explanations
    CREATIVE: 0.8          // For reflections, alternative interpretations
  };
  
  constructor(private http: HttpClient) {}

  generateDuaInsights(dua: Dua): Observable<AIResponse> {
    // Split the request into multiple calls with different temperatures
    const corePrompt: AIRequestPrompt = {
      systemMessage: 'You are a knowledgeable Islamic scholar with expertise in Quran, Hadith, and Islamic spirituality.',
      userMessage: `Provide core religious insights about this dua:
      
      Title: ${dua.title}
      Arabic: ${dua.arabic}
      Translation: ${dua.translation}
      Reference: ${dua.reference}
      
      Please provide:
      1. A detailed explanation of the dua's meaning and significance
      2. Related Quranic verses or Hadith that complement this dua
      3. Historical context of when/why this dua was revealed or taught
      
      Format the response in clear sections.`,
      temperature: this.TEMPERATURES.CORE_RELIGIOUS,
      maxTokens: 800
    };

    const dynamicPrompt: AIRequestPrompt = {
      systemMessage: 'You are a knowledgeable Islamic scholar with expertise in modern applications of Islamic teachings.',
      userMessage: `Provide modern insights about this dua:
      
      Title: ${dua.title}
      Translation: ${dua.translation}
      
      Please provide:
      1. Key reflection points for modern Muslims
      2. Practical ways to implement the dua's teachings in modern life
      
      Format the response in clear sections.`,
      temperature: this.TEMPERATURES.DYNAMIC,
      maxTokens: 600
    };

    return from(this.getCombinedCompletion(corePrompt, dynamicPrompt));
  }

  suggestDuasByContext(situation: string, emotions: string[]): Observable<AIResponse> {
    const prompt: AIRequestPrompt = {
      systemMessage: 'You are a knowledgeable Islamic scholar with expertise in Quran, Hadith, and Islamic spirituality.',
      userMessage: `Recommend suitable duas for this situation:
      
      Context: ${situation}
      Emotions: ${emotions.join(', ')}
      
      Please provide:
      1. Recommended duas with their significance
      2. Why these duas are particularly suitable
      3. How to best utilize these duas in this situation
      4. Additional spiritual advice for this context
      
      Format the response in clear sections.`,
      temperature: this.TEMPERATURES.DYNAMIC,
      maxTokens: 1000
    };

    return from(this.getCompletion(prompt));
  }

  generateReflectionPrompts(dua: Dua): Observable<AIResponse> {
    const prompt: AIRequestPrompt = {
      systemMessage: 'You are a knowledgeable Islamic scholar with expertise in Quran, Hadith, and Islamic spirituality.',
      userMessage: `Create thoughtful reflection prompts for this dua:
      
      Title: ${dua.title}
      Translation: ${dua.translation}
      
      Please provide:
      1. 3-5 deep reflection questions
      2. Personal development aspects to consider
      3. Practical ways to implement the dua's teachings
      4. Connections to daily life situations
      
      Format the response in clear sections.`,
      temperature: this.TEMPERATURES.CREATIVE,
      maxTokens: 1000
    };

    return from(this.getCompletion(prompt));
  }

  private async getCombinedCompletion(corePrompt: AIRequestPrompt, dynamicPrompt: AIRequestPrompt): Promise<AIResponse> {
    try {
      // Get both responses in parallel
      const [coreResponse, dynamicResponse] = await Promise.all([
        this.getCompletion(corePrompt),
        this.getCompletion(dynamicPrompt)
      ]);

      // Combine the responses
      return {
        explanation: coreResponse.explanation,
        relatedVerses: coreResponse.relatedVerses,
        historicalContext: coreResponse.historicalContext,
        reflectionPoints: dynamicResponse.reflectionPoints,
        modernApplication: dynamicResponse.modernApplication
      };
    } catch (error) {
      console.error('Error in combined completion:', error);
      throw error;
    }
  }

  private async getCompletion(prompt: AIRequestPrompt): Promise<AIResponse> {
    try {
      const response = await this.http.post<AIGenerateResponse>(this.apiUrl, { prompt }).toPromise();
      
      if (!response?.content) {
        throw new Error('Invalid response format from server');
      }

      return this.parseAIResponse(response.content);
    } catch (error) {
      console.error('API error:', error);
      throw error;
    }
  }

  private parseAIResponse(content: string): AIResponse {
    const sections = content.split('\n\n');
    
    return {
      explanation: sections[0] || '',
      relatedVerses: sections[1]?.split('\n'),
      historicalContext: sections[2] || '',
      reflectionPoints: sections[3]?.split('\n'),
      modernApplication: sections[4] || ''
    };
  }
} 