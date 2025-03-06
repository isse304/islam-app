import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DuaService, Dua, DuaCategory } from '../../services/dua.service';
import { Subscription, timer } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';

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

  constructor(
    private duaService: DuaService,
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
    if (!this.feeling.trim()) {
      this.clearEmotionSearch();
      return;
    }

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

  onDuaSelect(dua: Dua) {
    this.selectedDua = dua;
  }
} 