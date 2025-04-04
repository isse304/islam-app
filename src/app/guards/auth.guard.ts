import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router, UrlTree } from '@angular/router';
import { FirebaseAuthService } from '../services/firebase-auth.service';
import { Observable, map, take, filter, delay, switchMap, from } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private authService: FirebaseAuthService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean | UrlTree> {
    // console.log(`[AuthGuard] Checking access for: ${state.url}`);
    // Wait for auth service to be ready first
    return from(this.authService.waitForAuthReady()).pipe(
      // Then, switch to the user$ observable
      switchMap(() => this.authService.user$.pipe(
        // Wait until the user state is definitively determined (not undefined initial state)
        filter(user => user !== undefined),
        // Take the first emitted value (which will be null or the user object)
        take(1),
        map(user => {
          // console.log(`[AuthGuard] User state checked for ${state.url}:`, user ? user.email : 'null');
          const isAuthenticated = !!user;

          if (isAuthenticated) {
            // console.log(`[AuthGuard] Allowing access to ${state.url}`);
            return true;
          } else {
            // console.log(`[AuthGuard] Denying access to ${state.url}, redirecting to login.`);
            // Redirect to login, preserving the intended destination
            return this.router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
          }
        })
      ))
    );
  }
}
