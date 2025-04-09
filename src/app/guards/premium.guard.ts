import { Injectable, inject } from '@angular/core';
import { CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot, Router, UrlTree } from '@angular/router';
import { FirebaseAuthService, AppUser } from '../services/firebase-auth.service';
// import { SubscriptionService } from '../services/subscription.service'; // Removed if not used elsewhere in file
import { Observable, map, take, switchMap, of, from } from 'rxjs';

export const premiumGuard: CanActivateFn =
  (route: ActivatedRouteSnapshot, state: RouterStateSnapshot):
  Observable<boolean | UrlTree> => {

    const authService = inject(FirebaseAuthService);
    const router = inject(Router); // Need router for createUrlTree
    // const subscriptionService = inject(SubscriptionService); // Removed if not needed
    const featureName = route.data['feature'] || 'Premium Feature';

    // console.log('[PremiumGuard] Running...'); // ADD LOG

    return from(authService.waitForAuthReady()).pipe(
      switchMap(() => from(authService.isPremiumUser())), // Convert promise to observable
      map((hasActivePremium: boolean): boolean | UrlTree => {
        // console.log(`[PremiumGuard] isPremiumUser result: ${hasActivePremium}`); // ADD LOG
        if (hasActivePremium) {
          // console.log('[PremiumGuard] Access granted, returning true.'); // ADD LOG
          return true;
        } else {
          // console.log(`[PremiumGuard] Access denied. Creating UrlTree to redirect to /subscription for feature: ${featureName}`); // ADD LOG
          // Use createUrlTree for redirection
          return router.createUrlTree(['/subscription'], { queryParams: { feature: featureName } }); // RETURN UrlTree
        }
      })
    );
};