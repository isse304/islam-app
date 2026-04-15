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
import { catchError, switchMap, tap, filter, take, retry } from 'rxjs/operators';
import { FirebaseAuthService } from '../services/firebase-auth.service';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';

// Helper to check if a URL is for our backend API
const isApiUrl = (url: string) => url.startsWith(environment.apiUrl);

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  constructor(private authService: FirebaseAuthService, private router: Router) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Only intercept requests to our API
    if (!isApiUrl(req.url)) {
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
              isApiUrl(req.url) &&
              !req.url.includes('/auth/signin')
            ) {
              if (error.status === 403 && (error.error?.freeTierExhausted || error.error?.isPremium !== undefined)) {
                return throwError(() => error);
              }

              if (error.status === 401 || error.status === 403) {
                return this.handle401Error(req, next);
              }
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
      this.refreshTokenSubject.next(null);

      return from(this.authService.getToken(true)).pipe(
        retry({
          count: 2,
          delay: 1000 // 1 second delay between retries
        }),
        switchMap((newToken) => {
          this.isRefreshing = false;
          if (newToken) {
            this.refreshTokenSubject.next(newToken);
            return next.handle(this.addTokenHeader(request, newToken));
          }
          this.isRefreshing = false;
          return throwError(() => new Error('Token refresh failed after retries'));
        }),
        catchError((err) => {
          this.isRefreshing = false;
          // Only log out after retries have failed
          this.authService.signOut();
          return throwError(() => err);
        })
      );
    } else {
      return this.refreshTokenSubject.pipe(
        filter(token => token != null),
        take(1),
        switchMap(jwt => next.handle(this.addTokenHeader(request, jwt))),
        catchError((err) => {
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
  if (!isApiUrl(req.url)) {
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
            isApiUrl(authReq.url) &&
            !authReq.url.includes('/auth/signin')
          ) {
            // 403 with business-logic flags (e.g. usage limits) are NOT auth errors
            if (error.status === 403 && (error.error?.freeTierExhausted || error.error?.isPremium !== undefined)) {
              return throwError(() => error);
            }

            if (error.status === 401 || error.status === 403) {
              return handle401Error(authReq as HttpRequest<any>, next, authService);
            }
          }
          return throwError(() => error);
        })
      );
    }),
    catchError(initialTokenError => {
      // This was the source of the logout on 404 issue.
      // It incorrectly assumed any error in the chain was a token problem.
      // We should only log out if token refresh fails, which is handled in handle401Error.
      // For an initial token load failure, we can log it but should not sign out
      // as the user might be navigating to a public part of the app.
      console.error('Error during initial token retrieval (will not log out):', initialTokenError);
      // We don't sign out here anymore.
      // authService.signOut(); 
      return throwError(() => initialTokenError);
    })
  );
}; 