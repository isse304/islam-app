import { inject } from '@angular/core';
import { CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot, Router, UrlTree } from '@angular/router';
import { Observable, map, take, switchMap, from, filter, tap, catchError, timeout, of } from 'rxjs';
import { FirebaseAuthService } from '../services/firebase-auth.service';

export const NoAuthGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): Observable<boolean | UrlTree> => {
  const authService = inject(FirebaseAuthService);
  const router = inject(Router);

  // console.log('[NoAuthGuard] Running...');

  return from(authService.waitForAuthReady()).pipe(
    // Add timeout and error handling for waitForAuthReady
    timeout(10000), // Wait max 10 seconds
    catchError(err => {
      console.error('[NoAuthGuard] Timeout or error waiting for auth ready:', err);
      // Decide fallback: Allow access? Redirect to error? Allowing seems safer for NoAuthGuard.
      return of(true); 
    }),
    // tap(() => console.log('[NoAuthGuard] Auth Ready')), // Keep tap commented out unless debugging
    switchMap(() => authService.user$.pipe(
      // Add timeout and error handling for user$ check
      timeout(5000), // Shorter timeout for user check
      catchError(err => {
        console.error('[NoAuthGuard] Timeout or error checking user state:', err);
        // Fallback: Allow access on error during check?
        return of(null); // Treat error as logged out
      }),
      filter(user => user !== undefined), // Ensure initial undefined is skipped
      take(1),
      map(user => {
        if (user) {
          // console.log('[NoAuthGuard] User is authenticated, redirecting to /home');
          return router.createUrlTree(['/home']); // Redirect logged-in users away from auth pages
        } else {
          // console.log('[NoAuthGuard] User is not authenticated, allowing access');
          return true; // Allow access to auth pages if not logged in
        }
      })
    ))
  );
};