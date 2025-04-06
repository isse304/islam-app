import { inject } from '@angular/core';
import { CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot, Router, UrlTree } from '@angular/router';
import { Observable, map, take, switchMap, from, filter, tap } from 'rxjs';
import { FirebaseAuthService } from '../services/firebase-auth.service';

export const NoAuthGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): Observable<boolean | UrlTree> => {
  const authService = inject(FirebaseAuthService);
  const router = inject(Router);

  console.log('[NoAuthGuard] Running...');

  return from(authService.waitForAuthReady()).pipe(
    tap(() => console.log('[NoAuthGuard] Auth Ready')),
    switchMap(() => authService.user$.pipe(
      filter(user => user !== undefined), // Ensure initial undefined is skipped
      take(1),
      map(user => {
        if (user) {
          console.log('[NoAuthGuard] User is authenticated, redirecting to /home');
          return router.createUrlTree(['/home']); // Redirect logged-in users away from auth pages
        } else {
          console.log('[NoAuthGuard] User is not authenticated, allowing access');
          return true; // Allow access to auth pages if not logged in
        }
      })
    ))
  );
};