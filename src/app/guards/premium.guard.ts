import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { SubscriptionService } from '../services/subscription.service';

@Injectable({
  providedIn: 'root'
})
export class PremiumGuard implements CanActivate {
  constructor(
    private subscriptionService: SubscriptionService,
    private router: Router
  ) {}

  async canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<boolean> {
    const feature = route.data['feature'] || 'this feature';
    const hasAccess = await this.subscriptionService.checkPremiumAccess(feature);
    
    if (!hasAccess) {
      this.router.navigate(['/']);
      return false;
    }
    
    return true;
  }
} 