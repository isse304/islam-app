import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DuaService, Dua, DuaCategory } from '../../services/dua.service';
import { Subscription, timer } from 'rxjs';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { SubscriptionService } from '../../services/subscription.service';
import { DuaInsightsComponent } from '../dua-insights/dua-insights.component';
import { DuaTafsirComponent } from './dua-tafsir.component';
import { AuthStateService } from '../../services/auth-state.service';
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

interface EmotionalDuaResponse {
  duas: Dua[];
  insights: string;
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
        DuaTafsirComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DuaComponent implements OnInit, OnDestroy {
  selectedCategory: DuaCategory | null = null;
  filteredDuas: Dua[] = [];
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
  isLoading = false;
  error: string = '';
  private prayerTimesSubscription: Subscription | null = null;
  private duaSubscription: Subscription | null = null;
  feeling: string = '';
  selectedDua: Dua | null = null;
  selectedEmotion: string | null = null;
  emotionSuggestions: string[] = [];
  aiInsights: string = '';
  fontSize: number = 32; // Default font size for Arabic text
  private subscriptions = new Subscription();

  constructor(
    private duaService: DuaService,
    public subscriptionService: SubscriptionService,
    public authStateService: AuthStateService,
    //private prayerTimesService: PrayerTimesService,
    private route: ActivatedRoute,
    private router: Router,
    private cd: ChangeDetectorRef
  ) {
    this.subscriptions.add(
      this.duaService.isLoading$.subscribe(
        loading => {
          this.isLoading = loading;
          this.cd.markForCheck();
        }
      )
    );
  }

  ngOnInit() {
    // First check route params
    this.route.params.subscribe(params => {
      const category = params['category'] as DuaCategory;
      if (category && this.categories.includes(category)) {
        this.selectedCategory = category;
        this.loadDuasByCategory(category);
      } else if (!this.selectedCategory) {
        // Default to 'morning' if no category is specified
        this.selectedCategory = 'morning';
        this.loadDuasByCategory('morning');
      }
    });
    //this.setupPrayerTimeReminders();
    // Load basic dua data
    this.loadDuas();
  }

  ngOnDestroy() {
    this.prayerTimesSubscription?.unsubscribe();
    this.duaSubscription?.unsubscribe();
    this.subscriptions.unsubscribe();
  }

  loadDuasByCategory(category: DuaCategory) {
    this.isLoading = true;
    this.error = '';
    
    this.duaService.getDuasByCategory(category)
      .subscribe({
        next: (duas) => {
          this.filteredDuas = duas;
          this.isLoading = false;
        },
        error: (error) => {
          this.error = 'Failed to load duas. Please try again.';
          this.isLoading = false;
        }
      });
  }

  onCategoryChange(category: DuaCategory) {
    this.selectedCategory = category;
    this.loadDuasByCategory(category);
  }

  // private setupPrayerTimeReminders() {
  //   this.prayerTimesSubscription = this.prayerTimesService
  //     .getPrayerTimes(51.5074, -0.1278) // London coordinates
  //     .subscribe(times => {
  //       if (times?.data?.timings) {
  //         this.scheduleDuaReminder('morning', times.data.timings.Fajr, 10);
  //         this.scheduleDuaReminder('evening', times.data.timings.Maghrib, 10);
  //       }
  //     });
  // }

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
    if (!feeling?.trim()) return;

    const isPremium = await firstValueFrom(this.authStateService.isPremiumUser$);
    if (!isPremium) {
      this.subscriptionService.showSubscriptionPage('Emotional Dua Search');
      return;
    }

    try {
      console.log('Starting emotional dua search for:', feeling);
      const response = await this.duaService.getEmotionalDuasWithAI(feeling);
      console.log('Received response:', response);
      
      this.cd.markForCheck();
      
      if (response.duas && Array.isArray(response.duas)) {
        this.filteredDuas = response.duas;
      } else {
        console.warn('No duas found in response:', response);
        this.filteredDuas = [];
      }
      
      // Try to parse the insights if it's a string
      if (response.insights) {
        try {
          if (typeof response.insights === 'string') {
            try {
              // Try to parse as JSON first
              const parsed = JSON.parse(response.insights);
              this.aiInsights = JSON.stringify(parsed); // Store as string to preserve JSON structure
            } catch {
              // If not JSON, store as is
              this.aiInsights = response.insights;
            }
          } else {
            // If already an object, stringify to preserve structure
            this.aiInsights = JSON.stringify(response.insights);
          }
        } catch (error) {
          console.warn('Error parsing insights:', error);
          this.aiInsights = typeof response.insights === 'string' ? response.insights : '';
        }
      } else {
        console.warn('No insights found in response');
        this.aiInsights = '';
      }

      // Get related emotions
      const emotions = await firstValueFrom<string[]>(this.duaService.extractEmotionsFromText(feeling));
      this.emotionSuggestions = [];
      
      for (const emotion of emotions) {
        const related = this.duaService.getRelatedEmotions(emotion);
        this.emotionSuggestions.push(...related);
      }

      this.emotionSuggestions = [...new Set(this.emotionSuggestions)]
        .filter(emotion => !emotions.includes(emotion))
        .slice(0, 5);

      this.selectedEmotion = feeling;

    } catch (error) {
      console.error('Error searching duas:', error);
      this.error = 'An error occurred while searching for duas. Please try again.';
      this.filteredDuas = [];
      this.aiInsights = '';
    }

    this.cd.markForCheck();
  }

