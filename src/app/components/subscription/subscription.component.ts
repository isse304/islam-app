import { Component, OnInit, OnDestroy, NgZone, ChangeDetectorRef } from '@angular/core';
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
import { ThemeService } from '../../services/theme.service';

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
    private apiService: ApiService,
    public themeService: ThemeService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.ngZone.run(() => {
        // console.log('[SubComp ngOnInit] Setting isLoading = false (initial)');
        this.isLoading = false;
        this.cdr.detectChanges();
    });

    this.routeSub = this.route.queryParams.pipe(take(1)).subscribe(params => {
      if (params['success']) {
        // console.log('[SubComp ngOnInit] queryParams: success=true, handling...');
        this.handleSubscriptionSuccess();
      }
      if (params['initiateCheckout'] === 'true') {
        // console.log('[SubComp ngOnInit] queryParams: initiateCheckout=true, navigating and starting subscription...');
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { initiateCheckout: null },
          queryParamsHandling: 'merge',
          replaceUrl: true
        });
        this.startSubscription();
      }
      this.feature = params['feature'];
      // if (this.feature) { console.log('[SubComp ngOnInit] queryParams: feature=', this.feature); }
    });

    // console.log('[SubComp ngOnInit] Calling loadSubscriptionStatus');
    this.loadSubscriptionStatus(); 
    
    this.userSub = this.firebaseAuthService.user$.subscribe(user => {
      // console.log('[SubComp ngOnInit] user$ emitted:', user);
      this.currentUser = user;
    });

    // Diagnostic: Force isLoading to false after a short delay
    // setTimeout(() => {
    //   this.ngZone.run(() => {
    //     console.log('[SubComp DIAGNOSTIC TIMEOUT] Forcing isLoading = false after 2 seconds');
    //     this.isLoading = false;
    //     this.cdr.detectChanges(); // Explicitly run CD
    //   });
    // }, 2000);
  }

  ngOnDestroy() {
    if (this.userSub) {
      this.userSub.unsubscribe();
    }
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
  }

  async refreshSubscriptionStatus() {
    try {
      this.ngZone.run(() => {
        this.isLoading = true;
        this.cdr.detectChanges();
      });

      await this.firebaseAuthService.refreshAuth();
      
      // Give the token refresh a moment to propagate
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const response = await firstValueFrom(this.stripeService.getSubscriptionStatus());
      
      if (response.status === 'active' || response.plan === 'premium') {
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
        
        this.snackBar.open(
          '✅ Subscription status refreshed! Premium access confirmed.',
          'Dismiss',
          { duration: 5000, panelClass: ['success-snackbar'] }
        );
      } else {
        this.snackBar.open(
          'No active subscription found. Please subscribe or contact support if you believe this is an error.',
          'Dismiss',
          { duration: 7000 }
        );
      }

      this.ngZone.run(() => {
        this.isLoading = false;
        this.cdr.detectChanges();
      });
    } catch (error) {
      console.error('Error refreshing subscription status:', error);
      this.snackBar.open(
        'Failed to refresh subscription status. Please try again or contact support.',
        'Close',
        { duration: 5000 }
      );
      this.ngZone.run(() => {
        this.isLoading = false;
        this.cdr.detectChanges();
      });
    }
  }

  private async loadSubscriptionStatus() {
    try {
      this.ngZone.run(() => {
        // console.log('[SubComp LSS] try: Setting isLoading = true');
        this.isLoading = true;
        this.cdr.detectChanges();
      });
      this.loadError = null;

      const statusPromise = firstValueFrom(this.stripeService.getSubscriptionStatus());
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request to load subscription status timed out.')), 10000)
      );
      const response = await Promise.race([statusPromise, timeoutPromise]) as SubscriptionResponse;
      // console.log('[SubComp LSS] try: Got response', response);

      this.subscriptionStatus = {
        status: response.status === 'canceled' ? 'canceled' :
               response.status === 'active' ? 'active' : 'inactive',
        plan: response.plan,
        features: response.features
      };
      this.ngZone.run(() => { this.cdr.detectChanges(); }); 

    } catch (error: any) {
      // console.error('[SubComp LSS] catch: Error loading subscription status:', error);
      this.loadError = error?.message || 'Failed to load subscription status. Please try again.';
      if (!this.snackBar._openedSnackBarRef) {
        this.snackBar.open(this.loadError || 'Error loading status.', 'Close', { duration: 5000 });
      }
      this.ngZone.run(() => { this.cdr.detectChanges(); });
    } finally {
      this.ngZone.run(() => {
        // console.log('[SubComp LSS] finally: Setting isLoading = false');
        this.isLoading = false;
        this.cdr.detectChanges();
      });
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
        // console.log('[SubComp startSub] Already processing');
        return;
    }
    this.ngZone.run(() => { 
        // console.log('[SubComp startSub] Setting isLoading = true');
        this.isLoading = true; 
        this.cdr.detectChanges();
    });
    this.loadError = null;
    try {
        const isSignedIn = await this.firebaseAuthService.isAuthenticated();
        if (!isSignedIn) {
            // console.log('[SubComp startSub] User not signed in, redirecting to login');
            localStorage.setItem('returnUrl', window.location.pathname);
            this.ngZone.run(() => { 
              this.isLoading = false; 
              this.cdr.detectChanges();
            });
            this.router.navigate(['/auth/login'], {
                queryParams: { returnUrl: window.location.pathname, feature: 'premium' }
            });
            return;
        }

        const user = await firstValueFrom(this.firebaseAuthService.user$.pipe(take(1)));
        if (!user || !user.uid) {
            // console.log('[SubComp startSub] No valid user found');
            throw new Error('No valid user found'); // isLoading will be false via finally
        }

        try {
            // console.log('[SubComp startSub] Creating checkout session for user:', user.uid);
            const checkoutPromise = this.apiService.createCheckoutSession(user.uid);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Checkout session creation timed out.')), 15000)
            );
            const response = await Promise.race([checkoutPromise, timeoutPromise]) as CheckoutResponse;

            if (response?.url) {
                // console.log('[SubComp startSub] Checkout session created, redirecting to Stripe:', response.url);
                this.ngZone.run(() => { 
                  this.isLoading = false; 
                  this.cdr.detectChanges();
                });
                window.location.href = response.url;
                return;
            } else {
                // console.log('[SubComp startSub] Invalid checkout session response or timeout did not yield URL.');
                throw new Error('Invalid checkout session response or timeout did not yield URL.');
            }
        } catch (error: any) {
            // console.error('[SubComp startSub] Inner catch during checkout creation:', error);
            if (error?.message?.includes('timed out')) {
                this.snackBar.open(error.message, 'Close', { duration: 5000 });
                throw error; // Re-throw for outer finally
            }
            if (error?.code === 'auth/user-token-expired' || error?.code === 'auth/requires-recent-login') {
                // console.log('[SubComp startSub] Auth token expired/requires recent login, attempting refresh');
                this.snackBar.open('Please wait while we refresh your session...', 'Close', { duration: 3000 });
                try {
                    await this.firebaseAuthService.refreshAuth();
                    // console.log('[SubComp startSub] Session refreshed, retrying checkout session creation');
                    const refreshedCheckoutPromise = this.apiService.createCheckoutSession(user.uid);
                    const refreshedTimeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Checkout session timed out after session refresh.')), 15000)
                    );
                    const refreshedResponse = await Promise.race([refreshedCheckoutPromise, refreshedTimeoutPromise]) as CheckoutResponse;

                    if (refreshedResponse?.url) {
                        // console.log('[SubComp startSub] Checkout session created after refresh, redirecting to Stripe:', refreshedResponse.url);
                        this.ngZone.run(() => { 
                          this.isLoading = false; 
                          this.cdr.detectChanges();
                        });
                        window.location.href = refreshedResponse.url;
                        return;
                    } else {
                         // console.log('[SubComp startSub] Invalid checkout session response after refresh or timeout did not yield URL.');
                         throw new Error('Invalid checkout session response after refresh or timeout did not yield URL.');
                    }
                } catch (refreshError: any) {
                    // console.error('[SubComp startSub] Catch during session refresh or subsequent checkout:', refreshError);
                    this.snackBar.open(
                        refreshError?.message?.includes('timed out') ? refreshError.message : 'Please sign in again to continue.',
                        'Close', { duration: 5000 }
                    );
                    this.ngZone.run(() => { 
                      this.isLoading = false; 
                      this.cdr.detectChanges();
                    });
                    this.router.navigate(['/auth/login'], {
                        queryParams: { returnUrl: window.location.pathname, feature: 'premium' }
                    });
                    return;
                }
            } else {
                // console.error('[SubComp startSub] Other error in inner catch, re-throwing:', error);
                throw error; // Re-throw for outer finally
            }
        }
    } catch (error: any) {
        // console.error('[SubComp startSub] Outer catch: Error in subscription process:', error);
        this.loadError = error?.message || 'An unexpected error occurred.';
        if (!this.snackBar._openedSnackBarRef) {
             this.snackBar.open(this.loadError || 'An error occurred.', 'Close', { duration: 5000 });
        }
        this.ngZone.run(() => { this.cdr.detectChanges(); });
    } finally {
        if (this.isLoading) {
             this.ngZone.run(() => { 
                // console.log('[SubComp startSub] finally: Setting isLoading = false');
                this.isLoading = false; 
                this.cdr.detectChanges();
            });
        }
    }
  }
  
  private async handleSubscriptionSuccess() {
    // console.log('[SubComponent] Handling subscription success redirect...');
    this.ngZone.run(() => {
        // console.log('[SubComp handleSuccess] Setting isLoading = true');
        this.isLoading = true;
        this.cdr.detectChanges();
    });
    const maxRetries = 3;
    const retryDelay = 3000; 

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // console.log(`[SubComp handleSuccess] Attempt ${attempt} to check subscription status...`);
        await new Promise(resolve => setTimeout(resolve, attempt === 1 ? 1500 : retryDelay));
        // console.log(`[SubComp handleSuccess] Attempt ${attempt}: Delay complete. Calling getSubscriptionStatus...`);

        const response = await firstValueFrom(this.stripeService.getSubscriptionStatus());
        // console.log(`[SubComp handleSuccess] Attempt ${attempt}: Received status response:`, response);

        if (response.status === 'active' || response.plan === 'premium') {
          // console.log(`[SubComp handleSuccess] Attempt ${attempt}: Subscription confirmed active/premium. Forcing token refresh...`);
          await this.firebaseAuthService.refreshAuth();
          // console.log(`[SubComp handleSuccess] Attempt ${attempt}: Token refresh completed.`);
          await new Promise(resolve => setTimeout(resolve, 300));
          // console.log(`[SubComp handleSuccess] Attempt ${attempt}: Post-refresh delay completed.`);

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
          // console.log('[SubComp handleSuccess] Local subscriptionStatus updated:', this.subscriptionStatus);

          this.snackBar.open(
            'Subscription activated successfully! You now have access to premium features.',
            'Dismiss',
            { duration: 7000, panelClass: ['success-snackbar'] }
          );

          this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { success: null },
            queryParamsHandling: 'merge',
            replaceUrl: true
          });
          // console.log('[SubComp handleSuccess] Success flow completed, navigating to /home');
          this.router.navigate(['/home']);

          this.ngZone.run(() => { 
            this.isLoading = false; 
            this.cdr.detectChanges(); 
          });
          return; 
        }
        // console.log(`[SubComp handleSuccess] Attempt ${attempt}: Status not active/premium yet (${response.status}/${response.plan}). Retrying...`);
      } catch (error) {
        // console.error(`[SubComp handleSuccess] Error during subscription check attempt ${attempt}:`, error);
        if (attempt === maxRetries) {
            this.snackBar.open(
              'There was an issue verifying your subscription. Please contact support if it persists.',
              'Close', { duration: 7000 }
            );
            this.ngZone.run(() => { 
              this.isLoading = false; 
              this.cdr.detectChanges(); 
            });
            return;
        }
      }
    }

    // console.warn('[SubComp handleSuccess] Subscription status did not become active after retries.');
    this.snackBar.open(
        'Subscription successful, but status update is delayed. Refresh or sign out/in shortly.',
        'Close', { duration: 10000 }
    );
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { success: null },
      queryParamsHandling: 'merge',
      replaceUrl: true 
    });
    this.ngZone.run(() => { 
      this.isLoading = false; 
      this.cdr.detectChanges(); 
    });
  }
} 