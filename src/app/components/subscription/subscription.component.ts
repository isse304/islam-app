import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom, take } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { FirebaseAuthService } from '../../services/firebase-auth.service';
import { StripeService } from '../../services/stripe.service';
import { ApiService } from '../../services/api.service';
import { Subscription } from 'rxjs';
import { AppUser } from '../../services/auth.service';

interface SubscriptionStatus {
  status: 'active' | 'canceled' | 'inactive';
  plan: 'free' | 'premium';
  currentPeriodEnd?: Date | null;
  features?: {
    emotionalDuaSearch: boolean;
    aiTafsirChat: boolean;
    duaInsights: boolean;
    aiChat: boolean;
    tafsirAccess: boolean;
    wordByWord: boolean;
  };
}

interface SubscriptionResponse {
  status: 'active' | 'canceled' | 'inactive';
  plan: 'free' | 'premium';
  features?: {
    emotionalDuaSearch: boolean;
    aiTafsirChat: boolean;
    duaInsights: boolean;
    aiChat: boolean;
    tafsirAccess: boolean;
    wordByWord: boolean;
  };
}

interface CheckoutResponse {
  url: string;
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
export class SubscriptionComponent implements OnInit, OnDestroy {
  subscriptionStatus?: SubscriptionStatus;
  feature?: string;
  isLoading = false;
  loadError: string | null = null;
  currentPreferences: any = { reciterId: 1 };
  currentUser: AppUser | null = null;
  private userSub?: Subscription;
  private routeSub?: Subscription;

  constructor(
    private stripeService: StripeService,
    private snackBar: MatSnackBar,
    private route: ActivatedRoute,
    private router: Router,
    private firebaseAuthService: FirebaseAuthService,
    private apiService: ApiService
  ) {}

  ngOnInit() {
    console.log('Subscription component initializing...');
    
    // Force check auth state
    this.firebaseAuthService.isAuthenticated().then(isAuth => {
      console.log('Auth state check result:', isAuth);
      if (!isAuth) {
        console.log('User not authenticated, checking cached state...');
        const cachedUser = localStorage.getItem('currentUser');
        if (cachedUser) {
          console.log('Found cached user, reinitializing from cache...');
          this.firebaseAuthService['initFromCache']();
        }
      }
    });
    
    // Handle subscription success redirect
    this.routeSub = this.route.queryParams.subscribe(params => {
      if (params['success']) {
        this.handleSubscriptionSuccess();
      }
    });

    // Load initial status
    this.loadSubscriptionStatus();
    
    // Get feature from URL query params
    this.routeSub = this.route.queryParams.subscribe(params => {
      this.feature = params['feature'];
    });

    // Subscribe to user changes using FirebaseAuthService
    this.userSub = this.firebaseAuthService.user$.subscribe(user => {
      console.log('Current user updated:', user);
      this.currentUser = user;
      
      // Only redirect to home if user is premium and we're not in a subscription-related route
      const currentUrl = this.router.url;
      if (user?.isPremium && 
          !currentUrl.includes('/subscription') && 
          !currentUrl.includes('/checkout') &&
          !currentUrl.includes('/success') &&
          !currentUrl.includes('/cancel')) {
        this.router.navigate(['/home']);
      }
    });
  }

  ngOnDestroy() {
    if (this.userSub) {
      this.userSub.unsubscribe();
    }
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
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
               response.status === 'active' ? 'active' : 'inactive',
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
    if (this.isLoading) {
        console.log('Already processing subscription request');
        return;
    }
    
    this.isLoading = true;
    this.loadError = null;

    try {
        console.log('Starting subscription process...');
        
        // Wait for current user data from FirebaseAuthService
        const user = await firstValueFrom(this.firebaseAuthService.user$.pipe(take(1)));
        console.log('Current user state:', user);

        if (!user) {
            console.log('No current user, redirecting to login');
            // Save the current URL for redirect back after sign-in
            localStorage.setItem('returnUrl', window.location.pathname);
            // Redirect to sign-in page
            this.router.navigate(['/auth/login'], { 
                queryParams: { 
                    returnUrl: window.location.pathname,
                    feature: 'premium'
                }
            });
            return;
        }

        // Ensure we're using the Firebase UID
        const userId = user.uid;
        if (!userId) {
            throw new Error('Invalid user ID');
        }
        console.log('Using Firebase UID:', userId);

        // Clear any existing return URL to prevent unwanted redirects
        localStorage.removeItem('returnUrl');

        if (window.location.protocol !== 'https:' && !window.location.hostname.includes('localhost')) {
            console.warn('Warning: Stripe requires HTTPS in production.');
        }

        // Get fresh token before creating checkout session
        console.log('Getting fresh auth token...');
        const token = await this.firebaseAuthService.getToken(true);
        if (!token) {
            throw new Error('Unable to get authentication token');
        }

        console.log('Creating checkout session...');
        const response = await this.apiService.createCheckoutSession(userId);

        if (response?.url) {
            console.log('Redirecting to Stripe checkout:', response.url);
            // Use window.location.assign instead of href for better error handling
            window.location.assign(response.url);
        } else {
            console.error('No checkout URL received');
            throw new Error('No checkout URL received');
        }
    } catch (error: any) {
        console.error('Subscription error:', error);
        this.loadError = error.message || 'Failed to start subscription process';
        this.snackBar.open(
            'Unable to start subscription process. Please try again.',
            'Close',
            { duration: 5000 }
        );
    } finally {
        this.isLoading = false;
    }
  }

  private async handleSubscriptionSuccess() {
    try {
      this.isLoading = true;
      console.log('Handling subscription success...');

      // Force a subscription status refresh
      await this.firebaseAuthService.refreshSubscriptionStatus();
      
      // Get latest subscription status
      const response = await firstValueFrom(this.stripeService.getSubscriptionStatus());
      
      if (response.status === 'active') {
        // Update local state with all required feature flags
        this.subscriptionStatus = {
          status: 'active',
          plan: 'premium',
          features: {
            emotionalDuaSearch: response.features?.emotionalDuaSearch || true,
            aiTafsirChat: response.features?.aiTafsirChat || true,
            duaInsights: response.features?.duaInsights || true,
            aiChat: response.features?.aiChat || true,
            tafsirAccess: response.features?.tafsirAccess || true,
            wordByWord: response.features?.wordByWord || true
          }
        };

        // Show success message
        this.snackBar.open(
          'Subscription activated successfully! You now have access to premium features.',
          'Close',
          { duration: 5000 }
        );

        // Clear success param from URL
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { success: null },
          queryParamsHandling: 'merge'
        });
      } else {
        throw new Error('Subscription not active after payment');
      }
    } catch (error) {
      console.error('Error handling subscription success:', error);
      this.snackBar.open(
        'There was an issue activating your subscription. Please contact support.',
        'Close',
        { duration: 5000 }
      );
    } finally {
      this.isLoading = false;
    }
  }
} 