import { inject } from '@angular/core';
import { CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot, Router, UrlTree } from '@angular/router';
import { FirebaseAuthService } from '../services/firebase-auth.service';
import { Observable, map, take, filter, switchMap, from, tap } from 'rxjs';

export const authGuardFn: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): Observable<boolean | UrlTree> => {
  const authService = inject(FirebaseAuthService);
  const router = inject(Router);

  console.log(`[AuthGuardFn] Running for: ${state.url}`);

  return from(authService.waitForAuthReady()).pipe(
    tap(() => console.log(`[AuthGuardFn] waitForAuthReady completed for ${state.url}`)),
    switchMap(() => authService.user$.pipe(
      filter(user => user !== undefined),
      take(1),
      map(user => {
        console.log(`[AuthGuardFn] User state check for ${state.url}:`, user ? `${user.email} (Verified: ${user.emailVerified})` : 'null');
        const isAuthenticated = !!user;

        if (isAuthenticated) {
          if (user.emailVerified) {
            console.log(`[AuthGuardFn] Allowing access to ${state.url}, returning true.`);
            return true;
          } else {
            console.log(`[AuthGuardFn] User authenticated but email not verified. Redirecting to /auth/verify-email for ${state.url}.`);
            return router.createUrlTree(['/auth/verify-email']);
          }
        } else {
          console.log(`[AuthGuardFn] User not authenticated. Denying access to ${state.url}, creating UrlTree to redirect to login.`);
          return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
        }
      })
    ))
  );
};
