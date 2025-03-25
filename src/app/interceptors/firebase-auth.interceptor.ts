import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { FirebaseAuthService } from '../services/firebase-auth.service';
import { Router } from '@angular/router';
import { catchError, from, throwError, Observable, switchMap, retry, retryWhen, delay, concatMap, EMPTY } from 'rxjs';
import { environment } from '../../environments/environment';
import { NgZone } from '@angular/core';

export const FirebaseAuthInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const authService = inject(FirebaseAuthService);
  const router = inject(Router);
  const ngZone = inject(NgZone);

  // Skip auth header for public routes
  if (isPublicRoute(req.url)) {
    console.log('🔓 Public route detected:', req.url);
    return next(req);
  }

  // Force token refresh for AI endpoints
  const shouldForceRefresh = req.url.includes('/api/ai/') || req.url.includes('/api/dua/insights');
  console.log('🔄 Force refresh check:', { url: req.url, shouldForceRefresh });

  // Get token with appropriate refresh setting
  return from(authService.getToken(shouldForceRefresh)).pipe(
    switchMap(token => {
      if (!token) {
        console.error('❌ No token available for request:', req.url);
        return throwError(() => new Error('No authentication token available'));
      }

      console.log('🔑 Token validation:', { 
        hasToken: !!token,
        length: token.length,
        format: token.startsWith('Bearer ') ? 'Valid' : 'Invalid',
        preview: token.substring(0, 20) + '...'
      });

      // Ensure token format is correct - remove any existing 'Bearer ' prefix first
      const cleanToken = token.replace(/^Bearer\s+/i, '');
      const finalToken = `Bearer ${cleanToken}`;

      // Clone the request with auth header
      const authReq = req.clone({
        headers: req.headers.set('Authorization', finalToken)
      });

      console.log('📤 Making authenticated request:', {
        url: authReq.url,
        method: authReq.method,
        hasAuthHeader: authReq.headers.has('Authorization'),
        headerPreview: finalToken.substring(0, 20) + '...'
      });

      return next(authReq).pipe(
        retryWhen(errors => 
          errors.pipe(
            concatMap(async (error: HttpErrorResponse, index) => {
              // Only retry on 401 errors and limit retries
              if (error.status !== 401 || index >= 2) {
                throw error;
              }

              console.log('🔄 Attempting token refresh, attempt:', index + 1);
              
              try {
                // Small delay before refresh
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Force refresh token for retry
                await authService.refreshAuth();
                const newToken = await authService.getToken(true);
                if (!newToken) {
                  console.error('❌ No token after refresh');
                  throw new Error('No token after refresh');
                }
                
                // Clean and format the new token
                const cleanNewToken = newToken.replace(/^Bearer\s+/i, '');
                console.log('✅ Token refreshed successfully');
                return `Bearer ${cleanNewToken}`;
              } catch (refreshError) {
                console.error('❌ Token refresh failed:', refreshError);
                throw error;
              }
            })
          )
        ),
        catchError(error => {
          if (error.status === 401) {
            console.error('❌ Authentication failed:', {
              url: req.url,
              status: error.status,
              error: error.error
            });

            ngZone.run(async () => {
              await authService.signOut();
              router.navigate(['/auth/login'], {
                queryParams: { 
                  returnUrl: router.url,
                  error: 'session_expired'
                }
              });
            });
          }
          return throwError(() => error);
        })
      );
    })
  );
};

// Helper to check if route is public
function isPublicRoute(path: string): boolean {
  const publicRoutes = [
    '/home',
    '/about',
    '/contact',
    '/auth/login',
    '/auth/register',
    '/auth/forgot-password',
    '/auth/verify-email',
    '/subscription/success',
    '/subscription/cancel',
    '/api/auth/verify'
  ];
  
  // Ensure AI endpoints are not considered public
  if (path.includes('/api/ai/') || 
      path.includes('/api/dua/insights') || 
      path.includes('/api/quran/')) {
    return false;
  }
  
  return publicRoutes.some(route => path.includes(route));
} 