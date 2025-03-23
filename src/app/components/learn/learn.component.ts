import { Component, OnInit, OnDestroy } from '@angular/core';
import { QuranService } from '../../services/quran.service';
import { SubscriptionService } from '../../services/subscription.service';
import { AuthStateService } from '../../services/auth-state.service';
import { Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface SurahData {
  numberOfAyahs: number;
}

interface AIResponse {
  response: string;
}

@Component({
  selector: 'app-learn',
  templateUrl: './learn.component.html',
  styleUrls: ['./learn.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatIconModule
  ]
})
export class LearnComponent implements OnInit, OnDestroy {
  selectedSurah: number = 1;
  selectedVerse: number = 1;
  isLoading: boolean = false;
  currentVerse: string = '';
  translation: string = '';
  messages: Message[] = [];
  userQuestion: string = '';
  selectedTafsir: 'ibn-kathir' | 'tabari' | 'maududi' = 'ibn-kathir';
  surahs: any[] = [];
  verseCounts: number = 1;
  aiSummary: string = '';
  private readonly LEARN_STATE_KEY = 'learn_quran_state';
  private readonly AUTH_CHECK_INTERVAL = 30000; // 30 seconds
  private authCheckInterval: any;

  constructor(
    private quranService: QuranService,
    private subscriptionService: SubscriptionService,
    public authStateService: AuthStateService,
    public router: Router
  ) {}

  async ngOnInit() {
    // Restore state from localStorage
    this.restoreState();
    
    // Setup auth check interval to ensure premium status is maintained
    this.setupAuthCheck();
    
    await this.checkPremiumStatus();
    this.loadSurahs();
  }

  ngOnDestroy() {
    // Save state before leaving
    this.saveState();
    
    // Clear interval
    if (this.authCheckInterval) {
      clearInterval(this.authCheckInterval);
    }
  }

  private setupAuthCheck() {
    // Check premium status periodically
    this.authCheckInterval = setInterval(() => {
      this.checkPremiumStatus();
    }, this.AUTH_CHECK_INTERVAL);
  }

  private async checkPremiumStatus() {
    const isPremium = await firstValueFrom(this.authStateService.isPremiumUser$);
    if (!isPremium) {
      this.subscriptionService.showSubscriptionPage('Learn Feature');
      return false;
    }
    return true;
  }

  private saveState() {
    const state = {
      selectedSurah: this.selectedSurah,
      selectedVerse: this.selectedVerse,
      selectedTafsir: this.selectedTafsir
    };
    localStorage.setItem(this.LEARN_STATE_KEY, JSON.stringify(state));
  }

  private restoreState() {
    try {
      const savedState = localStorage.getItem(this.LEARN_STATE_KEY);
      if (savedState) {
        const state = JSON.parse(savedState);
        this.selectedSurah = state.selectedSurah || 1;
        this.selectedVerse = state.selectedVerse || 1;
        this.selectedTafsir = state.selectedTafsir || 'ibn-kathir';
      }
    } catch (error) {
      console.error('Error restoring Learn state:', error);
    }
  }

  async loadSurahs() {
    this.surahs = await firstValueFrom(this.quranService.getSurahs());
    this.updateVerseCount();
  }

  async updateVerseCount() {
    const surahData = await firstValueFrom(this.quranService.getVerseCount(this.selectedSurah)) as SurahData;
    this.verseCounts = surahData.numberOfAyahs;
    
    // Make sure selectedVerse is not greater than verse count
    if (this.selectedVerse > this.verseCounts) {
      this.selectedVerse = 1;
    }
    
    this.loadVerse();
    
    // Save state after update
    this.saveState();
  }

  async loadVerse() {
    this.isLoading = true;
    try {
      const verseData = await firstValueFrom(this.quranService.getVerse(this.selectedSurah, this.selectedVerse));
      this.currentVerse = verseData.text;
      this.translation = verseData.translation;
      await this.getAISummary();
      
      // Save state after loading new verse
      this.saveState();
    } catch (error) {
      console.error('Error loading verse:', error);
    }
    this.isLoading = false;
  }

  async getAISummary() {
    if (!await this.checkPremiumStatus()) {
      this.aiSummary = 'Premium feature unavailable. Please subscribe to access.';
      return;
    }
    
    try {
      this.aiSummary = 'Generating summary...';
      const response = await firstValueFrom(this.quranService.getVerseSummary(
        this.selectedSurah,
        this.selectedVerse
      ));
      
      if (response && typeof response === 'object' && 'response' in response) {
        this.aiSummary = (response as AIResponse).response;
      } else if (typeof response === 'string') {
        this.aiSummary = response;
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Error getting AI summary:', error);
      this.aiSummary = 'Failed to generate summary. Please try refreshing the page.';
    }
  }

  async sendQuestion() {
    if (!this.userQuestion.trim()) return;
    
    if (!await this.checkPremiumStatus()) {
      this.messages.push({
        role: 'assistant',
        content: 'Premium feature unavailable. Please subscribe to access AI Tafsir Chat.',
        timestamp: new Date()
      });
      return;
    }

    // Add user message
    this.messages.push({
      role: 'user',
      content: this.userQuestion,
      timestamp: new Date()
    });

    const question = this.userQuestion;
    this.userQuestion = ''; // Clear input
    this.isLoading = true;

    try {
      // Get AI response based on selected Tafsir
      const response = await firstValueFrom(this.quranService.getTafsirExplanation(
        this.selectedSurah,
        this.selectedVerse,
        question,
        this.selectedTafsir
      ));

      this.messages.push({
        role: 'assistant',
        content: response || 'I apologize, but I am unable to generate a response at this time. Please try again later.',
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error getting AI response:', error);
      this.messages.push({
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try asking your question again.',
        timestamp: new Date()
      });
    }
    this.isLoading = false;
  }

  onTafsirChange() {
    // Optionally refresh the explanation when Tafsir source changes
    this.loadVerse();
  }

  // toggleSheikhMode() {
  //   this.textToSpeech.toggleSheikhMode();
  // }
} 