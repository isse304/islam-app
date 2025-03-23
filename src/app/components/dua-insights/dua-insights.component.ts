import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Dua } from '../../services/dua.service';
import { AIResponse } from '../../services/openai.service';
import { SubscriptionService } from '../../services/subscription.service';
import { Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthStateService } from '../../services/auth-state.service';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { ApiService } from '../../services/api.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-dua-insights',
  templateUrl: './dua-insights.component.html',
  styleUrls: ['./dua-insights.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatListModule
  ]
})
export class DuaInsightsComponent implements OnInit {
  @Input() dua!: Dua;
  
  insights: AIResponse | null = null;
  reflections: AIResponse | null = null;
  isLoading: boolean = false;
  error: string = '';
  activeTab: 'insights' | 'reflections' | 'context' = 'insights';
  isPremium: boolean = false;

  constructor(
    private apiService: ApiService,
    private subscriptionService: SubscriptionService,
    private authStateService: AuthStateService,
    private sanitizer: DomSanitizer,
    public router: Router
  ) {}

  async ngOnInit() {
    if (!this.dua) {
      this.error = 'No dua provided';
      return;
    }

    this.isLoading = true;
    this.error = '';

    try {
      // Check premium status first
      const isPremium = await firstValueFrom(this.authStateService.isPremiumUser$);
      if (!isPremium) {
        this.error = 'Premium subscription required';
        this.subscriptionService.showSubscriptionPage('Dua Insights');
        return;
      }

      const response = await this.apiService.generateDuaInsights(this.dua);
      if (response && response.content) {
        this.insights = {
          content: response.content,
          virtues: response.virtues || '',
          application: response.application || '',
          context: response.context || '',
          related: response.related || '',
          impact: response.impact || '',
          explanation: response.explanation || '',
          relatedVerses: response.relatedVerses || [],
          historicalContext: response.historicalContext || '',
          reflectionPoints: response.reflectionPoints || [],
          modernApplication: response.modernApplication || ''
        };
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error: any) {
      console.error('Error generating insights:', error);
      this.error = error.message || 'Failed to generate insights. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  setActiveTab(tab: 'insights' | 'reflections' | 'context') {
    this.activeTab = tab;
  }

  getVirtuesList(): string[] {
    if (!this.insights?.virtues) return [];
    return this.insights.virtues.split('\n').filter(v => v.trim());
  }

  getApplicationSteps(): string[] {
    if (!this.insights?.application) return [];
    return this.insights.application.split('\n').filter(s => s.trim());
  }

  getSpiritualImpacts(): string[] {
    if (!this.insights?.impact) return [];
    return this.insights.impact.split('\n').filter(i => i.trim());
  }

  getReflectionPoints(): string[] {
    if (!this.insights?.reflectionPoints) return [];
    return this.insights.reflectionPoints.filter(p => p.trim());
  }

  getHistoricalContext(): string {
    return this.insights?.historicalContext || '';
  }

  getModernApplication(): string {
    return this.insights?.modernApplication || '';
  }

  hasRelatedContent(): boolean {
    return !!this.insights?.related;
  }

  getFormattedRelatedContent(): SafeHtml {
    if (!this.insights?.related) return this.sanitizer.bypassSecurityTrustHtml('');
    
    // Convert markdown-style formatting to HTML
    const content = this.insights.related
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
      .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
      .replace(/\n\n/g, '</p><p>') // Paragraphs
      .replace(/\n•/g, '<br>•') // Bullet points
      .replace(/\n/g, '<br>'); // Line breaks
    
    return this.sanitizer.bypassSecurityTrustHtml(`<div class="space-y-4">${content}</div>`);
  }
} 