import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, from, throwError, firstValueFrom, retry } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';
import { FirebaseAuthService } from './firebase-auth.service';

interface TafsirResponse {
  explanation: string;
  context: string;
  modernApplication: string;
  relatedHadith?: string[];
}

interface AIPrompt {
  userMessage: string;
  systemMessage?: string;
  temperature?: number;
  maxTokens?: number;
}

interface AIResponse {
  success: boolean;
  content?: string;
  error?: string;
  message?: string;
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
  insights?: string;
}

interface CheckoutResponse {
  url: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private authService: FirebaseAuthService,
    private notificationService: NotificationService
  ) {}

  // Premium features
  async generateAIResponse(prompt: AIPrompt | string): Promise<AIResponse> {
    try {
        // Check if user is authenticated
        const isAuth = await this.authService.isAuthenticated();
        if (!isAuth) {
            this.notificationService.warning('Please sign in to use AI features');
            throw new Error('Authentication required');
        }

        // Get auth token
        const token = await this.authService.getToken();
        if (!token) {
            this.notificationService.error('Please sign in again');
            throw new Error('No auth token available');
        }

        // Prepare request body with optimized parameters for GPT-4
        const requestBody = {
            prompt: typeof prompt === 'string' ? prompt : prompt.userMessage,
            context: typeof prompt === 'string' ? undefined : prompt.systemMessage,
            temperature: typeof prompt === 'string' ? 0.7 : (prompt.temperature ?? 0.4), // Lower default temperature for more focused responses
            maxTokens: typeof prompt === 'string' ? 1000 : (prompt.maxTokens ?? 2000) // Higher default token limit for GPT-4
        };

        // Make API request
        const response = await firstValueFrom(
            this.http.post<AIResponse>(`${this.baseUrl}/api/ai/generate`, requestBody, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }).pipe(
                map((response: AIResponse) => {
                    if (!response.success) {
                        throw new Error(response.message || 'AI request failed');
                    }
                    return response;
                }),
                catchError((error: HttpErrorResponse) => {
                    let errorMessage = 'An error occurred while processing your request';
                    
                    if (error.status === 401) {
                        errorMessage = 'Please sign in to use AI features';
                    } else if (error.status === 403) {
                        if (error.error?.message?.includes('Premium')) {
                            errorMessage = 'Premium subscription required to use AI features';
                        } else if (error.error?.message?.includes('limit')) {
                            errorMessage = 'You have reached your AI request limit';
                        }
                    } else if (error.status === 429) {
                        errorMessage = 'Too many requests. Please try again later.';
                    } else if (error.status === 500 && error.error?.message?.includes('OpenAI')) {
                        // Add specific handling for GPT-4 quota or capacity errors
                        if (error.error.message.includes('capacity')) {
                            errorMessage = 'GPT-4 is currently at capacity. Please try again in a few minutes.';
                        } else if (error.error.message.includes('quota')) {
                            errorMessage = 'AI quota exceeded. Please try again later.';
                        } else {
                            errorMessage = 'AI service is temporarily unavailable. Please try again later.';
                        }
                    } else if (error.error?.message) {
                        errorMessage = error.error.message;
                    }
                    
                    this.notificationService.error(errorMessage);
                    throw error;
                })
            )
        );

        return response;
    } catch (error) {
        console.error('API Request Error:', error);
        throw error;
    }
  }

  // Free features
  getVerse(surah: number, ayah: number) {
    return from(this.makeRequest('get', `/quran/verse/${surah}/${ayah}`)).pipe(
      catchError(error => this.handleError(error))
    );
  }

  getTafsir(surah: number, ayah: number) {
    return from(this.makeRequest('get', `/quran/tafsir/${surah}/${ayah}`)).pipe(
      catchError(error => this.handleError(error))
    );
  }

  // STT endpoints
  transcribeAudio(audioData: string) {
    return from(this.makeRequest('post', '/stt/transcribe', { audioData })).pipe(
      catchError(error => this.handleError(error))
    );
  }

  // Specialized AI endpoints
  async generateDuaInsights(dua: any): Promise<AIResponse> {
    try {
      const token = await this.authService.getToken();
      if (!token) {
        this.notificationService.warning('Please sign in to use AI features');
        throw new Error('Authentication required');
      }

      const response = await firstValueFrom(
        this.http.post<AIResponse>(`${this.baseUrl}/api/ai/dua/insights`, { dua }, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }).pipe(
          retry({
            count: 3,
            delay: 1000,
            resetOnSuccess: true
          }),
          map(response => {
            if (!response.success) {
              throw new Error(response.message || 'Failed to generate insights');
            }

            // Add validation for GPT-4 specific JSON structure
            if (!response.content || typeof response.content !== 'string') {
              throw new Error('Invalid response format from AI service');
            }

            try {
              // Validate JSON structure if content is JSON string
              if (response.content.trim().startsWith('{')) {
                const parsed = JSON.parse(response.content);
                return {
                  ...response,
                  content: parsed.key_insights || parsed.understanding || response.content,
                  virtues: Array.isArray(parsed.virtues_and_benefits) 
                    ? parsed.virtues_and_benefits.join('\n') 
                    : parsed.virtues_and_benefits || '',
                  application: Array.isArray(parsed.practical_application)
                    ? parsed.practical_application.join('\n')
                    : parsed.practical_application || '',
                  context: parsed.historical_context || '',
                  impact: Array.isArray(parsed.spiritual_impact)
                    ? parsed.spiritual_impact.join('\n')
                    : parsed.spiritual_impact || '',
                  explanation: parsed.key_insights || parsed.understanding || '',
                  historicalContext: parsed.historical_context || '',
                  reflectionPoints: Array.isArray(parsed.reflection_points)
                    ? parsed.reflection_points
                    : [],
                  modernApplication: Array.isArray(parsed.practical_application)
                    ? parsed.practical_application.join('\n')
                    : parsed.practical_application || '',
                  relatedVerses: parsed.related_references?.verses?.map((v: any) => 
                    `${v.reference}: ${v.translation}`
                  ) || []
                };
              }
            } catch (e) {
              console.warn('Error parsing JSON response:', e);
              // Fall back to text response if JSON parsing fails
              return {
                ...response,
                content: response.content
              };
            }

            return response;
          }),
          catchError(error => {
            console.error('Error in dua insights request:', error);
            if (error.status === 401) {
              this.notificationService.error('Please sign in again to continue');
              this.authService.signOut();
            }
            throw error;
          })
        )
      );

      return response;
    } catch (error) {
      console.error('Error generating dua insights:', error);
      throw error;
    }
  }

  async generateEmotionalDuaResponse(emotion: string, context: string): Promise<AIResponse> {
    try {
      const token = await this.authService.getToken();
      if (!token) {
        this.notificationService.warning('Please sign in to use AI features');
        throw new Error('Authentication required');
      }

      const response = await firstValueFrom(
        this.http.post<any>(`${this.baseUrl}/api/ai/dua/emotional-search`, { emotion, context }, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }).pipe(
          map(response => {
            if (!response.success) {
              throw new Error(response.message || 'Failed to process emotional dua search');
            }

            // If response is already in the correct format, return it
            if (response.content && typeof response.content === 'string') {
              try {
                // Try to parse the content as JSON first
                const cleanedContent = response.content
                  .replace(/\n/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
                
                if (cleanedContent.startsWith('{')) {
                  const parsedContent = JSON.parse(cleanedContent);
                  return {
                    success: true,
                    content: parsedContent.understanding || '',
                    virtues: Array.isArray(parsedContent.recommended_duas) 
                      ? parsedContent.recommended_duas.map((d: any) => 
                          `${d.translation}\nVirtue: ${d.virtue}\nSource: ${d.source}`
                      ).join('\n\n')
                      : '',
                    application: Array.isArray(parsedContent.practical_steps)
                      ? parsedContent.practical_steps.join('\n')
                      : typeof parsedContent.practical_steps === 'string'
                        ? parsedContent.practical_steps
                        : '',
                    context: parsedContent.understanding || '',
                    related: this.formatRelatedContent(parsedContent.related_verses_hadith),
                    impact: parsedContent.prophetic_example || '',
                    explanation: parsedContent.understanding || '',
                    relatedVerses: parsedContent.related_verses_hadith?.verses?.map((v: any) => 
                      `${v.reference}: ${v.translation}`
                    ) || [],
                    historicalContext: parsedContent.prophetic_example || '',
                    reflectionPoints: response.reflectionPoints || [],
                    modernApplication: response.modernApplication || ''
                  };
                }
              } catch (e) {
                console.warn('Error parsing JSON response:', e);
                // Fall back to using the content as is
                return {
                  success: true,
                  content: response.content,
                  virtues: response.virtues || '',
                  application: response.application || '',
                  context: response.context || response.content || '',
                  related: response.related || '',
                  impact: response.impact || '',
                  explanation: response.explanation || response.content || '',
                  relatedVerses: response.relatedVerses || [],
                  historicalContext: response.historicalContext || '',
                  reflectionPoints: response.reflectionPoints || [],
                  modernApplication: response.modernApplication || ''
                };
              }
            }

            // Return the response as is if it's already in the correct format
            return response;
          })
        )
      );

      return response;
    } catch (error) {
      console.error('Error in emotional dua search:', error);
      throw error;
    }
  }

  // Helper method to format related content
  private formatRelatedContent(refs: any): string {
    if (!refs) return '';
    let result = '';
    
    // Format verses
    if (refs?.verses?.length) {
      result += '**Quranic Verses:**\n\n';
      refs.verses.forEach((verse: any) => {
        result += `• **${verse.reference}**\n`;
        if (verse.translation) result += `  ${verse.translation}\n`;
        if (verse.relevance) result += `  - ${verse.relevance}\n`;
        result += '\n';
      });
    }
    
    // Format hadith
    if (refs?.hadith?.length) {
      result += '**Related Hadith:**\n\n';
      refs.hadith.forEach((h: any) => {
        result += `• **${h.source}** ${h.grade ? `(${h.grade})` : ''}\n`;
        if (h.text) result += `  ${h.text}\n`;
        if (h.relevance) result += `  - ${h.relevance}\n`;
        result += '\n';
      });
    }
    
    return result.trim();
  }

  async generateTafsirResponse(surah: number, verse: number, question: string): Promise<AIResponse> {
    try {
        const token = await this.authService.getToken();
        if (!token) {
            this.notificationService.warning('Please sign in to use AI features');
            throw new Error('Authentication required');
        }

        const response = await firstValueFrom(
            this.http.post<AIResponse>(`${this.baseUrl}/api/ai/tafsir/chat`, { surah, verse, question }, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
        );

        return response;
    } catch (error) {
        console.error('Error in tafsir chat:', error);
        throw error;
    }
  }

  private async makeRequest(method: 'get' | 'post', endpoint: string, body?: any): Promise<any> {
    try {
      // Get Firebase auth token for all requests
      const token = await this.authService.getToken();
      if (!token) {
        this.notificationService.warning('Please sign in to access this feature');
        await this.authService.login();
        throw new Error('Authentication required');
      }

      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      });

      const options = { headers, withCredentials: true };

      if (method === 'get') {
        return await firstValueFrom(this.http.get(`${this.baseUrl}${endpoint}`, options));
      } else {
        return await firstValueFrom(this.http.post(`${this.baseUrl}${endpoint}`, body, options));
      }
    } catch (error) {
      console.error('API Request Error:', error);
      throw error;
    }
  }

  // Premium request method that checks auth and subscription
  private async makePremiumRequest(method: 'get' | 'post', endpoint: string, body?: any): Promise<any> {
    try {
      // Get auth token first
      const token = await this.authService.getToken();
      if (!token) {
        this.notificationService.warning('Please sign in to access AI features');
        // Redirect to login page
        await this.authService.login();
        throw new Error('Authentication required');
      }

      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      });

      const options = {
        headers,
        withCredentials: true
      };

      if (method === 'get') {
        return await this.http.get(`${this.baseUrl}${endpoint}`, options).toPromise();
      } else {
        return await this.http.post(`${this.baseUrl}${endpoint}`, body, options).toPromise();
      }
    } catch (error: any) {
      console.error('API Request Error:', error);
      if (error.status === 401) {
        this.notificationService.warning('Please sign in to access AI features');
        // Redirect to login page
        await this.authService.login();
        return null;
      }
      throw this.handleError(error);
    }
  }

  private handleError(error: HttpErrorResponse | Error): Observable<never> {
    let errorMessage = 'An error occurred';
    let notificationType: 'error' | 'warning' = 'error';

    if (error instanceof HttpErrorResponse) {
      console.error('HTTP Error Response:', error);
      switch (error.status) {
        case 0:
          errorMessage = 'Unable to connect to the server. Please check your internet connection.';
          break;
        case 401:
          errorMessage = 'Please sign in to access this feature';
          notificationType = 'warning';
          // Redirect to login page
          this.authService.login().catch(err => console.error('Error redirecting to login:', err));
          break;
        case 403:
          errorMessage = 'You do not have permission to access this feature';
          notificationType = 'warning';
          break;
        case 429:
          errorMessage = 'Too many requests. Please try again later.';
          notificationType = 'warning';
          break;
        case 500:
          if (error.error?.message?.includes('OpenAI')) {
            errorMessage = 'AI service is temporarily unavailable. Please try again later.';
          } else {
            errorMessage = error.error?.message || 'An unexpected server error occurred. Please try again later.';
          }
          break;
        default:
          errorMessage = error.error?.message || 'An unexpected error occurred';
      }
    } else {
      console.error('Client Error:', error);
      errorMessage = error.message || 'An unexpected error occurred';
    }

    // Show notification based on type
    if (notificationType === 'warning') {
      this.notificationService.warning(errorMessage);
    } else {
      this.notificationService.error(errorMessage);
    }
    
    return throwError(() => new Error(errorMessage));
  }

  // Helper methods for extracting sections
  private extractSection(sections: string[], header: string): string {
    const section = sections.find(s => s.toLowerCase().includes(header.toLowerCase()));
    if (!section) return '';
    
    // Remove the header and clean up the text
    return section
      .replace(header, '')
      .trim()
      .split('\n')
      .map(line => line.trim())
      .filter(line => line)
      .join('\n');
  }

  private extractBulletPoints(text: string): string[] {
    if (!text) return [];
    return text
      .split('\n')
      .map(line => line.replace(/^[•\-\*]\s*/, '').trim())
      .filter(line => line);
  }

  private extractVerses(text: string): string[] {
    if (!text) return [];
    const verses = text.match(/\[(.*?)\]/g) || [];
    return verses.map(verse => verse.replace(/[\[\]]/g, '').trim());
  }

  async createCheckoutSession(userId: string): Promise<CheckoutResponse> {
    const response = await firstValueFrom(
      this.http.post<CheckoutResponse>(`${this.baseUrl}/api/stripe/create-checkout-session`, { userId })
    );
    return response;
  }
} 