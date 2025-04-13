import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DuaService, Dua, DuaCategory, ResponseType } from '../../services/dua.service';
import { Subscription, timer } from 'rxjs';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { SubscriptionService } from '../../services/subscription.service';
import { DuaInsightsComponent } from '../dua-insights/dua-insights.component';
//import { DuaTafsirComponent } from './dua-tafsir.component';
import { FirebaseAuthService, AppUser } from '../../services/firebase-auth.service';
import { firstValueFrom } from 'rxjs';
import { first } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EmotionalDuaResponse } from '../../types/dua.types';
import { Title, Meta } from '@angular/platform-browser';

interface Verse {
  reference: string;
  translation: string;
}

interface SpiritualAdvice {
  understanding?: string;
  duas?: Array<{
    arabic?: string;
    transliteration?: string;
    translation?: string;
    reference?: string;
    virtue?: string;
  }>;
  dhikr?: Array<{
    phrase?: string;
    translation?: string;
    count?: string;
    timing?: string;
    benefit?: string;
  }>;
  scholarly_guidance?: Array<{
    quote: string;
    scholar: string;
    source?: string;
  }>;
  spiritual_remedies?: Array<{
    practice: string;
    method: string;
    benefit: string;
  }>;
}

@Component({
    selector: 'app-dua',
    templateUrl: './dua.component.html',
    styleUrls: ['./dua.component.css'],
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        RouterModule,
        MatButtonModule,
        MatCardModule,
        MatChipsModule,
        MatIconModule,
        MatInputModule,
        MatProgressSpinnerModule,
        MatFormFieldModule,
        MatSelectModule,
        MatTooltipModule,
        DuaInsightsComponent,
        //DuaTafsirComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DuaComponent implements OnInit, OnDestroy {
  @Input() fontSize: number = 32;
  private subscriptions = new Subscription();
  private isPremiumUser: boolean = false;
  showResults: boolean = false;
  emotionSuggestions: string[] = [];
  selectedEmotion: string = '';
  aiInsights: string = '';
  filteredDuas: Dua[] = [];
  selectedCategory: DuaCategory | null = null;
  categories: DuaCategory[] = [
    'morning',
    'evening',
    'protection',
    'forgiveness',
    'anxiety',
    'general',
    'sleep',
    'travel',
    'eating',
    'hardship',
    'gratitude',
    'guidance',
    'sadness'
  ];
  isLoadingDuas = false;
  isLoadingEmotional = false;
  error: string = '';
  private prayerTimesSubscription: Subscription | null = null;
  feeling: string = '';
  selectedDua: Dua | null = null;
  spiritualAdvice: SpiritualAdvice | null = null;

  constructor(
    private duaService: DuaService,
    public firebaseAuthService: FirebaseAuthService,
    public subscriptionService: SubscriptionService,
    private cd: ChangeDetectorRef,
    private titleService: Title,
    private metaService: Meta
  ) {
    this.subscriptions.add(
      this.firebaseAuthService.user$.subscribe(
        (user: AppUser | null) => {
          this.isPremiumUser = user?.isPremium ?? false;
          this.cd.markForCheck();
        }
      )
    );
  }

  ngOnInit() {
    this.titleService.setTitle('Daily Duas & Emotional Guidance | Nura AI');
    this.metaService.addTags([
      { name: 'description', content: 'Explore daily Islamic duas (morning, evening, protection, etc.) and find AI-powered guidance based on your emotions. Learn meanings, virtues, and applications.' },
      { name: 'keywords', content: 'dua, supplication, islamic prayer, daily duas, morning dua, evening dua, emotional guidance, islam, nura ai' }
    ]);

    this.loadDuas();
    this.spiritualAdvice = this.getSpiritualAdvice();
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  private loadDuas() {
    this.isLoadingDuas = true;
    this.cd.markForCheck();

    this.duaService.getDuasByCategory('morning').subscribe({
      next: (duas: Dua[]) => {
        this.filteredDuas = duas;
        this.isLoadingDuas = false;
        this.cd.markForCheck();
      },
      error: (error: Error) => {
        console.error('Failed to load duas:', error);
        this.isLoadingDuas = false;
        this.cd.markForCheck();
      }
    });
  }

  loadDuasByCategory(category: DuaCategory) {
    this.isLoadingDuas = true;
    this.error = '';
    this.cd.markForCheck();
    
    this.duaService.getDuasByCategory(category)
      .subscribe({
        next: (duas) => {
          this.filteredDuas = duas;
          this.isLoadingDuas = false;
          this.cd.markForCheck();
        },
        error: (error) => {
          this.error = 'Failed to load duas. Please try again.';
          this.isLoadingDuas = false;
          this.cd.markForCheck();
        }
      });
  }

  onCategoryChange(category: DuaCategory) {
    this.selectedCategory = category;
    this.loadDuasByCategory(category);
  }

  private scheduleDuaReminder(time: string, prayerTime: string, delayMinutes: number) {
    const prayerDateTime = new Date(`${new Date().toDateString()} ${prayerTime}`);
    const reminderTime = new Date(prayerDateTime.getTime() + delayMinutes * 60000);
    const now = new Date();
    let delay = reminderTime.getTime() - now.getTime();

    if (delay < 0) {
      delay += 86400000; // Add 24 hours if time has passed
    }

    timer(delay).subscribe(() => {
      this.showNotification(time);
    });
  }

  private showNotification(time: string) {
    if (Notification.permission === 'granted') {
      new Notification(`Time for ${time} duas!`, {
        body: `It's time for your ${time} duas. May Allah accept your prayers.`,
        icon: '/assets/icons/dua-icon.png'
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          this.showNotification(time);
        }
      });
    }
  }

  async searchByFeeling(feeling: string) {
    if (!feeling) {
      // console.log('No feeling provided');
      return;
    }

    // Clear previous results
    this.aiInsights = '';
    this.showResults = false;
    this.emotionSuggestions = [];
    this.spiritualAdvice = null;  // Reset spiritual advice
    
    // console.log('Starting emotional dua search for:', feeling);
    // console.log('User is premium:', this.isPremiumUser);

    if (!this.isPremiumUser) {
      this.subscriptionService.showSubscriptionPage('Emotional Dua Search');
      return;
    }

    this.isLoadingEmotional = true;
    this.cd.markForCheck();

    try {
      const response = await this.duaService.getEmotionalDuasWithAI(feeling);
      // console.log('Received response:', response);

      if (response) {
        this.aiInsights = JSON.stringify({
          understanding: response.content || '',
          quranic_guidance: response.quranic_guidance || [],
          prophetic_example: response.prophetic_example || '',
          practical_steps: response.practical_steps || [],
          related_verses_hadith: response.related_verses_hadith || {
            verses: [],
            hadith: []
          },
          reflection_points: response.reflection_points || [],
          spiritual_advice: response.spiritual_advice || {
            understanding: '',
            duas: [],
            dhikr: [],
            scholarly_guidance: [],
            spiritual_remedies: []
          },
          historical_context: response.prophetic_example || ''
        });

        // Update spiritual advice
        this.spiritualAdvice = this.getSpiritualAdvice();
        
        const emotions = feeling.toLowerCase().split(/[,\s]+/);
        const suggestions = emotions
          .flatMap(emotion => {
            const related = this.getRelatedEmotions(emotion);
            return related.filter(e => e !== emotion);
          })
          .filter((value, index, self) => self.indexOf(value) === index)
          .slice(0, 5);

        this.emotionSuggestions = suggestions;
        this.selectedEmotion = feeling;
        this.showResults = true;
      }
    } catch (error) {
      console.error('Error searching by feeling:', error);
      this.error = 'Failed to get response. Please try again.';
    } finally {
      this.isLoadingEmotional = false;
      this.cd.markForCheck();
    }
  }

  getRelatedEmotions(emotion: string): string[] {
    const emotionMap: { [key: string]: string[] } = {
      'anxiety': ['worry', 'fear', 'stress', 'nervousness', 'unease'],
      'sadness': ['grief', 'sorrow', 'depression', 'melancholy', 'heartbreak'],
      'anger': ['frustration', 'rage', 'irritation', 'annoyance', 'fury'],
      'fear': ['anxiety', 'terror', 'panic', 'dread', 'apprehension'],
      'joy': ['happiness', 'delight', 'elation', 'bliss', 'contentment'],
      'gratitude': ['thankfulness', 'appreciation', 'gratefulness', 'recognition', 'blessing'],
      'hope': ['optimism', 'aspiration', 'confidence', 'faith', 'trust'],
      'love': ['affection', 'devotion', 'adoration', 'attachment', 'fondness'],
      'peace': ['tranquility', 'serenity', 'calmness', 'harmony', 'stillness'],
      'guilt': ['remorse', 'regret', 'shame', 'contrition', 'repentance']
    };

    return emotionMap[emotion.toLowerCase()] || [];
  }

  getUnderstandingSection(): string {
    try {
      return JSON.parse(this.aiInsights || '{}').understanding || '';
    } catch (e) {
      return '';
    }
  }

  getQuranicGuidance(): string[] {
    try {
      const guidance = JSON.parse(this.aiInsights || '{}').quranic_guidance;
      return Array.isArray(guidance) ? guidance : [];
    } catch (e) {
      return [];
    }
  }

  getPropheticExample(): string {
    try {
      return JSON.parse(this.aiInsights || '{}').prophetic_example || '';
    } catch (e) {
      return '';
    }
  }

  getPracticalSteps(): string[] {
    try {
      const insights = JSON.parse(this.aiInsights || '{}');
      return insights.practical_steps || [];
    } catch (e) {
      return [];
    }
  }

  getRelatedVerses(): string[] {
    try {
      const insights = JSON.parse(this.aiInsights || '{}');
      const verses = insights.related_verses_hadith?.verses || [];
      return verses.map((v: any) => `${v.reference}\n${v.text}\n${v.relevance}`);
    } catch (e) {
      return [];
    }
  }

  getReflectionPoints(): string[] {
    try {
      const points = JSON.parse(this.aiInsights || '{}').reflection_points;
      return Array.isArray(points) ? points : [];
    } catch (e) {
      return [];
    }
  }

  async showInsights(dua: Dua) {
    const isPremium = await this.firebaseAuthService.isPremiumUser();
    if (!isPremium) {
      this.subscriptionService.showSubscriptionPage('Dua Insights');
      return;
    }

    this.selectedDua = dua;
    this.error = '';
    this.cd.markForCheck();

    try {
      const insights = await firstValueFrom<ResponseType>(this.duaService.getDuaInsights(dua.id.toString()));
      this.aiInsights = typeof insights === 'string' ? insights : JSON.stringify(insights);
      this.cd.markForCheck();
    } catch (error) {
      console.error('Error getting dua insights:', error);
      this.error = 'Failed to load dua insights. Please try again.';
      this.selectedDua = null;
      this.cd.markForCheck();
    }
  }

  getRecommendedDuas(): any[] {
    try {
      const insights = JSON.parse(this.aiInsights);
      return insights.recommended_duas || [];
    } catch (e) {
      return [];
    }
  }

  getRelatedVersesHadith(): { verses: any[], hadith: any[] } {
    try {
      const insights = JSON.parse(this.aiInsights);
      return insights.related_verses_hadith || { verses: [], hadith: [] };
    } catch (e) {
      return { verses: [], hadith: [] };
    }
  }

  private showPremiumDialog(): void {
    this.subscriptionService.showSubscriptionPage('Emotional Dua Search');
  }

  getModernApplication(): string {
    try {
      const steps = JSON.parse(this.aiInsights || '{}').practical_steps;
      return Array.isArray(steps) ? steps.join('\n') : '';
    } catch (e) {
      return '';
    }
  }

  getStepIcon(step: string): { [key: string]: boolean } {
    const step_lower = step.toLowerCase();
    return {
      'fa-pray': step_lower.includes('pray') || step_lower.includes('salah'),
      'fa-heart': step_lower.includes('dhikr') || step_lower.includes('remembrance'),
      'fa-users': step_lower.includes('family') || step_lower.includes('friend') || step_lower.includes('community'),
      'fa-tree': step_lower.includes('nature') || step_lower.includes('walk'),
      'fa-star': step_lower.includes('gratitude') || step_lower.includes('thank'),
      'fa-moon': step_lower.includes('night') || step_lower.includes('sleep'),
      'fa-sun': step_lower.includes('morning') || step_lower.includes('day'),
      'fa-book': step_lower.includes('quran') || step_lower.includes('read'),
      'fa-hands': step_lower.includes('dua') || step_lower.includes('supplication'),
      'fa-clock': step_lower.includes('time') || step_lower.includes('regular'),
      'fa-tasks': true // fallback icon
    };
  }

  async onDuaSelect(dua: Dua) {
    // console.log('Selecting dua:', dua);
    
    try {
      const isPremium = await this.firebaseAuthService.isPremiumUser();
      if (!isPremium) {
        // console.log('User is not premium');
        this.subscriptionService.showSubscriptionPage('Dua Insights');
        return;
      }

      this.selectedDua = dua;
      this.cd.markForCheck();
    } catch (error: any) {
      console.error('Error checking premium status:', error);
    }
  }

  clearEmotionSearch() {
    this.feeling = '';
    this.selectedEmotion = '';
    this.emotionSuggestions = [];
    this.aiInsights = '';
    this.showResults = false;
  }

  onEnterPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && this.feeling.trim()) {
      this.searchByFeeling(this.feeling);
    }
  }

  selectSuggestedEmotion(emotion: string) {
    this.feeling = emotion;
    this.searchByFeeling(emotion);
  }

  getHistoricalExample(): string {
    try {
      return JSON.parse(this.aiInsights || '{}').prophetic_example || '';
    } catch (e) {
      return '';
    }
  }

  getLearningPoints(): string {
    try {
      return JSON.parse(this.aiInsights || '{}').reflection_points?.[0] || '';
    } catch (e) {
      return '';
    }
  }

  getSpiritualAdviceParagraphs(): string[] {
    try {
      const insights = JSON.parse(this.aiInsights || '{}');
      const spiritualAdvice = insights.spiritual_advice || {};
      
      const sections = [];
      
      // Add Islamic understanding
      if (spiritualAdvice.understanding) {
        sections.push('Islamic Perspective:', spiritualAdvice.understanding);
      }
      
      // Add recommended duas
      if (spiritualAdvice.duas?.length) {
        sections.push('\nRecommended Duas:');
        spiritualAdvice.duas.forEach((dua: any) => {
          if (typeof dua === 'string') {
            sections.push(dua);
          } else {
            if (dua.arabic) sections.push(`\n${dua.arabic}`);
            if (dua.translation) sections.push(`Translation: ${dua.translation}`);
            if (dua.reference) sections.push(`Reference: ${dua.reference}`);
            if (dua.virtue) sections.push(`Virtue: ${dua.virtue}\n`);
          }
        });
      }
      
      // Add dhikr recommendations
      if (spiritualAdvice.dhikr?.length) {
        sections.push('\nBeneficial Dhikr:');
        spiritualAdvice.dhikr.forEach((dhikr: any) => {
          if (typeof dhikr === 'string') {
            sections.push(dhikr);
          } else {
            if (dhikr.phrase) sections.push(`\n${dhikr.phrase}`);
            if (dhikr.translation) sections.push(`Translation: ${dhikr.translation}`);
            if (dhikr.count) sections.push(`Repeat ${dhikr.count} times`);
            if (dhikr.benefit) sections.push(`Benefit: ${dhikr.benefit}`);
            if (dhikr.timing) sections.push(`Timing: ${dhikr.timing}\n`);
          }
        });
      }
      
      // Add scholarly guidance
      if (spiritualAdvice.scholarly_guidance?.length) {
        sections.push('\nScholarly Guidance:');
        spiritualAdvice.scholarly_guidance.forEach((guidance: any) => {
          if (typeof guidance === 'string') {
            sections.push(guidance);
          } else if (guidance.quote) {
            sections.push(`\n${guidance.quote}`);
            if (guidance.scholar) sections.push(`- ${guidance.scholar}`);
          } else if (guidance.content) {
            sections.push(`\n${guidance.content}`);
            if (guidance.source) sections.push(`- ${guidance.source}`);
          }
        });
      }
      
      // Add spiritual remedies
      if (spiritualAdvice.spiritual_remedies?.length) {
        sections.push('\nSpiritual Remedies:', ...spiritualAdvice.spiritual_remedies);
      }
      
      return sections.filter(section => section);
    } catch (e) {
      console.error('Error parsing spiritual advice:', e);
      return [];
    }
  }

  getRelatedHadith(): string[] {
    try {
      const insights = JSON.parse(this.aiInsights || '{}');
      const hadith = insights.related_verses_hadith?.hadith || [];
      return hadith.map((h: any) => `${h.source} (${h.grade})\n${h.text}\n${h.relevance}`);
    } catch (e) {
      return [];
    }
  }

  getSpiritualAdvice(): SpiritualAdvice {
    try {
      const insights = JSON.parse(this.aiInsights || '{}');
      if (insights.spiritual_advice) {
        const advice = insights.spiritual_advice;

        // Parse duas if they're strings
        if (Array.isArray(advice.duas)) {
          advice.duas = advice.duas.map((dua: any) => {
            if (typeof dua === 'string') {
              // Enhanced regex patterns for better extraction
              const arabicMatch = dua.match(/['"]([\u0600-\u06FF\s،.]+)['"]/) || 
                                dua.match(/([\u0600-\u06FF\s،.]+)(?=\s*[-—]\s*|$)/) || [];
              const translationMatch = dua.match(/Translation:\s*([^.]+)/) ||
                                     dua.match(/['"]([\u0600-\u06FF\s،.]+)['"].*?['"](.*?)['"]/) ||
                                     dua.match(/\((([^()]*\([^()]*\))*[^()]*)\)/) || [];
              const referenceMatch = dua.match(/(?:Reference:|from|source:)\s*([^.]+)/) || [];
              const virtueMatch = dua.match(/(?:Virtue:|brings|provides|benefit:)\s*([^.]+)/) ||
                                dua.match(/(?<=\.)([^.]+(?:benefit|blessing|reward)[^.]+)\.?/) || [];
              
              return {
                arabic: arabicMatch[1]?.trim() || '',
                translation: translationMatch[1]?.trim() || '',
                reference: referenceMatch[1]?.trim() || '',
                virtue: virtueMatch[1]?.trim() || ''
              };
            }
            return dua;
          }).filter((dua: any) => dua.arabic || dua.translation);
        }

        // Parse dhikr if they're strings
        if (Array.isArray(advice.dhikr)) {
          advice.dhikr = advice.dhikr.map((dhikr: any) => {
            if (typeof dhikr === 'string') {
              // Enhanced regex patterns for better dhikr extraction
              const phraseMatch = dhikr.match(/['"]([\u0600-\u06FF\s،.]+)['"]/) || 
                                dhikr.match(/Recite\s+['"]([^'"]+)['"]/) ||
                                dhikr.match(/([\u0600-\u06FF\s،.]+)(?=\s*[-—]\s*|$)/) || [];
              const translationMatch = dhikr.match(/Translation:\s*([^.]+)/) ||
                                     dhikr.match(/means?\s*['"](.*?)['"]/) ||
                                     dhikr.match(/\((([^()]*\([^()]*\))*[^()]*)\)/) || [];
              const countMatch = dhikr.match(/(\d+)\s*(?:time|times|repetitions)/) || [];
              const timingMatch = dhikr.match(/(?:Timing:|in|during|at|every)\s+([^,.]+)(?=[,.]|$)/) || [];
              const benefitMatch = dhikr.match(/(?:Benefit:|brings|provides|for)\s+([^.]+)/) ||
                                 dhikr.match(/(?<=\.)([^.]+(?:benefit|blessing|reward)[^.]+)\.?/) || [];
              
              return {
                phrase: phraseMatch[1]?.trim() || '',
                translation: translationMatch[1]?.trim() || '',
                count: countMatch[1] ? `${countMatch[1]} times` : '',
                timing: timingMatch[1]?.trim() || '',
                benefit: benefitMatch[1]?.trim() || ''
              };
            }
            return dhikr;
          }).filter((dhikr: any) => dhikr.phrase || dhikr.translation);
        }

        // Parse scholarly guidance if they're strings
        if (Array.isArray(advice.scholarly_guidance)) {
          advice.scholarly_guidance = advice.scholarly_guidance.map((guidance: any) => {
            if (typeof guidance === 'string') {
              // Enhanced regex patterns for better scholarly guidance extraction
              const quoteMatch = guidance.match(/["'](.*?)["']/) || 
                               guidance.match(/^([^"']+?)(?=\s*[-–—]\s*|said|according)/) || [];
              const scholarMatch = guidance.match(/(?:[-–—]\s*|said|according to|by)\s+([^,.()]+)/) || [];
              const sourceMatch = guidance.match(/\((([^()]*\([^()]*\))*[^()]*)\)/) || 
                                guidance.match(/from\s+([^,.]+)/) || [];
              
              return {
                quote: quoteMatch[1]?.trim() || guidance.split(/[-–—]/)[0]?.trim() || '',
                scholar: scholarMatch[1]?.trim() || '',
                source: sourceMatch[1]?.trim() || ''
              };
            }
            return guidance;
          }).filter((guidance: any) => guidance.quote || guidance.scholar);
        }

        // Parse spiritual remedies with better structure
        if (Array.isArray(advice.spiritual_remedies)) {
          const uniqueRemedies = new Map();
          advice.spiritual_remedies = advice.spiritual_remedies
            .map((remedy: any) => {
              if (typeof remedy === 'string') {
                const practiceMatch = remedy.match(/^([^,.]+)(?=\s+(?:to|for|brings|by|through|via|$))/) || [];
                const methodMatch = remedy.match(/(?:by|through|via)\s+([^.]+?)(?=\s+(?:to|for|brings|$))/) || [];
                const benefitMatch = remedy.match(/(?:to|for|brings|benefit:)\s+([^.]+)/) ||
                                   remedy.match(/(?<=\.)([^.]+(?:benefit|blessing|reward)[^.]+)\.?/) || [];
                
                return {
                  practice: practiceMatch[1]?.trim() || '',
                  method: methodMatch[1]?.trim() || '',
                  benefit: benefitMatch[1]?.trim() || ''
                };
              }
              return remedy;
            })
            .filter((remedy: any) => {
              if (!remedy?.practice) return false;
              const key = `${remedy.practice}-${remedy.method}`;
              if (uniqueRemedies.has(key)) return false;
              uniqueRemedies.set(key, true);
              return true;
            });
        }

        return advice;
      }
      return {
        understanding: '',
        duas: [],
        dhikr: [],
        scholarly_guidance: [],
        spiritual_remedies: []
      };
    } catch (e) {
      console.error('Error parsing spiritual advice:', e);
      return {
        understanding: '',
        duas: [],
        dhikr: [],
        scholarly_guidance: [],
        spiritual_remedies: []
      };
    }
  }

  async loadDuaInsights(dua: Dua) {
    if (!dua) {
      // console.log('No dua provided for insights');
      return;
    }

    if (!this.isPremiumUser) {
      this.showPremiumDialog();
      return;
    }

    this.selectedDua = dua;
    this.cd.markForCheck();

    try {
      const response = await firstValueFrom(this.duaService.getDuaInsights(dua.id.toString()));
      // console.log('Received insights:', response);

      if (response) {
        // console.log('Received insights:', response);
        if ('chunk' in response) {
          // Handle streaming response
          // ... existing code ...
        } else {
          const insights = response as any; // Type assertion since we know the response structure
          this.aiInsights = JSON.stringify({
            understanding: insights.content || '',
            quranic_guidance: insights.quranic_guidance || [],
            prophetic_example: insights.prophetic_example || '',
            practical_steps: insights.practical_steps || [],
            related_verses_hadith: insights.related_verses_hadith || {
              verses: [],
              hadith: []
            },
            reflection_points: insights.reflection_points || [],
            spiritual_advice: insights.spiritual_advice || {
              understanding: '',
              duas: [],
              dhikr: [],
              scholarly_guidance: [],
              spiritual_remedies: []
            },
            historical_context: insights.prophetic_example || ''
          });

          // Update spiritual advice
          this.spiritualAdvice = this.getSpiritualAdvice();
          
          this.showResults = true;
        }
      }
    } catch (error) {
      console.error('Error loading insights:', error);
      this.error = 'Failed to load insights. Please try again.';
    } finally {
      this.cd.markForCheck();
    }
  }
}
