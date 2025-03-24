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

  // Skip if not an API request
  if (!req.url.includes('/api/')) {
    return next(req);
  }

  // Skip token for auth verify endpoint
  if (req.url.includes('/api/auth/verify')) {
    return next(req);
  }

  // Get token for API request
  return from(authService.getToken(false)).pipe(
    switchMap(token => {
      if (!token && !isPublicRoute(req.url)) {
        console.warn('No token available for protected route');
        // Navigate inside NgZone
        ngZone.run(() => {
          router.navigate(['/auth/login'], {
            queryParams: { 
              returnUrl: router.url,
              error: 'auth_required'
            }
          });
        });
        return EMPTY;
      }

      // Clone request with token
      const authReq = token ? 
        req.clone({
          headers: req.headers.set('Authorization', `Bearer ${token}`)
        }) : req;

      // Log the request details
      console.log('Making authenticated request:', {
        url: authReq.url,
        method: authReq.method,
        hasToken: !!token
      });

      return next(authReq).pipe(
        retryWhen(errors => 
          errors.pipe(
            concatMap(async (error: HttpErrorResponse, index) => {
              // Only retry on 401 errors and limit retries
              if (error.status !== 401 || index >= 1) {
                throw error;
              }

              console.log(`Attempting to refresh token...`);
              
              try {
                // Get fresh token
                const newToken = await authService.getToken(true);
                if (!newToken) {
                  throw new Error('No token after refresh');
                }

                // Add small delay before retry
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                return newToken;
              } catch (refreshError) {
                console.error('Token refresh failed:', refreshError);
                throw error;
              }
            })
          )
        ),
        catchError(error => {
          if (error.status === 401 && !isPublicRoute(router.url)) {
            console.error('Authentication failed:', {
              url: req.url,
              status: error.status
            });
            // Sign out and navigate inside NgZone
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
  return publicRoutes.some(route => path.includes(route));
} 