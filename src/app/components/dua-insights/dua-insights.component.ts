import { Component, Input, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Dua } from '../../services/dua.service';
import { ApiService, AIResponse } from '../../services/api.service';
import { SubscriptionService } from '../../services/subscription.service';
import { Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { FirebaseAuthService, AppUser } from '../../services/firebase-auth.service';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { DuaService, DuaInsightsResponse, StreamingResponse, ResponseType } from '../../services/dua.service';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-dua-insights',
  templateUrl: './dua-insights.component.html',
  styleUrls: ['./dua-insights.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule
  ]
})
export class DuaInsightsComponent implements OnInit, OnDestroy {
  @Input() dua!: { id: number | string };
  
  insights: any | null = null;
  reflections: AIResponse | null = null;
  isLoading = false;
  error: string | null = null;
  activeTab: 'insights' | 'reflections' | 'context' = 'insights';
  isPremium: boolean = false;
  loadingProgress = 0;
  streamedContent = '';
  estimatedTotalChars = 2000; // Estimated total characters in the response
  private subscription: Subscription | null = null;

  constructor(
    private apiService: ApiService,
    private subscriptionService: SubscriptionService,
    private firebaseAuthService: FirebaseAuthService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    public router: Router,
    private duaService: DuaService
  ) {}

  ngOnInit() {
    this.loadInsights();
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  loadInsights() {
    this.isLoading = true;
    this.error = null;
    this.loadingProgress = 0;
    this.streamedContent = '';
    this.insights = null;

    // console.log('Loading insights for dua:', this.dua.id);

    this.subscription = this.duaService.getDuaInsights(this.dua.id.toString())
      .subscribe({
        next: (response: ResponseType) => {
          if (this.isStreamingResponse(response)) {
            switch (response.status) {
              case 'processing':
                this.loadingProgress = 20;
                break;
              case 'streaming':
                this.loadingProgress = 60;
                if (response.chunk) {
                  this.streamedContent = response.partialResponse || '';
                  // Update progress based on received content length
                  const progress = Math.min(90, (this.streamedContent.length / this.estimatedTotalChars) * 100);
                  this.loadingProgress = Math.max(this.loadingProgress, progress);
                }
                break;
              case 'complete':
                this.loadingProgress = 100;
                if (response.data?.duaId === this.dua.id) {
                  this.insights = response.data;
                } else {
                  console.error('Received insights for wrong dua ID:', response.data?.duaId);
                  this.error = 'Received incorrect insights. Please try again.';
                }
                this.isLoading = false;
                break;
              case 'error':
                this.error = response.error || 'Failed to generate insights';
                this.isLoading = false;
                break;
            }
          } else if (response.duaId === this.dua.id) {
            this.insights = response;
            this.isLoading = false;
            this.loadingProgress = 100;
          } else {
            console.error('Received insights for wrong dua ID:', response.duaId);
            this.error = 'Received incorrect insights. Please try again.';
            this.isLoading = false;
          }
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error loading insights:', error);
          this.error = error.message || 'Failed to load insights';
          this.isLoading = false;
          this.loadingProgress = 0;
          this.cdr.detectChanges();
        }
      });
  }

  private isStreamingResponse(response: ResponseType): response is { status: 'processing' | 'streaming' | 'complete' | 'error', chunk?: string, data?: any, error?: string } {
    return 'status' in response;
  }

  setActiveTab(tab: 'insights' | 'reflections' | 'context') {
    this.activeTab = tab;
  }

  getVirtuesList(): string[] {
    if (!this.insights?.virtues) return [];
    // Handle both string and array types
    if (Array.isArray(this.insights.virtues)) {
      return this.insights.virtues.filter((v: string) => v.trim());
    }
    return this.insights.virtues.split('\n').filter((v: string) => v.trim());
  }

  getApplicationSteps(): string[] {
    if (!this.insights?.application) return [];
    // Handle both string and array types
    if (Array.isArray(this.insights.application)) {
      return this.insights.application.filter((s: string) => s.trim());
    }
    return this.insights.application.split('\n').filter((s: string) => s.trim());
  }

  getSpiritualImpacts(): string[] {
    if (!this.insights?.impact) return [];
    // Handle both string and array types
    if (Array.isArray(this.insights.impact)) {
      return this.insights.impact.filter((i: string) => i.trim());
    }
    return this.insights.impact.split('\n').filter((i: string) => i.trim());
  }

  getReflectionPoints(): string[] {
    if (!this.insights?.reflectionPoints) return [];
    // Handle both string and array types
    if (Array.isArray(this.insights.reflectionPoints)) {
      return this.insights.reflectionPoints.filter((p: string) => p.trim());
    }
    return this.insights.reflectionPoints.split('\n').filter((p: string) => p.trim());
  }

  getHistoricalContext(): string {
    // Check both camelCase and snake_case versions of the field name
    return this.insights?.historical_context || this.insights?.historicalContext || '';
  }

  getModernApplication(): string {
    return this.insights?.modernApplication || '';
  }

  hasRelatedVerses(): boolean {
    return !!(this.insights?.relatedVerses && this.insights.relatedVerses.length > 0);
  }

  getFormattedRelatedVerses(): SafeHtml {
    if (!this.insights?.relatedVerses?.length) return this.sanitizer.bypassSecurityTrustHtml('');
    
    const formattedVerses = this.insights.relatedVerses
      .map((verse: string) => `<p class="verse">${verse}</p>`)
      .join('\n');
    
    return this.sanitizer.bypassSecurityTrustHtml(formattedVerses);
  }

  getSpiritualAdvice(): { understanding: string; duas: any[]; dhikr: any[]; scholarly_guidance: any[]; spiritual_remedies: any[] } {
    if (!this.insights?.spiritual_advice) return {
      understanding: '',
      duas: [],
      dhikr: [],
      scholarly_guidance: [],
      spiritual_remedies: []
    };

    return this.insights.spiritual_advice;
  }

  formatDua(dua: any): string {
    if (typeof dua === 'string') return dua;
    return `${dua.arabic || ''}\n${dua.translation || ''}\n${dua.reference || ''}`.trim();
  }

  formatDhikr(dhikr: any): string {
    if (typeof dhikr === 'string') return dhikr;
    return `${dhikr.phrase || ''}\n${dhikr.count ? `Count: ${dhikr.count}` : ''}\n${dhikr.benefit || ''}`.trim();
  }

  formatScholarlyGuidance(guidance: any): string {
    if (typeof guidance === 'string') return guidance;
    return `${guidance.quote || ''}\n- ${guidance.scholar || ''}${guidance.source ? ` (${guidance.source})` : ''}`.trim();
  }

  formatSpiritualRemedy(remedy: any): string {
    if (typeof remedy === 'string') return remedy;
    return `${remedy.practice || ''}\n${remedy.benefit || ''}`.trim();
  }
} 