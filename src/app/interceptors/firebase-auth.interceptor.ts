import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http';
import { inject } from '@angular/core';
import { FirebaseAuthService } from '../services/firebase-auth.service';
import { Observable, from, switchMap, catchError, defer, of } from 'rxjs';

// List of endpoints that don't require authentication
const publicEndpoints = [
  '/api/quran',  // This will match all Quran endpoints
  '/api/tafsir',  // This will match all tafsir endpoints
  '/api/resources',
  '/api/translations',
  '/api/alquran'  // Add this for additional Quran endpoints
];

// Cache auth token with expiration
let cachedToken: { value: string; expiry: number } | null = null;
const TOKEN_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Cache auth ready state
let isAuthReady = false;

export const FirebaseAuthInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const authService = inject(FirebaseAuthService);

  // Check if this is a public endpoint
  const isPublicEndpoint = publicEndpoints.some(endpoint => 
    req.url.toLowerCase().includes(endpoint.toLowerCase())
  );

  // For public endpoints or Quran-related endpoints, proceed without token
  if (isPublicEndpoint || req.url.includes('/quran/') || req.url.includes('/tafsir/')) {
    return next(req);
  }

  // Check if we have a valid cached token
  if (cachedToken && Date.now() < cachedToken.expiry) {
    const authReq = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${cachedToken.value}`)
    });
    return next(authReq);
  }

  // For protected endpoints, get token only if not already checked auth state
  if (!isAuthReady) {
    return defer(() => authService.waitForAuthReady()).pipe(
      switchMap(() => {
        isAuthReady = true;
        return from(authService.getToken());
      }),
      switchMap(token => {
        if (!token) {
          console.warn('❌ No token available for request:', req.url);
          return next(req);
        }

        // Cache the token
        cachedToken = {
          value: token,
          expiry: Date.now() + TOKEN_CACHE_DURATION
        };

        const authReq = req.clone({
          headers: req.headers.set('Authorization', `Bearer ${token}`)
        });

        return next(authReq);
      }),
      catchError(error => {
        console.error('Auth interceptor error:', error);
        return next(req);
      })
    );
  }

  // If auth is ready but no token, proceed without token
  return next(req);
}; 