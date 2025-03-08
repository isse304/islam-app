import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DuaService, Dua, DuaCategory } from '../../services/dua.service';
import { Subscription, timer } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { SubscriptionService } from '../../services/subscription.service';

@Component({
    selector: 'app-dua',
    templateUrl: './dua.component.html',
    styleUrls: ['./dua.component.css'],
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
  isLoading: boolean = false;
  error: string = '';
  private prayerTimesSubscription: Subscription | null = null;
  private duaSubscription: Subscription | null = null;
  feeling: string = '';
  selectedDua: Dua | null = null;
  selectedEmotion: string | null = null;
  emotionSuggestions: string[] = [];
  aiInsights: string = '';
  fontSize: number = 32; // Default font size for Arabic text

  constructor(
    private duaService: DuaService,
    private subscriptionService: SubscriptionService,
    //private prayerTimesService: PrayerTimesService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

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

  async searchByFeeling() {
    if (!this.feeling) return;

    this.isLoading = true;
    this.error = '';
    this.selectedEmotion = this.feeling.trim();
    
    try {
      // First, try to find duas in our database
      const { duas, insights } = await this.duaService.getEmotionalDuasWithAI(this.selectedEmotion);
      
      if (duas.length === 0) {
        // If no duas found in our database, get recommendations from reliable sources
        const { duas: recommendedDuas, insights: recommendedInsights } = 
          await this.duaService.getRecommendedDuasFromSources(this.selectedEmotion);
        
        this.filteredDuas = recommendedDuas;
        this.aiInsights = recommendedInsights;
      } else {
        this.filteredDuas = duas;
        this.aiInsights = insights;
      }

      // Get related emotions
      this.emotionSuggestions = await this.duaService.getRelatedEmotions(this.selectedEmotion);
      this.emotionSuggestions = this.emotionSuggestions.slice(0, 5);
    } catch (error) {
      console.error('Error searching duas:', error);
      this.error = 'An error occurred while searching for duas. Please try again.';
    } finally {
      this.isLoading = false;
    }
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
    this.searchByFeeling();
  }

  async onDuaSelect(dua: Dua) {
    // Temporarily bypass premium check for debugging
    // const hasPremiumAccess = await this.subscriptionService.checkPremiumAccess('AI Dua Insights');
    // if (hasPremiumAccess) {
    this.selectedDua = dua;
    // }
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
    if (!this.aiInsights || typeof this.aiInsights !== 'string') return [];
    try {
      const sections = this.aiInsights.split('\n\n');
      const advice = sections.find(section => 
        section.toLowerCase().includes('spiritual advice')
      );
      return advice ? advice.split('\n').filter(p => p.trim()) : [];
    } catch (error) {
      console.error('Error parsing spiritual advice:', error);
      return [];
    }
  }

  getPracticalSteps(): string[] {
    if (!this.aiInsights || typeof this.aiInsights !== 'string') return [];
    try {
      const sections = this.aiInsights.split('\n\n');
      const practicalSection = sections.find(section => 
        section.toLowerCase().includes('practical steps')
      );
      return practicalSection ? 
        practicalSection.split('\n')
          .filter(step => step.startsWith('•'))
          .map(step => step.replace('•', '').trim()) : 
        [];
    } catch (error) {
      console.error('Error parsing practical steps:', error);
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
    if (!this.aiInsights || typeof this.aiInsights !== 'string') return '';
    try {
      const sections = this.aiInsights.split('\n\n');
      const understandingSection = sections.find(section => 
        section.toLowerCase().includes('understanding your emotion')
      );
      if (!understandingSection) return '';
      return understandingSection.split('\n').slice(1).join('\n').trim();
    } catch (error) {
      console.error('Error parsing understanding section:', error);
      return '';
    }
  }

  getHistoricalExample(): string {
    if (!this.aiInsights || typeof this.aiInsights !== 'string') return '';
    try {
      const sections = this.aiInsights.split('\n\n');
      const historicalExample = sections.find(section => 
        section.toLowerCase().includes('example from quran') || 
        section.toLowerCase().includes('historical example')
      );
      return historicalExample || '';
    } catch (error) {
      console.error('Error parsing historical example:', error);
      return '';
    }
  }

  getLearningPoints(): string {
    if (!this.aiInsights || typeof this.aiInsights !== 'string') return '';
    try {
      const sections = this.aiInsights.split('\n\n');
      const learningSection = sections.find(section => 
        section.toLowerCase().includes('this example teaches') ||
        section.toLowerCase().includes('learning from')
      );
      return learningSection || '';
    } catch (error) {
      console.error('Error parsing learning points:', error);
      return '';
    }
  }
} 