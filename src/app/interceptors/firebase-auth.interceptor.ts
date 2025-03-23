import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';
import { FirebaseAuthService } from '../services/firebase-auth.service';
import { environment } from '../../environments/environment';

export const firebaseAuthInterceptor: HttpInterceptorFn = (
  request: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const authService = inject(FirebaseAuthService);

  // Skip authentication for public endpoints or non-API calls
  if (!request.url.startsWith(environment.apiUrl) || 
      request.url.includes('/api/health') || 
      request.url.includes('/assets/') ||
      request.url.includes('api.quran.com') ||
      request.url.includes('api.alquran.cloud')) {
    return next(request);
  }

  // Add authentication for all API requests
  return from(authService.getToken()).pipe(
    switchMap(token => {
      if (token) {
        // Clone the request and add the authorization header
        const authReq = request.clone({
          headers: request.headers.set('Authorization', `Bearer ${token}`)
        });
        console.log('Adding auth token to request:', request.url);
        return next(authReq);
      }

      // If no token, return unauthorized error
      return throwError(() => new Error('No authentication token available'));
    }),
    catchError(error => {
      console.error('Auth interceptor error:', error);
      throw error;
    })
  );
}; 