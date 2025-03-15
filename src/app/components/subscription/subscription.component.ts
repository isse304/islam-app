import { Component, OnInit } from '@angular/core';
import { StripeService } from '../../services/stripe.service';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { FirebaseAuthService } from '../../services/firebase-auth.service';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule } from '@angular/material/snack-bar';

declare const Stripe: any;

interface SubscriptionStatus {
  status: 'trialing' | 'active' | 'canceled' | 'past_due' | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'free';
  plan: 'free' | 'standard' | 'premium';
  currentPeriodEnd: Date | null;
}

@Component({
  selector: 'app-subscription',
  templateUrl: './subscription.component.html',
  styleUrls: ['./subscription.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatSnackBarModule
  ]
})
export class SubscriptionComponent implements OnInit {
  private stripe: any;
  subscriptionStatus?: SubscriptionStatus;
  feature?: string;
  isLoading = false;

  constructor(
    private stripeService: StripeService,
    private snackBar: MatSnackBar,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private firebaseAuthService: FirebaseAuthService
  ) {}

  ngOnInit() {
    this.stripe = Stripe(environment.stripeConfig.publishableKey);
    this.loadSubscriptionStatus();
    
    // Get feature from URL query params
    this.route.queryParams.subscribe(params => {
      this.feature = params['feature'];
    });
  }

  private async loadSubscriptionStatus() {
    try {
      const response = await firstValueFrom(this.stripeService.getSubscriptionStatus());
      this.subscriptionStatus = {
        status: response.status === 'canceled' ? 'canceled' : 
               response.status === 'trialing' ? 'trialing' : 
               response.status as SubscriptionStatus['status'],
        plan: response.plan,
        currentPeriodEnd: response.currentPeriodEnd ? new Date(response.currentPeriodEnd) : null
      };
    } catch (error) {
      this.snackBar.open('Failed to load subscription status', 'Close', { duration: 5000 });
    }
  }

  isFeatureHighlighted(category: string): boolean {
    if (!this.feature) return false;
    
    const categoryMap: { [key: string]: string[] } = {
      'AI Features': ['AI Insights', 'Emotional Dua Search', 'Smart Tafsir'],
      'Learning': ['Learn Feature', 'Advanced Quran Study', 'Tafsir Access']
    };

    return categoryMap[category]?.some(f => 
      this.feature?.toLowerCase().includes(f.toLowerCase())
    ) || false;
  }

  async startSubscription() {
    if (this.isLoading) return;
    this.isLoading = true;
    
    console.log('Starting subscription process...');
    
    // Show immediate user feedback
    this.snackBar.open('Starting trial activation process...', '', { duration: 1500 });

    try {
      // OPTIMIZED: Skip health check in development mode to speed up process
      if (environment.production) {
        console.log('Testing API connectivity...');
        const testUrl = `${environment.apiUrl}/api/health`;
        const response = await fetch(testUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (response.status === 404 || response.status >= 500) {
          console.warn('API health endpoint not available:', {
            status: response.status,
            statusText: response.statusText
          });
          
          this.snackBar.open(
            'Subscription service is currently unavailable. Please try again later.', 
            'Close', 
            { duration: 5000 }
          );
          return;
        }
      }
      
      // OPTIMIZED: Add timeout to prevent long requests
      console.log('Creating checkout session with price ID:', environment.stripeConfig.priceId);
      
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 5000)
      );
      
      // Use Promise.race to implement timeout
      const response = await Promise.race([
        firstValueFrom(this.stripeService.createCheckoutSession(environment.stripeConfig.priceId)),
        timeoutPromise
      ]) as { url: string };
      
      console.log('Checkout session response:', response);
      
      if (response?.url) {
        console.log('Redirecting to checkout URL:', response.url);
        
        // OPTIMIZED: Handle development mode faster
        if (response.url.includes('mock-success') || response.url.includes('dev=true')) {
          console.log('Development mode detected, simulating successful subscription');
          
          // In dev mode, update user preferences locally to enable features immediately
          const authService = this.authService || this.firebaseAuthService;
          if (authService) {
            try {
              await authService.updateUserPreferences({
                subscriptionStatus: 'trial'
              });
              this.snackBar.open('Trial activated in development mode!', 'Close', { duration: 3000 });
              
              // Delay to show message before redirecting
              setTimeout(() => {
                this.router.navigate(['/dashboard']);
              }, 1000);
              return;
            } catch (err) {
              console.error('Error updating local subscription status:', err);
            }
          }
        }
        
        await this.stripeService.redirectToCheckout(response.url);
      } else {
        console.error('No checkout URL received in response:', response);
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      console.error('Error starting subscription:', error);
      
      // Check if this is a timeout error
      let errorMessage = 'Failed to start subscription process. Please try again later.';
      if (error instanceof Error && error.message === 'Request timeout') {
        errorMessage = 'Request timed out. This might mean your server is running slowly. Try again or contact support.';
      }
      
      this.snackBar.open(errorMessage, 'Close', { duration: 5000 });
    } finally {
      this.isLoading = false;
    }
  }
} 