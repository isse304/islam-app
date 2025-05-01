import { Injectable, inject } from '@angular/core';
import {
  HttpEvent,
  HttpInterceptor,
  HttpHandler,
  HttpRequest,
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpHandlerFn
} from '@angular/common/http';
import { Observable, throwError, from, of, BehaviorSubject } from 'rxjs';
import { catchError, switchMap, tap, filter, take } from 'rxjs/operators';
import { FirebaseAuthService } from '../services/firebase-auth.service';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  constructor(private authService: FirebaseAuthService, private router: Router) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Only intercept requests to our API
    if (!req.url.startsWith(environment.apiUrl)) {
      return next.handle(req);
    }

    return from(this.authService.getToken()).pipe( // Get potentially cached token first
      switchMap((token) => {
        if (token) {
          req = this.addTokenHeader(req, token);
        }
        return next.handle(req).pipe(
          catchError((error) => {
            if (
              error instanceof HttpErrorResponse &&
              !req.url.includes('/auth/signin') && // Avoid retry loop on signin
              (error.status === 401 || error.status === 403) // Unauthorized or Forbidden
            ) {
              return this.handle401Error(req, next);
            }
            return throwError(() => error);
          })
        );
      })
    );
  }

  private handle401Error(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null); // Signal start of refresh

      return from(this.authService.getToken(true)).pipe( // Force refresh the token
        switchMap((newToken) => {
          this.isRefreshing = false;
          if (newToken) {
            this.refreshTokenSubject.next(newToken); // Signal successful refresh
            // Retry the original request with the new token
            return next.handle(this.addTokenHeader(request, newToken));
          } else {
            // Refresh failed, logout or redirect
            console.error('Failed to refresh token, logging out.');
            this.authService.signOut(); // Or navigate to login
            // Pass the original error along
            return throwError(() => new Error('Token refresh failed'));
          }
        }),
        catchError((err) => {
          this.isRefreshing = false;
          console.error('Error during token refresh, logging out.', err);
          this.authService.signOut(); // Or navigate to login
          return throwError(() => err); // Rethrow the refresh error
        })
      );

    } else {
      // If already refreshing, wait for the new token
      return this.refreshTokenSubject.pipe(
        filter(token => token != null), // Wait until token is available
        take(1), // Take the first emitted token
        switchMap(jwt => {
          // Retry the request with the token obtained from the refresh process
          return next.handle(this.addTokenHeader(request, jwt));
        }),
        catchError((err) => {
          // If waiting failed, handle appropriately (e.g., logout)
           console.error('Error while waiting for token refresh, logging out.', err);
           this.authService.signOut();
           return throwError(() => err);
        })
      );
    }
  }


  private addTokenHeader(request: HttpRequest<any>, token: string) {
    return request.clone({
      headers: request.headers.set('Authorization', `Bearer ${token}`),
    });
  }
}

// --- State for functional interceptor --- Needed because interceptors are stateless by default
let isRefreshing = false;
const refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);
// --- End State ---

// Helper function to add token
const addTokenHeader = (request: HttpRequest<any>, token: string) => {
  return request.clone({
    headers: request.headers.set('Authorization', `Bearer ${token}`),
  });
};

// Helper function to handle 401/403 errors
const handle401Error = (
  request: HttpRequest<any>,
  next: HttpHandlerFn,
  authService: FirebaseAuthService // Pass service instance
): Observable<HttpEvent<any>> => {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshTokenSubject.next(null);

    return from(authService.getToken(true)).pipe(
      switchMap((newToken) => {
        isRefreshing = false;
        if (newToken) {
          refreshTokenSubject.next(newToken);
          return next(addTokenHeader(request, newToken));
        } else {
          console.error('Failed to refresh token, logging out.');
          authService.signOut(); // Handle appropriately
          return throwError(() => new Error('Token refresh failed'));
        }
      }),
      catchError((err) => {
        isRefreshing = false;
        console.error('Error during token refresh, logging out.', err);
        authService.signOut();
        return throwError(() => err);
      })
    );
  } else {
    return refreshTokenSubject.pipe(
      filter(token => token != null),
      take(1),
      switchMap(jwt => next(addTokenHeader(request, jwt))),
      catchError((err) => {
        console.error('Error while waiting for token refresh, logging out.', err);
        authService.signOut();
        return throwError(() => err);
      })
    );
  }
};


// Functional Interceptor Definition
export const authInterceptorFn: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  // Inject services
  const authService = inject(FirebaseAuthService);
  const router = inject(Router); // Inject if needed for navigation on error

  // Only intercept requests to our API
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  // Get initial token (might be cached)
  return from(authService.getToken()).pipe(
    switchMap(token => {
      let authReq = req;
      if (token) {
        authReq = addTokenHeader(req as HttpRequest<any>, token);
      }
      // Handle the request
      return next(authReq).pipe(
        catchError(error => {
          if (
            error instanceof HttpErrorResponse &&
            !authReq.url.includes('/auth/signin') && // Avoid retry loop on signin routes
            (error.status === 401 || error.status === 403) // Check for Unauthorized or Forbidden
          ) {
            // Call the specific 401/403 handler logic
            return handle401Error(authReq as HttpRequest<any>, next, authService);
          }
          // For other errors, just pass them along
          return throwError(() => error);
        })
      );
    }),
    catchError(initialTokenError => {
      // Handle error during initial token retrieval if necessary
      console.error('Error getting initial token:', initialTokenError);
      // Decide how to proceed, e.g., sign out or throw
      authService.signOut();
      return throwError(() => initialTokenError);
    })
  );
}; 