  clearEmotionSearch() {
    this.feeling = '';
    this.selectedEmotion = '';
    this.aiInsights = '';
    this.emotionSuggestions = [];
    this.error = '';
    
    // Restore duas from the selected category
    if (this.selectedCategory) {
      this.loadDuasByCategory(this.selectedCategory);
    }
  }

  selectSuggestedEmotion(emotion: string) {
    this.feeling = emotion;
    this.searchByFeeling(emotion);
  }

  async onDuaSelect(dua: Dua) {
    this.selectedDua = dua;
  }

  private loadDuas() {
    this.isLoading = true;
    this.duaService.getDuasByCategory('morning')  // Default to morning category
      .subscribe({
        next: (duas: Dua[]) => {
          this.filteredDuas = duas;
          this.isLoading = false;
        },
        error: (error: Error) => {
          this.error = 'Failed to load duas. Please try again.';
          this.isLoading = false;
        }
      });
  }

  getSpiritualAdviceParagraphs(): string[] {
    try {
      if (this.aiInsights && typeof this.aiInsights === 'string') {
        try {
          const parsed = JSON.parse(this.aiInsights);
          // Get spiritual advice from recommended_duas and quranic_guidance
          const advice = [];
          if (parsed.quranic_guidance && Array.isArray(parsed.quranic_guidance)) {
            advice.push(...parsed.quranic_guidance);
          }
          if (parsed.recommended_duas && Array.isArray(parsed.recommended_duas)) {
            advice.push(...parsed.recommended_duas.map((dua: { translation: string; virtue: string; source: string }) => 
              `${dua.translation}\nVirtue: ${dua.virtue}\nSource: ${dua.source}`
            ));
          }
          return advice.filter(a => a.trim());
        } catch {
          // If not JSON, try to parse as text
          const sections = this.aiInsights.split('\n\n');
          const advice = sections.find(section => 
            section.toLowerCase().includes('spiritual advice')
          );
          if (!advice) return [];
          const lines = advice.split('\n');
          return lines.slice(1).filter(line => line.trim());
        }
      }
      return [];
    } catch (error) {
      console.warn('Error parsing spiritual advice:', error);
      return [];
    }
  }

