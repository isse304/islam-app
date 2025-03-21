import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { FirebaseAuthService } from '../services/firebase-auth.service';

@Injectable({
  providedIn: 'root'
})
export class PremiumGuard implements CanActivate {
  constructor(
    private authService: FirebaseAuthService,
    private router: Router
  ) {}

  async canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<boolean> {
    const isAuthenticated = await this.authService.isAuthenticated();
    
    if (!isAuthenticated) {
      // Save current route and redirect to login
      await this.authService.login();
      return false;
    }
    
    // Check if user has premium subscription
    const user = await this.authService.user$.pipe().toPromise();
    
    // Enhanced subscription check - handle both formats
    // 1. Check user preferences.subscriptionStatus (old way)
    const subscriptionStatus = user?.preferences?.subscriptionStatus || '';
    
    // 2. Handle all possible subscription status formats
    const isPremium = 
      ['active', 'trial', 'premium'].includes(subscriptionStatus) || 
      // Check if subscription status might be in API response 
      await this.authService.isPremiumUser();
    
    if (!isPremium) {
      // Save the attempted URL to redirect back after subscription
      const returnUrl = state.url;
      this.router.navigate(['/premium'], { 
        queryParams: { returnUrl }
      });
      return false;
    }
    
    return true;
  }
} 