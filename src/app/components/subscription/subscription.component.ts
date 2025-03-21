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
  currentPeriodEnd?: Date | null;
  features?: {
    aiChat: boolean;
    tafsirAccess: boolean;
    wordByWord: boolean;
  };
}

interface SubscriptionResponse {
  status: 'trialing' | 'active' | 'canceled' | 'past_due' | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'free';
  plan: 'free' | 'standard' | 'premium';
  features?: {
    aiChat: boolean;
    tafsirAccess: boolean;
    wordByWord: boolean;
  };
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
  loadError: string | null = null;

  constructor(
    private stripeService: StripeService,
    private snackBar: MatSnackBar,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private firebaseAuthService: FirebaseAuthService
  ) {}

  ngOnInit() {
    // Initialize Stripe immediately
    try {
      this.stripe = Stripe(environment.stripeConfig.publishableKey);
    } catch (error) {
      console.error('Error initializing Stripe:', error);
      this.loadError = 'Failed to initialize payment system';
    }

    // Load subscription status with timeout
    this.loadSubscriptionStatus();
    
    // Get feature from URL query params
    this.route.queryParams.subscribe(params => {
      this.feature = params['feature'];
    });
  }

  private async loadSubscriptionStatus() {
    try {
      // Set loading state
      this.isLoading = true;
      this.loadError = null;

      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), 10000);
      });

      // Race between actual request and timeout
      const response = await Promise.race([
        firstValueFrom(this.stripeService.getSubscriptionStatus()),
        timeoutPromise
      ]) as SubscriptionResponse;

      this.subscriptionStatus = {
        status: response.status === 'canceled' ? 'canceled' : 
               response.status === 'trialing' ? 'trialing' : 
               response.status as SubscriptionStatus['status'],
        plan: response.plan,
        features: response.features
      };
    } catch (error) {
      console.error('Error loading subscription status:', error);
      this.loadError = 'Failed to load subscription status. Please try again.';
      this.snackBar.open(this.loadError, 'Close', { duration: 5000 });
    } finally {
      this.isLoading = false;
    }
  }

  // Add retry functionality
  async retryLoad() {
    this.loadError = null;
    await this.loadSubscriptionStatus();
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
    
    try {
      // Show immediate user feedback
      this.snackBar.open('Starting subscription process...', '', { duration: 1500 });

      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      );
      
      // Race between actual request and timeout
      const response = await Promise.race([
        firstValueFrom(this.stripeService.createCheckoutSession(environment.stripeConfig.priceId)),
        timeoutPromise
      ]) as { url: string };
      
      if (response?.url) {
        // Handle development mode
        if (response.url.includes('mock-success') || response.url.includes('dev=true')) {
          await this.handleDevModeSuccess();
          return;
        }
        
        await this.stripeService.redirectToCheckout(response.url);
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      this.handleSubscriptionError(error);
    } finally {
      this.isLoading = false;
    }
  }

  private async handleDevModeSuccess() {
    console.log('Development mode detected, simulating successful subscription');
    
    const authService = this.authService || this.firebaseAuthService;
    if (authService) {
      try {
        await authService.updateUserPreferences({
          subscriptionStatus: 'trial'
        });
        this.snackBar.open('Trial activated in development mode!', 'Close', { duration: 3000 });
        
        setTimeout(() => {
          this.router.navigate(['/dashboard']);
        }, 1000);
      } catch (err) {
        console.error('Error updating local subscription status:', err);
        this.handleSubscriptionError(err);
      }
    }
  }

  private handleSubscriptionError(error: any) {
    console.error('Error in subscription process:', error);
    
    let errorMessage = 'Failed to start subscription process. Please try again later.';
    if (error instanceof Error && error.message === 'Request timeout') {
      errorMessage = 'Request timed out. Please try again or contact support.';
    }
    
    this.snackBar.open(errorMessage, 'Close', { duration: 5000 });
  }
} 