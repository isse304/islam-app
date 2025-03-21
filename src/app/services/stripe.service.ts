import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { environment } from '../../environments/environment';
import { Observable, firstValueFrom, from } from 'rxjs';
import { FirebaseAuthService } from './firebase-auth.service';
import { switchMap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class StripeService {
  private stripe: Promise<Stripe | null>;

  constructor(
    private http: HttpClient,
    private authService: FirebaseAuthService
  ) {
    this.stripe = loadStripe(environment.stripeConfig.publishableKey || '');
  }

  // Create a checkout session for subscription
  createCheckoutSession(priceId: string): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(
      `${environment.apiUrl}/api/subscription/create-checkout`,
      { priceId }
    );
  }

  // Redirect to Stripe checkout
  async redirectToCheckout(checkoutUrl: string): Promise<void> {
    window.location.href = checkoutUrl;
  }

  // Get current subscription status
  getSubscriptionStatus(): Observable<{
    status: 'active' | 'canceled' | 'past_due' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'unpaid' | 'inactive';
    plan: 'free' | 'standard' | 'premium';
    features: {
      aiChat: boolean;
      tafsirAccess: boolean;
      wordByWord: boolean;
    };
  }> {
    return from(this.authService.getToken()).pipe(
      switchMap(token => {
        if (!token) {
          throw new Error('No authentication token available');
        }
        
        const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
        
        return this.http.get<any>(
          `${environment.apiUrl}/api/subscription/status`,
          { headers }
        );
      })
    );
  }

  // Cancel subscription
  cancelSubscription(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${environment.apiUrl}/api/subscription/cancel`, {});
  }

  // Get portal session for managing subscription
  createPortalSession(): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(
      `${environment.apiUrl}/api/subscription/portal`,
      {}
    );
  }

  // Redirect to customer portal
  async redirectToPortal(): Promise<void> {
    const response = await firstValueFrom(this.createPortalSession());
    if (response?.url) {
      window.location.href = response.url;
    } else {
      throw new Error('No portal URL received');
    }
  }
} 