import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';
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

        // Log the full technical error for debugging purposes
        console.error('HTTP Error Intercepted:', error);

        if (error.error instanceof ErrorEvent || error.status === 0) {
          // Client-side or network error (e.g., CORS, DNS, offline)
          errorMessage = `Network error: ${error.message || 'Could not connect to the server.'}`;
          console.error('Client/Network Error:', errorMessage);
          // Avoid redirecting for network errors unless specifically intended
        } else {
          // Backend returned an unsuccessful response code.
          // The response body might contain our standardized error format.
          console.error(
            `Backend returned code ${error.status}, ` +
            `body was: ${JSON.stringify(error.error)}`);

          // Attempt to parse standardized backend error structure
          const backendError = error.error; // e.g., { status, message, errorType, details }
          const status = backendError?.status || error.status; // Prefer status from body
          const message = backendError?.message || error.statusText; // Prefer message from body
          const errorType = backendError?.errorType; // e.g., 'ValidationError', 'AuthenticationError'

          errorMessage = message || `Server error (Status ${status})`; // Fallback message

          // Handle specific HTTP status codes
          switch (status) {
            case 400: // Bad Request (e.g., validation errors)
              errorMessage = `Bad Request: ${message || 'Please check your input.'}`;
              // TODO: Optionally parse validation details from `backendError.details` if needed
              break;
            case 401: // Unauthorized
              errorMessage = 'Unauthorized: Please log in again.';
              errorDuration = 7000;
              // Only sign out if it's not already a login attempt error
              if (!request.url.includes('/auth/login')) { // Adjust URL check if necessary
                 this.authService.signOut().then(() => {
                    this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url, sessionExpired: 'true' } });
                 }).catch(signOutError => console.error("Error signing out after 401:", signOutError));
              }
              break;
            case 403: // Forbidden
              errorMessage = `Forbidden: ${message || 'You do not have permission to access this resource.'}`;
              // Consider redirecting to an "access denied" page or home
              // this.router.navigate(['/access-denied']);
              break;
            case 404: // Not Found
              errorMessage = `Not Found: ${message || 'The requested resource could not be found.'}`;
              break;
            case 429: // Too Many Requests
              errorMessage = 'Too many requests have been made. Please wait a moment and try again.';
              break;
            case 500: // Internal Server Error
            case 502: // Bad Gateway
            case 503: // Service Unavailable
            case 504: // Gateway Timeout
              errorMessage = `Server Error: ${message || 'Something went wrong on our end. Please try again later.'}`;
              break;
            default:
              errorMessage = `Error ${status}: ${message || 'An unexpected error occurred.'}`;
          }
        }

        // Display the user-friendly error message using MatSnackBar
        // Avoid showing snackbar for 401 if redirecting immediately
        if (error.status !== 401) {
             this.snackBar.open(errorMessage, errorAction, {
               duration: errorDuration,
               panelClass: ['error-snackbar'] // Add custom CSS class for styling
             });
        }

        // It's important to re-throw the error so that component-level
        // error handlers (if any) can also react. We throw a user-friendly message.
        return throwError(() => new Error(errorMessage));
      })
    );
  }
}

