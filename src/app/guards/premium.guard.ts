import { Injectable, inject } from '@angular/core';
import { CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot, Router, UrlTree } from '@angular/router';
import { FirebaseAuthService, AppUser } from '../services/firebase-auth.service';
// import { SubscriptionService } from '../services/subscription.service'; // Removed if not used elsewhere in file
import { Observable, map, take, switchMap, of, from } from 'rxjs';

/**
 * Premium Guard - Updated for Public Access
 * 
 * Protects routes that require both authentication AND premium subscription.
 * If user is not authenticated, redirects to login with returnUrl.
 * If user is authenticated but not premium, redirects to subscription page.
 * 
 * This guard first checks authentication, then premium status.
 */
export const premiumGuard: CanActivateFn =
  (route: ActivatedRouteSnapshot, state: RouterStateSnapshot):
  Observable<boolean | UrlTree> => {

    const authService = inject(FirebaseAuthService);
    const router = inject(Router);
    const featureName = route.data['feature'] || 'Premium Feature';

    return from(authService.waitForAuthReady()).pipe(
      switchMap(() => authService.user$.pipe(take(1))),
      switchMap((user: AppUser | null) => {
        if (!user) {
          const returnUrl = state.url;
          return of(router.createUrlTree(['/auth/login'], { 
            queryParams: { returnUrl, feature: featureName } 
          }));
        }

        return from(authService.isPremiumUser()).pipe(
          map((hasActivePremium: boolean): boolean | UrlTree => {
            if (hasActivePremium) {
              return true;
            } else {
              return router.createUrlTree(['/subscription'], { 
                queryParams: { feature: featureName } 
              });
            }
          })
        );
      })
    );
  };