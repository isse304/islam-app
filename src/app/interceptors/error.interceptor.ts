import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, from, throwError } from 'rxjs';
import { catchError, retry, switchMap, tap } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { FirebaseAuthService } from '../services/firebase-auth.service'; // Adjust path if needed

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {

  constructor(
    private snackBar: MatSnackBar,
    private router: Router,
    private authService: FirebaseAuthService // Inject AuthService for logout/redirect
  ) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request).pipe(
      // Optional: Add retry logic for certain transient errors (e.g., network issues)
      // retry(1),
      catchError((error: HttpErrorResponse) => {
        let errorMessage = 'An unknown error occurred!';
        const errorAction = 'Close';
        let errorDuration = 5000; // Default duration for snackbar
        let status = error.status;
        let isPublicAuthRoute = false; // Initialize

        // Log the full technical error for debugging purposes
        console.error('HTTP Error Intercepted:', error);

        if (error.error instanceof ErrorEvent || error.status === 0) {
          // Client-side or network error
          errorMessage = `Network error: ${error.message || 'Could not connect to the server.'}`;
          this.showSnackbar(errorMessage, errorAction, errorDuration);
          return throwError(() => new Error(errorMessage));
        } else {
          // Backend error
          const backendError = error.error;
          status = backendError?.status || error.status; // Update status if available in body
          const message = backendError?.message || error.statusText;
          errorMessage = message || `Server error (Status ${status})`;

          // --- Handle 401 Specifically with Auth Ready Check ---
          if (status === 401) {
            errorMessage = 'Unauthorized: Please log in again.';
            errorDuration = 7000;

            // IMPORTANT: Return the result of the inner pipe
            return from(this.authService.waitForAuthReady()).pipe(
              switchMap(() => {
                const currentUrl = this.router.url.split('?')[0];
                isPublicAuthRoute = currentUrl === '/' || currentUrl.startsWith('/auth');

                if (!isPublicAuthRoute && !request.url.includes('/auth/login')) {
                  console.log(`[ErrorInterceptor] 401 on protected route (${request.url}) after auth ready. Redirecting to login.`);
                  // Perform sign out and redirect, then throw an error to stop the original stream
                  return from(this.authService.signOut()).pipe(
                    tap(() => {
                       // Navigation must happen inside tap/switchMap after signOut completes
                       this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url, sessionExpired: 'true' } });
                    }),
                    // Throw an error *after* navigation is initiated to prevent further processing
                    // of the original request's observable chain.
                    switchMap(() => throwError(() => new Error('Redirecting due to 401'))) 
                  );
                } else {
                  console.log(`[ErrorInterceptor] 401 on public/auth route (${request.url}) or login request after auth ready. Skipping redirect.`);
                  this.showSnackbar(errorMessage, errorAction, errorDuration);
                  // Propagate the original error message for component handling
                  return throwError(() => new Error(errorMessage)); 
                }
              }),
              // Catch errors specifically from the signOut/redirect process
              catchError(signOutOrRedirectError => {
                  console.error("[ErrorInterceptor] Error during sign out/redirect after 401:", signOutOrRedirectError);
                  // If sign out fails, maybe still try redirecting or just propagate the original error?
                  // For simplicity, just propagate a general error.
                   return throwError(() => new Error('Session expired or invalid. Please log in.')); 
              })
            );
          // --- End Specific 401 Handling ---

          } else {
             // Handle other non-401 backend errors
             if (status === 403) {
                errorMessage = `Forbidden: ${message || 'You do not have permission to access this resource.'}`;
             } else if (status === 404) {
                errorMessage = `Not Found: ${message || 'The requested resource could not be found.'}`;
             } // Add other status code handling as needed

             this.showSnackbar(errorMessage, errorAction, errorDuration);
             return throwError(() => new Error(errorMessage));
          }
        }
      })
    );
  }

  private showSnackbar(message: string, action: string, duration: number): void {
      this.snackBar.open(message, action, {
          duration: duration,
          panelClass: ['error-snackbar'] // Add custom CSS class for styling
      });
  }
}

