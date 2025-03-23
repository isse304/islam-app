import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { environment } from '../../environments/environment';
import { Observable, firstValueFrom, from, of } from 'rxjs';
import { FirebaseAuthService } from './firebase-auth.service';
import { switchMap, catchError, map } from 'rxjs/operators';

type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'unpaid' | 'inactive';
type SubscriptionPlan = 'free' | 'standard' | 'premium';

interface SubscriptionResponse {
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  features: {
    aiChat: boolean;
    tafsirAccess: boolean;
    wordByWord: boolean;
  };
}

@Injectable({
  providedIn: 'root'
})
export class StripeService {
  private stripe: Promise<Stripe | null>;
  private stripeInstance: Stripe | null = null;

  constructor(
    private http: HttpClient,
    private authService: FirebaseAuthService
  ) {
    // Initialize Stripe in constructor
    this.stripe = this.initializeStripe();
  }

  private async initializeStripe(): Promise<Stripe | null> {
    try {
      if (!environment.stripeConfig?.publishableKey) {
        console.error('Stripe publishable key is missing');
        return null;
      }

      // Load Stripe with publishable key
      const stripe = await loadStripe(environment.stripeConfig.publishableKey);
      if (stripe) {
        this.stripeInstance = stripe;
        return stripe;
      }
      return null;
    } catch (error) {
      console.error('Error initializing Stripe:', error);
      return null;
    }
  }

  // Create a checkout session for subscription
  createCheckoutSession(priceId: string): Observable<{ url: string }> {
    return from(this.authService.getToken()).pipe(
      switchMap(token => {
        if (!token) {
          throw new Error('No authentication token available');
        }

        const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
        
        return this.http.post<{ url: string }>(
          `${environment.apiUrl}/api/subscription/create-checkout`,
          { priceId },
          { headers }
        );
      }),
      catchError(error => {
        console.error('Error creating checkout session:', error);
        // For development mode, return a mock success URL
        if (!environment.production) {
          return of({ url: 'http://localhost:4200/subscription?dev=true' });
        }
        throw error;
      })
    );
  }

  // Redirect to Stripe checkout
  async redirectToCheckout(checkoutUrl: string): Promise<void> {
    window.location.href = checkoutUrl;
  }

  // Get current subscription status
  getSubscriptionStatus(): Observable<SubscriptionResponse> {
    const defaultResponse: SubscriptionResponse = {
      status: 'inactive',
      plan: 'free',
      features: {
        aiChat: false,
        tafsirAccess: false,
        wordByWord: false
      }
    };

    return from(this.authService.getToken()).pipe(
      switchMap(token => {
        if (!token) {
          return of(defaultResponse);
        }
        
        const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
        
        return this.http.get<SubscriptionResponse>(
          `${environment.apiUrl}/api/subscription/status`,
          { headers }
        ).pipe(
          map(response => ({
            status: response.status || 'inactive',
            plan: response.plan || 'free',
            features: {
              aiChat: response.features?.aiChat || false,
              tafsirAccess: response.features?.tafsirAccess || false,
              wordByWord: response.features?.wordByWord || false
            }
          }))
        );
      }),
      catchError(error => {
        console.error('Error getting subscription status:', error);
        return of(defaultResponse);
      })
    );
  }

  // Cancel subscription
  cancelSubscription(): Observable<{ message: string }> {
    return from(this.authService.getToken()).pipe(
      switchMap(token => {
        if (!token) {
          throw new Error('No authentication token available');
        }

        const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
        
        return this.http.post<{ message: string }>(
          `${environment.apiUrl}/api/subscription/cancel`,
          {},
          { headers }
        );
      })
    );
  }

  // Get portal session for managing subscription
  createPortalSession(): Observable<{ url: string }> {
    return from(this.authService.getToken()).pipe(
      switchMap(token => {
        if (!token) {
          throw new Error('No authentication token available');
        }

        const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
        
        return this.http.post<{ url: string }>(
          `${environment.apiUrl}/api/subscription/portal`,
          {},
          { headers }
        );
      })
    );
  }

  // Redirect to customer portal
  async redirectToPortal(): Promise<void> {
    try {
      const response = await firstValueFrom(this.createPortalSession());
      if (response?.url) {
        window.location.href = response.url;
      } else {
        throw new Error('No portal URL received');
      }
    } catch (error) {
      console.error('Error redirecting to portal:', error);
      throw error;
    }
  }
} 