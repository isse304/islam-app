import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, from, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';

interface TafsirResponse {
  explanation: string;
  context: string;
  modernApplication: string;
  relatedHadith?: string[];
}

interface AIPrompt {
  systemMessage: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = 'http://localhost:3000/api'; // Update for production

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private notificationService: NotificationService
  ) {}

  // Premium features
  generateAIResponse(prompt: AIPrompt): Observable<any> {
    return from(this.makePremiumRequest('post', '/ai/generate', { prompt })).pipe(
      catchError(error => this.handleError(error))
    );
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

  private async makeRequest(method: 'get' | 'post', endpoint: string, body?: any): Promise<any> {
    try {
      const headers = new HttpHeaders({
        'Content-Type': 'application/json'
      });

      if (method === 'get') {
        return await this.http.get(`${this.baseUrl}${endpoint}`, { headers }).toPromise();
      } else {
        return await this.http.post(`${this.baseUrl}${endpoint}`, body, { headers }).toPromise();
      }
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  // Premium request method that checks auth and subscription
  private async makePremiumRequest(method: 'get' | 'post', endpoint: string, body?: any): Promise<any> {
    try {
      // Get auth token first
      const token = await this.authService.getToken();
      if (!token) {
        this.notificationService.warning('Please sign in to access AI features');
        // Save current route and open Clerk modal
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
        // Save current route and open Clerk modal
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
          // Open Clerk modal
          this.authService.login().catch(err => console.error('Error opening Clerk modal:', err));
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
} 