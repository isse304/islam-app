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

  return from(authService.waitForAuthReady()).pipe(
    tap(() => {}),
    switchMap(() => authService.user$.pipe(
      filter(user => user !== undefined),
      take(1),
      map(user => {
        const isAuthenticated = !!user;

        if (isAuthenticated) {
          if (user.emailVerified) {
            return true;
          } else {
            return router.createUrlTree(['/auth/verify-email']);
          }
        } else {
          return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
        }
      })
    ))
  );
};
