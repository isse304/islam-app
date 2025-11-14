import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable, of, from } from 'rxjs';
import { switchMap, map, take } from 'rxjs/operators';
import { FirebaseAuthService } from '../services/firebase-auth.service';
import { authGuardFn } from './auth.guard';

export const roleGuardFn: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): Observable<boolean | UrlTree> => {
  const authService = inject(FirebaseAuthService);
  const router = inject(Router);
  const expectedRole = route.data['role'];

  const canActivateResult = authGuardFn(route, state);

  // Convert the result to an Observable if it's not already one
  const canActivate$ =
    canActivateResult instanceof Observable
      ? canActivateResult
      : from(Promise.resolve(canActivateResult));

  return canActivate$.pipe(
    switchMap(canActivate => {
      if (!canActivate || canActivate instanceof UrlTree) {
        // If auth guard fails or returns a redirect tree, pass it through
        return of(canActivate);
      }
      
      // If auth guard succeeds, check the role
      return authService.user$.pipe(
        take(1),
        map(user => {
          if (user && user.role === expectedRole) {
            return true;
          } else {
            // Redirect to a suitable page if the role doesn't match
            return router.createUrlTree(['/home']); 
          }
        })
      );
    })
  );
};
