import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { FirebaseAuthService } from '../services/firebase-auth.service';
import { Observable, map, take } from 'rxjs';

/**
 * Prevents authenticated users from accessing routes like login/signup.
 * Redirects them to the home page ('/home') if they are already logged in.
 */
export const publicGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const authService = inject(FirebaseAuthService);
  const router = inject(Router);

  // Rely on APP_INITIALIZER for initial readiness.
  // Auth state should be definitive by the time this runs.
  return authService.user$.pipe(
    take(1), // Take the definitive state available after APP_INITIALIZER
    map(user => {
      console.log(`[PublicGuard] Received user state after take(1):`, user ? user.email : 'null');
      const isAuthenticated = !!user;
      // console.log(`PublicGuard Check (after delay): User authenticated = ${isAuthenticated}`);

      if (isAuthenticated) {
        // console.log('[PublicGuard] User authenticated, redirecting to home.');
        // If authenticated, redirect directly to the intended destination (home)
        return router.createUrlTree(['/home']); 
      } else {
        // console.log('[PublicGuard] User not authenticated, allowing access.');
        // If not authenticated, allow access to the public page (login/signup)
        return true;
      }
    })
  );
};
