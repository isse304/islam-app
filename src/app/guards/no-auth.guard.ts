import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, from, map, switchMap, take, catchError, of, timeout, filter } from 'rxjs';
import { FirebaseAuthService } from '../services/firebase-auth.service';

export const NoAuthGuard: CanActivateFn = (
  route,
  state
): Observable<boolean | UrlTree> => {
  const authService = inject(FirebaseAuthService);
  const router = inject(Router);

  // console.log(`[NoAuthGuard] Activated for: ${state.url}`);

  return from(authService.waitForAuthReady()).pipe(
    // tap(() => console.log(`[NoAuthGuard] waitForAuthReady completed for ${state.url}.`)),
    switchMap(() => {
      // console.log(`[NoAuthGuard] Checking user$ state for ${state.url}...`);
      // Take the first emission after ready, whether null or AppUser
      return authService.user$.pipe(take(1)); 
    }),
    map(user => {
      const isLoggedIn = !!user;
      // console.log(`[NoAuthGuard] Check for URL: ${state.url}. Auth Ready. User state received: ${isLoggedIn ? `UID: ${user.uid}` : 'null'}`);
      if (isLoggedIn) { // User object exists (logged in)
        // console.log(`[NoAuthGuard] Decision for ${state.url}: User IS logged in. REDIRECTING to /home.`);
        return router.createUrlTree(['/home']); // Redirect to home
      } else { // User is explicitly null (logged out)
        // console.log(`[NoAuthGuard] Decision for ${state.url}: User is NOT logged in. ALLOWING access.`);
        return true; // Allow access
      }
    }),
    timeout(10000), // Keep timeout reasonable
    catchError(err => {
      console.error(`[NoAuthGuard] Timeout/Error in guard for ${state.url}:`, err);
      // Fallback: Allow access to public pages on error
      // console.log(`[NoAuthGuard] Allowing access to ${state.url} due to error`);
      return of(true);
    })
  );
};