import { inject } from '@angular/core';
import { CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot, Router, UrlTree } from '@angular/router';
import { Observable, map, take, filter, switchMap, from, tap, catchError, of, timeout } from 'rxjs';
import { FirebaseAuthService } from '../services/firebase-auth.service';

export const authGuardFn: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): Observable<boolean | UrlTree> => {
  const authService = inject(FirebaseAuthService);
  const router = inject(Router);

  // console.log(`[AuthGuard] Activated for: ${state.url}`);

  return from(authService.waitForAuthReady()).pipe(
    switchMap(() => authService.user$), // Switch to the user$ stream AFTER ready
    filter(user => user !== undefined),   // Filter out initial undefined state
    take(1),                            // Take the first actual state (null or AppUser)
    map(user => {
      const isLoggedIn = !!user;
      // console.log(`[AuthGuard] Check for URL: ${state.url}. Auth Ready. User state received: ${isLoggedIn ? `UID: ${user.uid}, Verified: ${user.emailVerified}` : 'null'}`);

      if (isLoggedIn) { // User is logged in
        if (user.emailVerified || state.url.includes('/auth/verify-email')) { 
          // Allow access if email is verified OR if navigating to the verify-email page itself
          // console.log(`[AuthGuard] Decision for ${state.url}: User IS logged in (Verified: ${user.emailVerified}) -> ALLOWING access.`);
          return true;
        } else {
          // console.log(`[AuthGuard] Decision for ${state.url}: User IS logged in BUT NOT verified -> REDIRECTING to /auth/verify-email.`);
          return router.createUrlTree(['/auth/verify-email']); // Redirect to verification page
        }
      } else { // User is logged out (null)
        // console.log(`[AuthGuard] Decision for ${state.url}: User is NOT logged in -> REDIRECTING to /auth/login.`);
        authService.redirectUrl = state.url; // Store intended URL
        return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } }); // Redirect to login
      }
    }),
    timeout(10000),
    catchError(err => {
      console.error(`[AuthGuard] Error in guard for ${state.url}:`, err);
      // Fallback: Redirect to login on error
      // console.log(`[AuthGuard] Redirecting to /auth/login from ${state.url} due to error`);
      authService.redirectUrl = state.url;
      return of(router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } }));
    })
  );
};
