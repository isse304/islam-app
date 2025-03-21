import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable, from, throwError } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';
import { FirebaseAuthService } from '../services/firebase-auth.service';
import { environment } from '../../environments/environment';

@Injectable()
export class FirebaseAuthInterceptor implements HttpInterceptor {
  constructor(private authService: FirebaseAuthService) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Skip authentication for public endpoints or non-API calls
    if (!request.url.startsWith(environment.apiUrl) || 
        request.url.includes('/api/health') || 
        request.url.includes('/assets/') ||
        request.url.includes('api.quran.com') ||
        request.url.includes('api.alquran.cloud')) {
      return next.handle(request);
    }

    // Add authentication for all API requests
    return from(this.authService.getToken()).pipe(
      switchMap(token => {
        if (token) {
          // Clone the request and add the authorization header
          const authReq = request.clone({
            headers: request.headers.set('Authorization', `Bearer ${token}`)
          });
          console.log('Adding auth token to request:', request.url);
          return next.handle(authReq);
        }

        // If no token, return unauthorized error
        return throwError(() => new Error('No authentication token available'));
      }),
      catchError(error => {
        console.error('Auth interceptor error:', error);
        throw error;
      })
    );
  }
} 