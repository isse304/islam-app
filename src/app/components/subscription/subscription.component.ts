import { Component, OnInit } from '@angular/core';
import { StripeService } from '../../services/stripe.service';
import { Router, ActivatedRoute } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { environment } from '../../../environments/environment';

declare const Stripe: any;

interface SubscriptionStatus {
  status: 'trial' | 'active' | 'cancelled' | 'past_due' | 'incomplete' | 'incomplete_expired' | 'unpaid';
  plan: 'free' | 'standard' | 'premium';
  currentPeriodEnd: Date | null;
}

@Component({
  selector: 'app-subscription',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule],
  template: `
    <div class="min-h-screen bg-[#FAF3E0] py-12 relative overflow-hidden">
      <!-- Islamic Pattern Background -->
      <div class="absolute inset-0 pattern-bg"></div>
      
      <div class="container mx-auto px-4 relative z-10">
        <div class="max-w-4xl mx-auto">
          <!-- Header -->
          <div class="text-center mb-12">
            <div class="w-20 h-20 mx-auto mb-4 bg-[#B7A57A] rounded-full flex items-center justify-center transform hover:scale-110 transition-transform">
              <i class="fas fa-crown text-3xl text-white"></i>
            </div>
            <h1 class="text-4xl font-bold text-[#B7A57A] mb-4">Elevate Your Spiritual Journey</h1>
            <p class="text-xl text-gray-600">Access premium features and deepen your connection with Allah</p>
            <p *ngIf="feature" class="mt-4 text-lg text-[#B7A57A]">
              <i class="fas fa-star mr-2"></i>
              Unlock {{ feature }} and all premium features
            </p>
          </div>

          <!-- Premium Plan Card -->
          <div class="bg-white rounded-2xl shadow-xl overflow-hidden transform hover:scale-[1.02] transition-transform">
            <div class="bg-gradient-to-r from-[#B7A57A] to-[#9b8a65] text-white p-8">
              <div class="flex justify-between items-center">
                <div>
                  <h2 class="text-3xl font-bold mb-2">Premium Access</h2>
                  <p class="text-lg opacity-90">Unlock the full potential of your spiritual practice</p>
                </div>
                <div class="text-right">
                  <div class="text-4xl font-bold">$9.99<span class="text-lg">/month</span></div>
                  <p class="text-sm opacity-90">7-day free trial • Cancel anytime</p>
                </div>
              </div>
            </div>
            
            <div class="p-8">
              <!-- Feature Categories -->
              <div class="grid md:grid-cols-2 gap-8 mb-8">
                <!-- AI-Powered Features -->
                <div class="feature-category" [class.highlight-feature]="isFeatureHighlighted('AI Features')">
                  <h3 class="text-xl font-semibold text-[#B7A57A] mb-4 flex items-center">
                    <i class="fas fa-robot mr-2"></i>
                    AI-Powered Features
                  </h3>
                  <ul class="space-y-3">
                    <li class="flex items-start">
                      <i class="fas fa-check-circle text-green-500 mr-3 mt-1"></i>
                      <div>
                        <span class="font-medium">Emotional Dua Search</span>
                        <p class="text-sm text-gray-600">Find duas that match your emotional state</p>
                      </div>
                    </li>
                    <li class="flex items-start">
                      <i class="fas fa-check-circle text-green-500 mr-3 mt-1"></i>
                      <div>
                        <span class="font-medium">Personalized Dua Insights</span>
                        <p class="text-sm text-gray-600">Get AI-generated insights for each dua</p>
                      </div>
                    </li>
                    <li class="flex items-start">
                      <i class="fas fa-check-circle text-green-500 mr-3 mt-1"></i>
                      <div>
                        <span class="font-medium">Smart Tafsir Chat</span>
                        <p class="text-sm text-gray-600">Interactive Q&A about Quranic verses</p>
                      </div>
                    </li>
                  </ul>
                </div>

                <!-- Learning Tools -->
                <div class="feature-category" [class.highlight-feature]="isFeatureHighlighted('Learning')">
                  <h3 class="text-xl font-semibold text-[#B7A57A] mb-4 flex items-center">
                    <i class="fas fa-book-reader mr-2"></i>
                    Learning Tools
                  </h3>
                  <ul class="space-y-3">
                    <li class="flex items-start">
                      <i class="fas fa-check-circle text-green-500 mr-3 mt-1"></i>
                      <div>
                        <span class="font-medium">Advanced Quran Study</span>
                        <p class="text-sm text-gray-600">Detailed verse analysis and context</p>
                      </div>
                    </li>
                    <li class="flex items-start">
                      <i class="fas fa-check-circle text-green-500 mr-3 mt-1"></i>
                      <div>
                        <span class="font-medium">Multiple Tafsir Sources</span>
                        <p class="text-sm text-gray-600">Access various scholarly interpretations</p>
                      </div>
                    </li>
                    <li class="flex items-start">
                      <i class="fas fa-check-circle text-green-500 mr-3 mt-1"></i>
                      <div>
                        <span class="font-medium">Personalized Learning Path</span>
                        <p class="text-sm text-gray-600">Track your progress and get recommendations</p>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>

              <!-- Subscribe Button -->
              <div class="text-center">
                <button 
                  (click)="startSubscription()"
                  class="bg-[#B7A57A] text-white px-12 py-4 rounded-lg text-lg font-semibold hover:bg-[#9b8a65] transition-all transform hover:scale-105 hover:shadow-lg">
                  <i class="fas fa-unlock-alt mr-2"></i>
                  Start 7-Day Free Trial
                </button>
                <p class="text-sm text-gray-500 mt-4">
                  <i class="fas fa-shield-alt mr-1"></i>
                  Secure payment via Stripe • Cancel anytime
                </p>
              </div>
            </div>
          </div>

          <!-- Testimonials or Additional Info could go here -->
        </div>
      </div>
    </div>
  `,
  styles: [`
    .pattern-bg {
      background-image: url('/islamic-pattern-1.png');
      background-repeat: repeat;
      background-size: 200px;
      filter: contrast(150%);
      transform: rotate(30deg) scale(1.5);
      opacity: 0.08;
      mix-blend-mode: multiply;
    }
    .feature-category {
      background: linear-gradient(to bottom right, rgba(183, 165, 122, 0.05), rgba(183, 165, 122, 0.02));
      padding: 1.5rem;
      border-radius: 1rem;
      transition: transform 0.3s ease;
    }
    .feature-category:hover {
      transform: translateY(-2px);
    }
    .highlight-feature {
      background: linear-gradient(to bottom right, rgba(183, 165, 122, 0.15), rgba(183, 165, 122, 0.05));
      box-shadow: 0 4px 6px -1px rgba(183, 165, 122, 0.1), 0 2px 4px -1px rgba(183, 165, 122, 0.06);
      transform: translateY(-2px);
    }
  `]
})
export class SubscriptionComponent implements OnInit {
  private stripe: any;
  subscriptionStatus?: SubscriptionStatus;
  feature?: string;
  isLoading = false;

  constructor(
    private stripeService: StripeService,
    private snackBar: MatSnackBar,
    private route: ActivatedRoute
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
        status: response.status === 'canceled' ? 'cancelled' : 
               response.status === 'trialing' ? 'trial' : 
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

    try {
      const response = await firstValueFrom(this.stripeService.createCheckoutSession(environment.stripeConfig.priceId));
      if (response?.url) {
        await this.stripeService.redirectToCheckout(response.url);
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      console.error('Error starting subscription:', error);
      this.snackBar.open('Failed to start subscription process', 'Close', { duration: 5000 });
    } finally {
      this.isLoading = false;
    }
  }
} 