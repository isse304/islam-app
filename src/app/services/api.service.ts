import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, from, throwError, firstValueFrom, retry, mergeMap } from 'rxjs';
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

export interface AIResponse {
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
  quranic_guidance?: string[];
  prophetic_example?: string;
  practical_steps?: string[];
  recommended_duas?: Array<{
    translation: string;
    virtue: string;
    source: string;
  }>;
  related_verses_hadith?: {
    verses: Array<{
      reference: string;
      translation: string;
      relevance?: string;
    }>;
    hadith: Array<{
      text: string;
      source: string;
      grade?: string;
      relevance?: string;
    }>;
  };
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
        console.log('🚀 Starting AI response generation...', {
            promptType: typeof prompt,
            isString: typeof prompt === 'string',
            content: typeof prompt === 'string' ? prompt : prompt.userMessage
        });
        
        // Check if user is authenticated
        const isAuth = await this.authService.isAuthenticated();
        console.log('🔒 Authentication check:', { isAuthenticated: isAuth });
        
        if (!isAuth) {
            console.error('❌ User not authenticated');
            this.notificationService.warning('Please sign in to use AI features');
            throw new Error('Authentication required');
        }

        // Get fresh token with force refresh
        const token = await this.authService.getToken(true);
        console.log('🔑 Token status:', { 
            hasToken: !!token,
            tokenPreview: token ? token.substring(0, 10) + '...' : 'no token'
        });
        
        if (!token) {
            console.error('❌ Failed to get auth token');
            throw new Error('Failed to get auth token');
        }

        // Prepare request body
        const requestBody = {
            prompt: typeof prompt === 'string' ? prompt : prompt.userMessage,
            context: typeof prompt === 'string' ? undefined : prompt.systemMessage,
            temperature: typeof prompt === 'string' ? 0.7 : (prompt.temperature ?? 0.4),
            maxTokens: typeof prompt === 'string' ? 1000 : (prompt.maxTokens ?? 2000)
        };

        console.log('📤 Making API request...', {
            endpoint: `${this.baseUrl}/api/ai/generate`,
            hasPrompt: !!requestBody.prompt,
            hasContext: !!requestBody.context
        });
        
        // Make request with auth header
        const response = await firstValueFrom(
            this.http.post<AIResponse>(`${this.baseUrl}/api/ai/generate`, requestBody, {
                headers: new HttpHeaders({
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                })
            }).pipe(
                retry({
                    count: 2,
                    delay: 1000,
                    resetOnSuccess: true
                }),
                catchError(async (error: HttpErrorResponse) => {
                    console.error('❌ API request error:', {
                        status: error.status,
                        message: error.message,
                        error: error.error,
                        headers: error.headers.keys()
                    });
                    
                    if (error.status === 401) {
                        console.log('🔄 Attempting token refresh after 401...');
                        // Try to refresh auth and retry once
                        await this.authService.refreshAuth();
                        const newToken = await this.authService.getToken(true);
                        if (!newToken) throw error;
                        
                        console.log('🔄 Retrying request with new token...');
                        // Retry with new token
                        return firstValueFrom(
                            this.http.post<AIResponse>(`${this.baseUrl}/api/ai/generate`, requestBody, {
                                headers: new HttpHeaders({
                                    'Authorization': `Bearer ${newToken}`,
                                    'Content-Type': 'application/json'
                                })
                            })
                        );
                    }
                    
                    throw error;
                })
            )
        );

        console.log('✅ API request successful:', {
            hasContent: !!response?.content,
            hasError: !!response?.error,
            success: response?.success
        });

