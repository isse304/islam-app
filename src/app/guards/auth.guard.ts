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
    // Ensures Firebase is initialized before checking user state
    switchMap(() => {
      // console.log(`[AuthGuard] Firebase ready for ${state.url}. Switching to user$`);
      // Now wait specifically for the first emission that is NOT undefined
      return authService.user$.pipe(
        // tap(user => console.log(`[AuthGuard] user$ emitted for ${state.url}: ${user === null ? 'null' : (user ? user.uid : 'undefined')}`)),
        filter(user => user !== undefined), // Wait until user state is determined (null or AppUser)
        take(1)                             // Take only that first determined state
      );
    }),
    map(user => {
      // console.log(`[AuthGuard] user$ state after filter/take(1): ${user ? user.uid : 'null'}`);
      // Check the user state here
      if (user) { // User IS logged in
        if (user.emailVerified || state.url.includes('/auth/verify-email')) {
          // Allow access if email is verified OR if navigating to the verify-email page itself
          // console.log(`[AuthGuard] Decision for ${state.url}: User IS logged in (Verified: ${user.emailVerified}) -> ALLOWING access.`);
          return true;
        } else {
          // console.log(`[AuthGuard] Decision for ${state.url}: User IS logged in BUT NOT verified -> REDIRECTING to /auth/verify-email.`);
          return router.createUrlTree(['/auth/verify-email']); // Redirect to verification page
        }
      } else { // User is logged out (null)
        // console.log(`[AuthGuard] User is null. REDIRECTING to /auth/login.`);
        authService.redirectUrl = state.url;
        return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
      }
    }),
    timeout(10000),
    catchError(err => {
      console.error(`[AuthGuard] Error/Timeout in guard for ${state.url}:`, err);
      // Fallback: Redirect to login on error
      // console.log(`[AuthGuard] Redirecting to /auth/login from ${state.url} due to error`);
      authService.redirectUrl = state.url;
      return of(router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } }));
    })
  );
};
