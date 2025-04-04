import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { FirebaseAuthService } from '../services/firebase-auth.service';
import { Observable, from, switchMap, catchError, defer, of, throwError, retryWhen, delay, take, concatMap } from 'rxjs';

// List of endpoints that don't require authentication
const publicEndpoints = [
  '/api/quran',  // This will match all Quran endpoints
  '/api/tafsir',  // This will match all tafsir endpoints
  '/api/resources',
  '/api/translations',
  '/api/alquran'  // Add this for additional Quran endpoints
];

// Cache auth ready state
let isAuthReady = false;

// Maximum number of retry attempts
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second

export const FirebaseAuthInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const authService = inject(FirebaseAuthService);
  // console.log(`[Interceptor] Request received for: ${req.urlWithParams}`);

  const isPublicEndpoint = publicEndpoints.some(endpoint =>
    req.url.toLowerCase().includes(endpoint.toLowerCase())
  );

  if (isPublicEndpoint || req.url.includes('/quran/') || req.url.includes('/tafsir/')) {
    // console.log(`[Interceptor] Public/Quran/Tafsir endpoint, skipping auth: ${req.urlWithParams}`);
    return next(req);
  }

  // console.log(`[Interceptor] Protected endpoint, attempting to add token: ${req.urlWithParams}`);

  // --- Temporarily REMOVE waitForAuthReady() from inside the interceptor ---
  // The guards should ensure auth is ready before requests are made to protected routes.
  // We just need to get the current token, if available.
  return from(authService.getToken(false)).pipe( // Get token without waiting/forcing refresh
    switchMap(token => {
      if (!token) {
        // If no token, proceed without Auth header. Backend should reject with 401/403.
        console.warn(`[Interceptor] No token available for protected request: ${req.urlWithParams}. Proceeding without Authorization header.`);
        return next(req);
        // OR: Could throw error, but letting backend handle auth check is often better
        // return throwError(() => new Error('Authentication token is missing.'));
      }

      // console.log(`[Interceptor] Token found, adding header for: ${req.urlWithParams}`);
      const authReq = req.clone({
        headers: req.headers.set('Authorization', `Bearer ${token}`)
      });

      // console.log(`[Interceptor] Proceeding with authorized request: ${req.urlWithParams}`);
      return next(authReq);
    }),
    catchError((error: HttpErrorResponse) => {
      console.error(`[Interceptor] HTTP error ${error.status} for ${req.urlWithParams}`, error);
      // Optional: Trigger sign-out on critical auth errors (e.g., 401/403)
      if (error.status === 401 || error.status === 403) {
        // Consider triggering sign out, but be careful of loops
        // authService.signOut().catch(err => console.error("Sign out failed during interceptor error handling", err));
      }
      return throwError(() => error);
    })
  );
}; 