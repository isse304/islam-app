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
    const showTeaser = route.data['showTeaser'] ?? false; // New option to show teaser instead of subscription

    return from(authService.waitForAuthReady()).pipe(
      switchMap(() => authService.user$.pipe(take(1))),
      switchMap((user: AppUser | null) => {
        // Step 1: Check if user is authenticated
        if (!user) {
          // Not authenticated
          if (showTeaser) {
            // Show teaser page for anonymous users
            return of(router.createUrlTree(['/ai-tafsir']));
          } else {
            // Redirect to login for other premium features
            const returnUrl = state.url;
            return of(router.createUrlTree(['/auth/login'], { 
              queryParams: { returnUrl, feature: featureName } 
            }));
          }
        }

        // Step 2: User is authenticated, check premium status
        return from(authService.isPremiumUser()).pipe(
          map((hasActivePremium: boolean): boolean | UrlTree => {
            if (hasActivePremium) {
              // User has premium - allow access
              return true;
            } else {
              // User doesn't have premium
              if (showTeaser) {
                // Show teaser page for logged-in non-premium users
                return router.createUrlTree(['/ai-tafsir']);
              } else {
                // Redirect to subscription for other premium features
                return router.createUrlTree(['/subscription'], { 
                  queryParams: { feature: featureName } 
                });
              }
            }
          })
        );
      })
    );
  };