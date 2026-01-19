import { inject } from '@angular/core';
import { CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable, of } from 'rxjs';

/**
 * Optional Auth Guard
 * 
 * Allows access regardless of authentication state.
 * Components can check auth state internally to show different UI.
 * Use this for routes that work better with authentication but are accessible without it.
 * 
 * Example usage:
 * { path: 'home', component: HomeComponent, canActivate: [optionalAuthGuard] }
 */
export const optionalAuthGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): Observable<boolean> => {
  // Always allow access - no blocking
  // Components handle showing sign-in prompts or limited features
  return of(true);
};
