import { Injectable, Injector } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, from, throwError, firstValueFrom, retry, mergeMap, TimeoutError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { NotificationService } from './notification.service';
import { FirebaseAuthService } from './firebase-auth.service';

interface TafsirResponse {
  success: boolean;
  content: string;
  sources?: Array<{ name: string; language: string }>;
  source?: 'tafsir_sources' | 'ai_fallback';
  error?: string;
}

interface AIPrompt {
  userMessage: string;
  systemMessage?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIResponse {
  success: boolean;
  content: string;
  sources?: Array<{ name: string; language: string }>;
  source?: 'ai_fallback' | 'tafsir_sources' | 'tafsir';
  error?: string;
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

interface CheckoutResponse {
  url: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = environment.apiUrl;
  private _authService: FirebaseAuthService | null = null;

  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
    private injector: Injector
  ) {}

  // Lazy getter for FirebaseAuthService
  private get authService(): FirebaseAuthService {
    if (!this._authService) {
      this._authService = this.injector.get(FirebaseAuthService);
    }
    return this._authService;
  }

  // Premium features
  async generateAIResponse(prompt: {
    systemMessage: string;
    userMessage: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ content: string }> {
    // console.log('API Service: Generating AI response...');
    try {
      const token = await this.authService.getToken();
      if (!token) {
        // console.error('API Service Error: Authentication token not available.');
        throw new Error('Authentication required');
      }
      
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      // console.log('API Service: Making request to:', this.apiUrl);
      const response = await firstValueFrom(
        this.http.post<{ content: string }>(`${this.baseUrl}/api/ai/generate`, prompt, { headers }).pipe(
          catchError(err => {
            // console.error('API Service Error in HTTP request:', err);
            let message = 'Failed to generate AI response.';
            if (err instanceof TimeoutError) {
              message = 'The request timed out. Please try again.';
            } else if (err.status === 401) {
              message = 'Authentication failed. Please log in again.';
            } else if (err.status === 403) {
              message = 'You do not have permission for this feature (Premium required?).';
            } else if (err.status === 429) {
              message = 'Usage limit reached or rate limit exceeded. Please try again later.';
            } else if (err.error?.error) {
              message = err.error.error; // Use server-provided error message if available
            }
            return throwError(() => new Error(message));
          })
        )
      );

      // console.log('API Service: Received response');
      return response;
    } catch (error: any) {
      // console.error('API Service Error:', error.message || error);
      // Re-throw the specific error message caught or generated in catchError
      throw new Error(error.message || 'An unknown error occurred while generating the AI response.');
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
      // console.log('🚀 Generating dua insights...', { duaId: dua.id, title: dua.title });
      
      const token = await this.authService.getToken(true);
      if (!token) {
        // console.error('❌ No auth token available');
        this.notificationService.warning('Please sign in to use AI features');
        throw new Error('Authentication required');
      }

      // console.log('📤 Making insights request...');
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
            // console.error('❌ Insights request failed:', error);
            if (error.status === 401) {
              // console.log('🔄 Attempting token refresh...');
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

      // console.log('✅ Insights response received:', {
      //   success: response.success,
      //   hasContent: !!response.content,
      //   sections: Object.keys(response).filter(key => 
      //     key in response && 
      //     response[key as keyof AIResponse] !== undefined && 
      //     response[key as keyof AIResponse] !== null
      //   )
      // });

      if (!response.success) {
        throw new Error(response.error || 'Failed to generate insights');
      }

      return response;
    } catch (error: any) {
      // console.error('❌ Failed to generate insights:', error);
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
      // console.error('Error in emotional dua search:', error);
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

  async generateTafsirResponse(
    surah: number, 
    verse: number, 
    question: string, 
    selectedTafsir: 'ibn-kathir' | 'tabari' = 'ibn-kathir',
    isFirstResponse: boolean = false
  ): Promise<AIResponse> {
    try {
      // console.log('Generating Tafsir Response for:', { surah, verse, question, selectedTafsir });

      const token = await this.authService.getToken(true); // Force refresh if needed for premium
      if (!token) {
        // console.error('No auth token available');
        this.notificationService.warning('Please sign in to use AI features');
        throw new Error('Authentication required');
      }

      // console.log('Making tafsir request with token');
      const response = await firstValueFrom(
        this.http.post<AIResponse>(`${this.baseUrl}/api/ai/tafsir`, { surah, verse, question, selectedTafsir }, {
          headers: new HttpHeaders({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          })
        }).pipe(
          catchError(error => {
            // Handle specific errors like 403 (premium required)
            if (error instanceof HttpErrorResponse && error.status === 403) {
              return throwError(() => new Error('Premium subscription required for AI Tafsir.'));
            }
            return throwError(() => error); // Rethrow other errors
          })
        )
      );

      // console.log('Tafsir Response:', response);

      if (response && response.success) {
        // Process sources if they exist
        if (!response.sources || response.sources.length === 0) {
          // console.warn('No specific sources found, using AI fallback text as source.');
          if (response.source === 'ai_fallback' && response.content) {
            response.sources = [{ name: 'AI Generated Explanation', language: 'en' }];
          }
        }
      } else if (!response?.success) {
        throw new Error(response?.error || 'Failed to generate AI tafsir response');
      }


      return response;
    } catch (error: any) {
      // console.error('Error generating tafsir response:', error);
      if (error instanceof HttpErrorResponse) {
        // console.error('HTTP Error generating tafsir:', httpError);
        if (error.status === 401) {
          await this.authService.signOut(); // Force sign out on critical auth error
        }
        throw new Error(error.error?.message || error.message || 'An error occurred.');
      } else {
        // console.error('Non-HTTP error generating tafsir:', error);
        throw error; // Rethrow non-HTTP errors
      }
    }
  }

  // Make this public so other services can use it for authenticated requests
  public async makeRequest(method: 'get' | 'post', endpoint: string, body?: any, options: { signal?: AbortSignal } = {}): Promise<any> {
    const maxRetries = 3;
    let attempt = 1;
    let lastError: any;

    while (attempt <= maxRetries) {
      try {
        // Get fresh token for each attempt
        const token = await this.authService.getToken();
        if (!token) {
          throw new Error('No authentication token available');
        }

        const headers = new HttpHeaders({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        });

        // Merge provided options with default headers
        const requestOptions = {
          headers,
          withCredentials: true,
          ...options
        };

        // Make the request based on method type
        const response = method === 'get' 
          ? await firstValueFrom(this.http.get(`${this.baseUrl}${endpoint}`, requestOptions))
          : await firstValueFrom(this.http.post(`${this.baseUrl}${endpoint}`, body, requestOptions));

        // console.log(`[ApiService makeRequest] <<< FINISHED ${method} for ${this.baseUrl}${endpoint}`);
        return response;

      } catch (error: any) {
        lastError = error;
        
        // Don't retry on abort/timeout or auth errors
        if (error.name === 'AbortError' || 
            error.status === 401 || 
            error.status === 403) {
          throw error;
        }

        // Only retry on 5xx errors or network errors
        if (error.status >= 500 || !error.status) {
          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
            // console.log(`[ApiService makeRequest] Attempt ${attempt} failed, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            attempt++;
            continue;
          }
        }
        
        // If we get here, either we've exhausted retries or it's an error we don't retry
        // console.error(`[ApiService makeRequest] Request failed after ${attempt} attempt(s):`, error);
        throw error;
      }
    }

    throw lastError;
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
    let errorMessage = 'An unknown error occurred!';

    if (error instanceof HttpErrorResponse) {
      // Server-side or connection error
      // console.error('API Service Error:', error);
      if (error.error instanceof ErrorEvent) {
        // A client-side or network error occurred. Handle it accordingly.
        errorMessage = `Network error: ${error.error.message}`;
      } else {
        // The backend returned an unsuccessful response code.
        // The response body may contain clues as to what went wrong.
        // console.error(
        //   `Backend returned code ${error.status}, ` +
        //   `body was: ${JSON.stringify(error.error)}`);

        if (error.status === 401) {
          errorMessage = 'Authentication failed. Please log in again.';
          // console.warn('User needs to sign in again.');
          // Consider triggering re-authentication flow
          this.authService.signOut(); // Example: Sign out the user
        } else if (error.status === 403) {
          errorMessage = 'You do not have permission for this action. A premium subscription might be required.';
          // console.warn('User is not authorized (possibly needs premium).');
        } else if (error.status === 429) {
           errorMessage = 'You have made too many requests. Please try again later.';
           // console.warn('Rate limit exceeded.');
        } else if (error instanceof TimeoutError) {
           errorMessage = 'The request took too long to complete. Please check your connection and try again.';
           // console.warn('The request timed out.');
        } else if (error.error && typeof error.error === 'string') {
          errorMessage = error.error; // Use error message from backend if available as string
        } else if (error.error && error.error.message && typeof error.error.message === 'string') {
          errorMessage = error.error.message; // Use error message from backend if available in object
        } else {
          errorMessage = `Server error: ${error.status}. Please try again later.`;
        }
      }
    } else if (error instanceof Error) {
      // Client-side error (e.g., TypeErrors in RxJS operators)
      // console.error('An unexpected error occurred:', error.message);
      errorMessage = `Error: ${error.message}`;
    }

    // Notify the user
    this.notificationService.error(errorMessage);

    // Return an observable with a user-facing error message.
    // console.error('Something bad happened; please try again later.'); // Fallback error
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
      const token = await this.authService.getToken(true); // Force refresh for sensitive operation
      if (!token) {
        throw new Error('Authentication failed');
      }

      const response = await firstValueFrom(
        this.http.post<CheckoutResponse>(`${this.baseUrl}/api/subscription/create-checkout`, { userId }, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
      );
      return response;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      throw error;
    }
  }

  async createCustomerPortalSession(): Promise<{ url: string }> {
    try {
      const token = await this.authService.getToken(true); // Force refresh for sensitive operation
      if (!token) {
        throw new Error('Authentication failed');
      }

      const response = await firstValueFrom(
        this.http.post<{ url: string }>(`${this.baseUrl}/api/subscription/create-customer-portal-session`, {}, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
      );
      return response;
    } catch (error) {
      console.error('Error creating customer portal session:', error);
      this.notificationService.error('Could not open billing portal. Please try again later.');
      throw error;
    }
  }
} 