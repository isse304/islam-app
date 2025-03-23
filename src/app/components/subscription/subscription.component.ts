import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
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
  };
}

interface SubscriptionResponse {
  status: 'active' | 'canceled' | 'inactive';
  plan: 'free' | 'premium';
  features?: {
    emotionalDuaSearch: boolean;
    aiTafsirChat: boolean;
    duaInsights: boolean;
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

  constructor(
    private stripeService: StripeService,
    private snackBar: MatSnackBar,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private firebaseAuthService: FirebaseAuthService,
    private apiService: ApiService
  ) {}

  ngOnInit() {
    // Load subscription status with timeout
    this.loadSubscriptionStatus();
    
    // Get feature from URL query params
    this.route.queryParams.subscribe(params => {
      this.feature = params['feature'];
    });

    this.userSub = this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      if (user?.isPremium) {
        this.router.navigate(['/home']);
      }
    });
  }

  ngOnDestroy() {
    if (this.userSub) {
      this.userSub.unsubscribe();
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
    this.isLoading = true;
    this.loadError = null;

    try {
      if (!this.currentUser) {
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

      localStorage.setItem('returnUrl', window.location.pathname);

      if (window.location.protocol !== 'https:' && !window.location.hostname.includes('localhost')) {
        console.warn('Warning: Stripe requires HTTPS in production.');
      }

      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timed out')), 10000)
      );

      const response = (await Promise.race([
        this.apiService.createCheckoutSession(this.currentUser.id),
        timeout
      ])) as { url: string };

      if (response?.url) {
        window.location.href = response.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error: any) {
      console.error('Subscription error:', error);
      this.loadError = error.message || 'Failed to start subscription process';
    } finally {
      this.isLoading = false;
    }
  }
} 