import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, from, map, switchMap, take, catchError, of, timeout } from 'rxjs';
import { FirebaseAuthService } from '../services/firebase-auth.service';

export const premiumRedirectGuard: CanActivateFn = (
  route,
  state
): Observable<boolean | UrlTree> => {
  const authService = inject(FirebaseAuthService);
  const router = inject(Router);

  // Wait for auth state to be ready
  return from(authService.waitForAuthReady()).pipe(
    switchMap(() => authService.user$.pipe(take(1))), // Get the current user state once ready
    map(user => {
      if (user && user.isPremium) {
        // User is logged in AND already premium, redirect away from subscription page
        console.log('[PremiumRedirectGuard] User is already premium. Redirecting to /home.');
        return router.createUrlTree(['/home']);
      } else {
        // User is not logged in OR is not premium, allow access to the subscription page
        return true;
      }
    }),
    timeout(5000), // Add a timeout for safety
    catchError(err => {
      console.error('[PremiumRedirectGuard] Error:', err);
      // Fallback: Allow access if there's an error checking status
      return of(true);
    })
  );
}; 