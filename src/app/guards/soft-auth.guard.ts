import { inject } from '@angular/core';
import { CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable, of } from 'rxjs';

/**
 * Soft Auth Guard
 * 
 * Always allows access without any authentication checks.
 * Use this for fully public routes like Quran Reader, Dua browsing, About, Contact.
 * Components can optionally show "Sign in for more features" prompts.
 * 
 * This guard is essentially a no-op but makes route configuration clearer
 * by explicitly marking routes as public.
 * 
 * Example usage:
 * { path: 'quran', component: QuranReaderComponent, canActivate: [softAuthGuard] }
 */
export const softAuthGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): Observable<boolean> => {
  // Always allow access - fully public
  return of(true);
};