        return response;
    } catch (error) {
        console.error('❌ API Request Error:', error);
        if (error instanceof HttpErrorResponse && error.status === 401) {
            await this.authService.signOut();
        }
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
      console.log('🚀 Generating dua insights...', { duaId: dua.id, title: dua.title });
      
      const token = await this.authService.getToken(true);
      if (!token) {
        console.error('❌ No auth token available');
        this.notificationService.warning('Please sign in to use AI features');
        throw new Error('Authentication required');
      }

      console.log('📤 Making insights request...');
      const response = await firstValueFrom(
        this.http.post<AIResponse>(`${this.baseUrl}/api/ai/dua/insights`, { dua }, {
          headers: new HttpHeaders({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          })
        }).pipe(
          retry({
            count: 2,
            delay: 1000,
            resetOnSuccess: true
          }),
          catchError(async (error: HttpErrorResponse) => {
            console.error('❌ Insights request failed:', error);
            if (error.status === 401) {
              console.log('🔄 Attempting token refresh...');
              await this.authService.refreshAuth();
              const newToken = await this.authService.getToken(true);
              if (!newToken) throw error;
              
              return firstValueFrom(
                this.http.post<AIResponse>(`${this.baseUrl}/api/ai/dua/insights`, { dua }, {
                  headers: new HttpHeaders({
                    'Authorization': `Bearer ${newToken}`,
                    'Content-Type': 'application/json'
                  })
                })
              );
            }
            throw error;
          })
        )
      );

      console.log('✅ Insights response received:', {
        success: response.success,
        hasContent: !!response.content,
        sections: Object.keys(response).filter(key => 
          key in response && 
          response[key as keyof AIResponse] !== undefined && 
          response[key as keyof AIResponse] !== null
        )
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to generate insights');
      }

      return response;
    } catch (error: any) {
      console.error('❌ Failed to generate insights:', error);
      if (error instanceof HttpErrorResponse && error.status === 401) {
        await this.authService.signOut();
      }
      throw error;
    }
  }

  async generateEmotionalDuaResponse(emotion: string, context: string): Promise<any> {
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

  // Helper method to extract related verses
  private extractRelatedVerses(content: any): string[] {
    if (!content?.related_verses_hadith?.verses) return [];
    
    return content.related_verses_hadith.verses.map((v: any) => 
      `${v.reference}: ${v.translation}`
    );
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
      // Wait for auth state to be fully initialized
      const isAuthenticated = await this.authService.isAuthenticated();
      if (!isAuthenticated) {
        this.notificationService.warning('Please sign in to access this feature');
        await this.authService.login();
        throw new Error('Authentication required');
      }

      // Get Firebase auth token for all requests
      const token = await this.authService.getToken();
      if (!token) {
        this.notificationService.warning('Please sign in to access this feature');
        await this.authService.login();
        throw new Error('Authentication required');
      }

      const headers = new HttpHeaders({
        'Content-Type': 'application/json'
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
    try {
        console.log('Starting checkout session creation for user:', userId);
        
        // Get auth token first
        const token = await this.authService.getToken(true); // Force token refresh
        if (!token) {
            console.error('No auth token available');
            this.notificationService.warning('Please sign in to access subscription features');
            throw new Error('Authentication required');
        }

        console.log('Got auth token, creating checkout session...');

        const headers = new HttpHeaders({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        });

        const response = await firstValueFrom(
            this.http.post<CheckoutResponse>(
                `${this.baseUrl}/api/subscription/create-checkout`,
                { userId },
                { headers }
            ).pipe(
                catchError((error: HttpErrorResponse) => {
                    console.error('Checkout session error:', error);
                    let errorMessage = 'Failed to create checkout session';
                    
                    if (error.status === 401) {
                        errorMessage = 'Please sign in to continue';
                        this.notificationService.warning(errorMessage);
                    } else if (error.error?.message) {
                        errorMessage = error.error.message;
                        this.notificationService.error(errorMessage);
                    } else {
                        this.notificationService.error(errorMessage);
                    }
                    
                    throw new Error(errorMessage);
                })
            )
        );

        console.log('Checkout session response:', response);

        if (!response?.url) {
            console.error('No checkout URL in response');
            throw new Error('No checkout URL received from server');
        }

        console.log('Redirecting to checkout URL:', response.url);
        return response;
    } catch (error) {
        console.error('Error creating checkout session:', error);
        throw error;
    }
  }
} 