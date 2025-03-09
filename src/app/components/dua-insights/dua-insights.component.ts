import { Component, Input, OnInit } from '@angular/core';
import { Dua } from '../../services/dua.service';
import { OpenAIService, AIResponse } from '../../services/openai.service';
import { SubscriptionService } from '../../services/subscription.service';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthStateService } from '../../services/auth-state.service';

@Component({
  selector: 'app-dua-insights',
  templateUrl: './dua-insights.component.html',
  styleUrls: ['./dua-insights.component.css'],
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
    private openAIService: OpenAIService,
    private subscriptionService: SubscriptionService,
    private authStateService: AuthStateService,
    public router: Router
  ) {}

  async ngOnInit() {
    if (!this.dua) return;

    // Check premium status first
    this.isPremium = await firstValueFrom(this.authStateService.isPremiumUser$);
    if (!this.isPremium) {
      return;
    }

    this.isLoading = true;
    this.error = '';

    try {
      this.insights = await firstValueFrom(this.openAIService.generateDuaInsights(this.dua));
    } catch (error: any) {
      this.error = error.message || 'Failed to generate insights';
      console.error('Error generating insights:', error);
    } finally {
      this.isLoading = false;
    }

    if (this.isPremium) {
      this.openAIService.generateReflectionPrompts(this.dua)
        .subscribe({
          next: (response) => {
            this.reflections = response;
          },
          error: (error) => {
            console.error('Error loading reflections:', error);
          }
        });
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

  getRelatedReferences(): string[] {
    if (!this.insights) return [];

    // Try to extract verses from the content
    const content = this.insights.content || '';
    const sections = content.split('\n\n');
    const versesSection = sections.find(section => 
      section.toLowerCase().includes('related verses') || 
      section.toLowerCase().includes('quranic references') ||
      section.toLowerCase().includes('hadith')
    );

    if (versesSection) {
      const lines = versesSection.split('\n');
      // Remove the header and empty lines
      return lines
        .slice(1)
        .filter(line => line.trim() && !line.toLowerCase().includes('related verses'))
        .map(line => {
          // Clean up bullet points and extra spaces
          return line.replace(/^[•\-\*]\s*/, '').trim();
        })
        .filter(line => line);
    }

    // Fallback to relatedVerses if available
    if (this.insights.relatedVerses && Array.isArray(this.insights.relatedVerses)) {
      return this.insights.relatedVerses
        .map(verse => {
          if (typeof verse === 'string') return verse;
          if (typeof verse === 'object' && verse !== null) {
            const { reference, translation, arabic } = verse as any;
            const parts = [];
            if (reference) parts.push(`Reference: ${reference}`);
            if (arabic) parts.push(`Arabic: ${arabic}`);
            if (translation) parts.push(`Translation: ${translation}`);
            return parts.join('\n');
          }
          return '';
        })
        .filter(v => v);
    }

    // Final fallback to related field
    if (typeof this.insights.related === 'string') {
      return this.insights.related
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.replace(/^[•\-\*]\s*/, '').trim());
    }

    return [];
  }

  formatWithLineBreaks(text: string): string {
    if (!text) return '';
    return text.replace(/\n/g, '<br>');
  }
} 