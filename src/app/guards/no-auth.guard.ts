import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, from, map, switchMap, take, catchError, of, timeout, filter, tap } from 'rxjs';
import { FirebaseAuthService } from '../services/firebase-auth.service';

export const NoAuthGuard: CanActivateFn = (
  route,
  state
): Observable<boolean | UrlTree> => {
  const authService = inject(FirebaseAuthService);
  const router = inject(Router);

  // console.log(`[NoAuthGuard] Activated for: ${state.url}`);

  return from(authService.waitForAuthReady()).pipe(
    // Ensures Firebase is initialized before checking user state
    switchMap(() => {
      // console.log(`[NoAuthGuard] Firebase ready for ${state.url}. Switching to user$`);
      // Wait specifically for the first emission that is NOT undefined
      return authService.user$.pipe(
        // tap(user => console.log(`[NoAuthGuard] user$ emitted for ${state.url}: ${user === null ? 'null' : (user ? user.uid : 'undefined')}`)),
        filter(user => user !== undefined), // Wait until user state is determined (null or AppUser)
        take(1)                             // Take only that first determined state
      );
    }),
    map(user => {
      const isLoggedIn = !!user;
      // console.log(`[NoAuthGuard] Determined user state for ${state.url}: ${isLoggedIn ? `UID: ${user.uid}` : 'null'}`);

      if (isLoggedIn) { // User IS logged in
        // console.log(`[NoAuthGuard] Decision for ${state.url}: User IS logged in. REDIRECTING to /home.`);
        return router.createUrlTree(['/home']); // Redirect logged-in users away
      } else { // User is null (definitively logged out)
        // console.log(`[NoAuthGuard] Decision for ${state.url}: User is NOT logged in. ALLOWING access.`);
        return true; // Allow access
      }
    }),
    timeout(10000),
    catchError(err => {
      console.error(`[NoAuthGuard] Error/Timeout in guard for ${state.url}:`, err);
      // Fallback: Allow access on error, as it's usually for public pages
      // console.log(`[NoAuthGuard] Allowing access to ${state.url} due to error/timeout.`);
      return of(true);
    })
  );
};