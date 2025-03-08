import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { Dua } from './dua.service';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';

export interface AIResponse {
  content: string;
  virtues?: string;
  application?: string;
  context?: string;
  related?: string;
  impact?: string;
  explanation?: string;
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
  
  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private apiService: ApiService
  ) {}

  generateDuaInsights(dua: Dua): Observable<AIResponse> {
    const prompt = {
      systemMessage: `You are a knowledgeable Islamic scholar specializing in duas and their deeper meanings. 
      Analyze the following dua and provide comprehensive insights in this format:

      Content:
      [Detailed explanation of the dua's meaning, significance, and spiritual dimensions]

      Virtues & Benefits:
      • [List specific virtues and benefits, with references]
      • [Include both worldly and spiritual benefits]
      • [Mention specific situations when this dua is especially beneficial]

      Practical Application:
      • [How to implement this dua in daily life]
      • [Best times and situations to recite it]
      • [Proper method of recitation and any specific conditions]
      • [How to maximize its benefits]

      Historical Context:
      [Detailed background about when and why this dua was revealed/taught, including specific historical events and circumstances]

      Related Verses & Hadith:
      • [Relevant Quranic verses with full references]
      • [Related authentic hadith with complete chain and source]
      • [Similar duas or complementary supplications]

      Ensure all Arabic text is properly formatted, all references are specific and complete, and the content is both scholarly and accessible.`,
      userMessage: `Please analyze this dua:
      
      Arabic: ${dua.arabic}
      Translation: ${dua.translation}
      Reference: ${dua.reference}
      
      Provide comprehensive insights following the specified format.`,
      temperature: 0.4,
      maxTokens: 2000
    };

    return this.apiService.generateAIResponse(prompt);
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
    const prompt = {
      systemMessage: `You are a Islamic scholar specializing in Islamic reflection and personal development.
      Provide deep, meaningful reflection points for this dua in the following format:

      Content:
      [3-4 thought-provoking questions or points for personal reflection based on the dua's themes]

      Spiritual Impact:
      • [How this dua can transform one's relationship with Allah]
      • [The emotional and spiritual growth it can facilitate]
      • [Long-term benefits of incorporating it into daily practice]
      • [How it connects to broader Islamic principles]

      Each section should be detailed, specific, and include relevant Quranic verses or hadith as supporting evidence.
      Keep the tone warm and inspiring while maintaining scholarly depth.`,
      userMessage: `Please generate reflection prompts for this dua:
      
      Arabic: ${dua.arabic}
      Translation: ${dua.translation}
      
      Provide comprehensive reflection points following the specified format.`,
      temperature: 0.4,
      maxTokens: 1500
    };

    return this.apiService.generateAIResponse(prompt);
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
        content: coreResponse.explanation || '',
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
      console.log('Getting auth token...');
      const token = await this.authService.getToken();
      
      if (!token) {
        console.error('Failed to get authentication token');
        throw new Error('No authentication token available');
      }
      
      console.log('Making API request with token...');
      const response = await this.http.post<AIGenerateResponse>(
        this.apiUrl, 
        { prompt },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      ).toPromise();
      
      if (!response?.content) {
        console.error('Invalid response format:', response);
        throw new Error('Invalid response format from server');
      }

      console.log('Successfully received API response');
      return this.parseAIResponse(response.content);
    } catch (error: any) {
      console.error('API error:', error);
      if (error.status === 401) {
        console.error('Authentication failed - please ensure you are logged in');
      }
      throw error;
    }
  }

  private parseAIResponse(content: string): AIResponse {
    try {
      // Try to parse as JSON first
      const jsonResponse = JSON.parse(content);
      
      // Format related verses and hadith into readable text
      const formatRelatedContent = (related: any) => {
        if (!related) return '';
        const verses = related.related_verses?.join('\n• ') || '';
        const hadith = related.related_hadith?.join('\n• ') || '';
        return `${verses ? 'Related Verses:\n• ' + verses : ''}\n${hadith ? '\nRelated Hadith:\n• ' + hadith : ''}`;
      };

      return {
        content: jsonResponse.key_insights_and_main_message || '',
        virtues: jsonResponse.virtues_and_benefits || '',
        application: jsonResponse.practical_application_in_modern_life || '',
        context: jsonResponse.historical_context || '',
        related: formatRelatedContent(jsonResponse.related_verses_and_hadith),
        impact: typeof jsonResponse.spiritual_impact === 'object' 
          ? JSON.stringify(jsonResponse.spiritual_impact) 
          : jsonResponse.spiritual_impact || '',
        explanation: jsonResponse.explanation || '',
        relatedVerses: jsonResponse.related_verses || [],
        historicalContext: jsonResponse.historical_context || '',
        reflectionPoints: jsonResponse.reflection_points || [],
        modernApplication: jsonResponse.modern_application || ''
      };
    } catch {
      // Fallback to text parsing if not JSON
      const sections = content.split('\n\n');
      return {
        content: sections[0] || '',
        explanation: sections[0] || '',
        relatedVerses: sections[1]?.split('\n'),
        historicalContext: sections[2] || '',
        reflectionPoints: sections[3]?.split('\n'),
        modernApplication: sections[4] || ''
      };
    }
  }

  private generateAIResponse(prompt: AIRequestPrompt): Observable<AIResponse> {
    return from(this.getCompletion(prompt));
  }
} 