  getPracticalSteps(): string[] {
    try {
      if (this.aiInsights && typeof this.aiInsights === 'string') {
        try {
          const parsed = JSON.parse(this.aiInsights);
          if (parsed.practical_steps && Array.isArray(parsed.practical_steps)) {
            return parsed.practical_steps.filter((step: string) => step.trim());
          }
          return [];
        } catch {
          // If not JSON, try to parse as text
          const sections = this.aiInsights.split('\n\n');
          const practicalSection = sections.find(section => 
            section.toLowerCase().includes('practical steps')
          );
          if (!practicalSection) return [];
          const lines = practicalSection.split('\n');
          return lines
            .slice(1)
            .filter(line => line.trim().startsWith('•'))
            .map(line => line.replace('•', '').trim());
        }
      }
      return [];
    } catch (error) {
      console.warn('Error parsing practical steps:', error);
      return [];
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

  getUnderstandingSection(): string {
    try {
      if (this.aiInsights && typeof this.aiInsights === 'string') {
        // Try to parse as JSON first
        try {
          const parsed = JSON.parse(this.aiInsights);
          return parsed.understanding || this.aiInsights;
        } catch {
          // If not JSON, return as is
          return this.aiInsights;
        }
      }
      return '';
    } catch (error) {
      console.warn('Error getting understanding section:', error);
      return '';
    }
  }

  getHistoricalExample(): string {
    try {
      if (this.aiInsights && typeof this.aiInsights === 'string') {
        try {
          const parsed = JSON.parse(this.aiInsights);
          return parsed.prophetic_example || '';
        } catch {
          return '';
        }
      }
      return '';
    } catch (error) {
      console.warn('Error getting historical example:', error);
      return '';
    }
  }

  getLearningPoints(): string {
    try {
      if (this.aiInsights && typeof this.aiInsights === 'string') {
        try {
          const parsed = JSON.parse(this.aiInsights);
          if (Array.isArray(parsed.practical_steps)) {
            return parsed.practical_steps.join('\n');
          }
          return parsed.practical_steps || '';
        } catch {
          return '';
        }
      }
      return '';
    } catch (error) {
      console.warn('Error getting learning points:', error);
      return '';
    }
  }

  getRelatedVerses(): string[] {
    try {
      if (this.aiInsights && typeof this.aiInsights === 'string') {
        try {
          const parsed = JSON.parse(this.aiInsights);
          const verses = [];
          
          // Get verses from related_verses_hadith
          if (parsed.related_verses_hadith?.verses) {
            verses.push(...parsed.related_verses_hadith.verses.map((v: { reference: string; translation: string; relevance?: string }) => 
              `${v.reference}: ${v.translation}${v.relevance ? `\nRelevance: ${v.relevance}` : ''}`
            ));
          }
          
          // Get hadith from related_verses_hadith
          if (parsed.related_verses_hadith?.hadith) {
            verses.push(...parsed.related_verses_hadith.hadith.map((h: { text: string; source: string; grade?: string }) => 
              `${h.text}\nSource: ${h.source}${h.grade ? ` (${h.grade})` : ''}`
            ));
          }
          
          return verses.filter(v => v.trim());
        } catch {
          // If not JSON, try to parse as text
          const sections = this.aiInsights.split('\n\n');
          const versesSection = sections.find(section => 
            section.toLowerCase().includes('related verses') ||
            section.toLowerCase().includes('quranic references')
          );
          if (!versesSection) return [];
          const lines = versesSection.split('\n');
          return lines
            .slice(1)
            .filter(line => line.trim().startsWith('•'))
            .map(line => line.replace('•', '').trim());
        }
      }
      return [];
    } catch (error) {
      console.warn('Error parsing related verses:', error);
      return [];
    }
  }

  async showInsights(dua: Dua) {
    const isPremium = await firstValueFrom(this.authStateService.isPremiumUser$);
    if (!isPremium) {
      this.subscriptionService.showSubscriptionPage('Dua Insights');
      return;
    }

    this.selectedDua = dua;
    try {
      const insights = await firstValueFrom<string>(this.duaService.getDuaInsights(dua.id.toString()));
      this.aiInsights = insights;
    } catch (error) {
      console.error('Error getting dua insights:', error);
      this.error = 'Failed to load dua insights. Please try again.';
    }
  }
} 