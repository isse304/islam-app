import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { StripeService } from './stripe.service';

@Injectable({
  providedIn: 'root'
})
export class SubscriptionService {
  constructor(
    private dialog: MatDialog,
    private router: Router,
    private stripeService: StripeService
  ) {}

  /**
   * Shows the subscription page when a premium feature is accessed
   * @param feature Optional feature name to highlight
   */
  showSubscriptionPage(feature: string): void {
    this.router.navigate(['/subscription'], { 
      queryParams: { feature } 
    });
  }
} 