import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom, take, switchMap, catchError, of } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { FirebaseAuthService } from '../../services/firebase-auth.service';
import { StripeService } from '../../services/stripe.service';
import { ApiService } from '../../services/api.service';
import { Subscription } from 'rxjs';
import { AppUser } from '../../services/firebase-auth.service';

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
    // console.log('Subscription component initializing...');
    
    // Force check auth state
    this.firebaseAuthService.isAuthenticated().then(isAuth => {
      // console.log('Auth state check result:', isAuth);
      if (!isAuth) {
        // console.log('User not authenticated, checking cached state...');
        const cachedUser = localStorage.getItem('currentUser');
        if (cachedUser) {
          // console.log('Found cached user, reinitializing from cache...');
          // REMOVED: this.firebaseAuthService['initFromCache']();
        }
      }
    });
    
    // Handle subscription success redirect
    this.routeSub = this.route.queryParams.pipe(take(1)).subscribe(params => {
      if (params['success']) {
        this.handleSubscriptionSuccess();
      }
      // ADD Check for initiateCheckout flag
      if (params['initiateCheckout'] === 'true') {
        // Remove the flag from URL to prevent re-triggering on refresh
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { initiateCheckout: null },
          queryParamsHandling: 'merge',
          replaceUrl: true
        });
        console.log('initiateCheckout flag detected, starting subscription...');
        this.startSubscription();
      }
      // --- END ADDED CHECK --- 
      // Get feature from URL query params (can coexist with above checks)
      this.feature = params['feature'];
    });

    // Load initial status
    this.loadSubscriptionStatus();
    
    // Subscribe to user changes using FirebaseAuthService
    this.userSub = this.firebaseAuthService.user$.subscribe(user => {
      // console.log('Current user updated:', user);
      this.currentUser = user;
      
      // REMOVED REDIRECTION LOGIC HERE
      // The following block caused users to be redirected from /profile
      // if (user?.isPremium && 
      //     !currentUrl.includes('/subscription') && 
      //     !currentUrl.includes('/checkout') &&
      //     !currentUrl.includes('/success') &&
      //     !currentUrl.includes('/cancel')) {
      //   this.router.navigate(['/home']);
      // }
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
      // console.error('Error loading subscription status:', error);
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
        // console.log('Already processing subscription request');
        return;
    }
    
    this.isLoading = true;
    this.loadError = null;

    try {
        // console.log('Starting subscription process...');
        
        // First check if user is signed in
        const isSignedIn = await this.firebaseAuthService.isAuthenticated();
        if (!isSignedIn) {
            // console.log('User not signed in, redirecting to login');
            localStorage.setItem('returnUrl', window.location.pathname);
            this.router.navigate(['/auth/login'], { 
                queryParams: { 
                    returnUrl: window.location.pathname,
                    feature: 'premium'
                }
            });
            return;
        }

        // Get current user
        const user = await firstValueFrom(this.firebaseAuthService.user$.pipe(take(1)));
        if (!user || !user.uid) {
            throw new Error('No valid user found');
        }

        try {
            // Create checkout session - token refresh will be handled automatically
            // console.log('Creating checkout session...');
            const response = await this.apiService.createCheckoutSession(user.uid);
            
            if (response?.url) {
                window.location.href = response.url;
            } else {
                throw new Error('Invalid checkout session response');
            }
        } catch (error: any) {
            // console.error('Error during subscription process:', error);
            
            // Handle specific error cases
            if (error?.code === 'auth/user-token-expired' || 
                error?.code === 'auth/requires-recent-login') {
                
                this.snackBar.open(
                    'Please wait while we refresh your session...',
                    'Close',
                    { duration: 3000 }
                );
                
                try {
                    // Attempt silent token refresh first
                    await this.firebaseAuthService.refreshAuth();
                    
                    // Retry checkout session creation
                    const response = await this.apiService.createCheckoutSession(user.uid);
                    if (response?.url) {
                        window.location.href = response.url;
                        return;
                    }
                } catch (refreshError) {
                    // console.error('Session refresh failed:', refreshError);
                    this.snackBar.open(
                        'Please sign in again to continue with your subscription.',
                        'Close',
                        { duration: 5000 }
                    );
                    this.router.navigate(['/auth/login'], {
                        queryParams: {
                            returnUrl: window.location.pathname,
                            feature: 'premium'
                        }
                    });
                }
                return;
            }
            
            // Handle other errors
            this.loadError = 'Failed to start subscription process. Please try again.';
            this.snackBar.open(
                'There was an error starting your subscription. Please try again.',
                'Close',
                { duration: 5000 }
            );
        }
    } catch (error: any) {
        // console.error('Error in subscription process:', error);
        this.loadError = error?.message || 'An unexpected error occurred';
        this.snackBar.open(
            'There was an error processing your request. Please try again.',
            'Close',
            { duration: 5000 }
        );
    } finally {
        this.isLoading = false;
    }
  }

  private async handleSubscriptionSuccess() {
    console.log('[SubComponent] Handling subscription success redirect...'); // Log: Start
    this.isLoading = true;
    const maxRetries = 3;
    const retryDelay = 3000; // 3 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[SubComponent] Attempt ${attempt} to check subscription status...`); // Log: Attempt count
        // Add a delay before checking, giving webhook/server time
        await new Promise(resolve => setTimeout(resolve, attempt === 1 ? 1500 : retryDelay));
        console.log(`[SubComponent] Attempt ${attempt}: Delay complete. Calling getSubscriptionStatus...`); // Log: Before status check

        // Get latest subscription status directly from our backend first
        // This GET request should trigger the interceptor to add the current token
        const response = await firstValueFrom(this.stripeService.getSubscriptionStatus());
        console.log(`[SubComponent] Attempt ${attempt}: Received status response:`, response); // Log: Status response

        if (response.status === 'active' || response.plan === 'premium') { // Check both status and plan
          console.log(`[SubComponent] Attempt ${attempt}: Subscription confirmed active/premium. Forcing token refresh...`); // Log: Before refresh

          // Explicitly force refresh of the Firebase Auth ID token
          // This is crucial to pick up the custom claims set by the server webhook
          await this.firebaseAuthService.refreshAuth();
          console.log(`[SubComponent] Attempt ${attempt}: Token refresh completed.`); // Log: After refresh

          // *** Add a slightly longer delay AFTER refresh for state propagation ***
          await new Promise(resolve => setTimeout(resolve, 300)); // 300ms delay
          console.log(`[SubComponent] Attempt ${attempt}: Post-refresh delay completed.`); // Log: After delay

          // Update local component state based on the response from getSubscriptionStatus
          // Note: The authService.user$ should also update due to the token refresh
          this.subscriptionStatus = {
            status: 'active',
            plan: 'premium',
            features: {
              emotionalDuaSearch: response.features?.emotionalDuaSearch || true,
              aiTafsirChat: response.features?.aiTafsirChat || true,
              duaInsights: response.features?.duaInsights || true,
              aiChat: response.features?.aiChat || true, // Assuming these exist
              tafsirAccess: response.features?.tafsirAccess || true, // Assuming these exist
              wordByWord: response.features?.wordByWord || true // Assuming these exist
            }
          };
          console.log('[SubComponent] Local subscriptionStatus updated:', this.subscriptionStatus); // Log: Local state updated

          // Show success message
          this.snackBar.open(
            'Subscription activated successfully! You now have access to premium features.',
            'Dismiss',
            {
              duration: 7000,
              panelClass: ['success-snackbar']
            }
          );

          // Clear success param from URL
          this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { success: null },
            queryParamsHandling: 'merge',
            replaceUrl: true // Prevent back button issues
          });
          console.log('[SubComponent] Success flow completed, navigating away.'); // Log: Success exit

          // ADD NAVIGATION HERE
          this.router.navigate(['/home']); // Navigate to home page after success

          this.isLoading = false;
          return; // Success, exit the loop and function
        }

        console.log(`[SubComponent] Attempt ${attempt}: Status not active/premium yet (${response.status}/${response.plan}). Retrying...`); // Log: Retry needed

      } catch (error) {
        console.error(`[SubComponent] Error during subscription check attempt ${attempt}:`, error); // Log: Error
        // Don't retry on critical errors, maybe break or handle differently
        if (attempt === maxRetries) {
            this.snackBar.open(
              'There was an issue verifying your subscription status. Please contact support if the problem persists.',
              'Close',
              { duration: 7000 }
            );
            this.isLoading = false;
            return;
        }
      }
    }

    // If loop finishes without success
    console.warn('[SubComponent] Subscription status did not become active after retries.'); // Log: Retries exhausted
    this.snackBar.open(
        'Subscription successful, but status update is delayed. Please refresh the page or sign out/in shortly.',
        'Close',
        { duration: 10000 }
    );
    this.isLoading = false;
    // Clear success param from URL anyway
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { success: null },
      queryParamsHandling: 'merge',
      replaceUrl: true // Prevent back button issues
    });
  }
} 