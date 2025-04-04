import { Injectable, inject } from '@angular/core';
import { CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot, Router, UrlTree } from '@angular/router';
import { FirebaseAuthService, AppUser } from '../services/firebase-auth.service';
import { SubscriptionService } from '../services/subscription.service';
import { Observable, map, take, switchMap, of, from } from 'rxjs';

export const premiumGuard: CanActivateFn =
  (route: ActivatedRouteSnapshot, state: RouterStateSnapshot):
  Observable<boolean | UrlTree> => {

    const authService = inject(FirebaseAuthService);
    const router = inject(Router);
    const subscriptionService = inject(SubscriptionService);
    const featureName = route.data['feature'] || 'Premium Feature';

    return from(authService.waitForAuthReady()).pipe(
      // Instead of taking user$, directly call isPremiumUser()
      switchMap(() => from(authService.isPremiumUser())), // Convert promise to observable
      map((hasActivePremium: boolean): boolean | UrlTree => {
        if (hasActivePremium) {
          // console.log('PremiumGuard: Access granted.');
          return true;
        } else {
          // console.log(`PremiumGuard: Access denied. Redirecting to subscription page for feature: ${featureName}`);
          // Check if user is actually logged in before redirecting
          // If not logged in, AuthGuard should handle redirect to login first.
          if (!authService.getCurrentUser()) { // Use getCurrentUser() for a synchronous check
             // console.log('PremiumGuard: User not logged in, letting AuthGuard handle redirect.');
             // Expect AuthGuard to run first/also and handle the login redirect.
             return false; // Deny access, AuthGuard will redirect.
          } else {
             // User is logged in but not premium
             subscriptionService.showSubscriptionPage(featureName);
             return false;
          }
        }
      })
    );
};