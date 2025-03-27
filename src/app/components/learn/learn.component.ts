import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
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
import { MatTooltipModule } from '@angular/material/tooltip';
import { TafsirDatabaseService, TafsirEntry } from '../../services/tafsir-database.service';
import { MarkdownPipe } from '../../pipes/markdown.pipe';

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
    MatIconModule,
    MatTooltipModule,
    MarkdownPipe
  ],
  host: {
    '(document:keydown)': 'handleKeyboardNavigation($event)'
  }
})
export class LearnComponent implements OnInit, OnDestroy {
  @ViewChild('chatContainer') private chatContainer!: ElementRef;
  selectedSurah: number = 1;
  selectedVerse: number = 1;
  isLoading: boolean = false;
  currentVerse: string = '';
  translation: string = '';
  messages: Message[] = [];
  userQuestion: string = '';
  selectedTafsir: 'ibn-kathir' | 'tabari' = 'ibn-kathir';
  surahs: any[] = [];
  verseCounts: number = 1;
  aiSummary: string = '';
  tafsirEntries: TafsirEntry[] = [];
  private readonly LEARN_STATE_KEY = 'learn_quran_state';
  private readonly AUTH_CHECK_INTERVAL = 30000; // 30 seconds
  private authCheckInterval: any;
  private lastSurahVerse: string = '';
  private isFirstResponse: boolean = true;

  // Add a getter for verse numbers array
  get verseNumbers(): number[] {
    return Array.from({ length: this.verseCounts }, (_, i) => i + 1);
  }

  constructor(
    private quranService: QuranService,
    private subscriptionService: SubscriptionService,
    public authStateService: AuthStateService,
    private tafsirDatabaseService: TafsirDatabaseService,
    public router: Router
  ) {}

  async ngOnInit() {
    try {
      // First restore state from localStorage
      this.restoreState();
      
      // Then load surahs
      await firstValueFrom(this.quranService.getSurahList()).then(surahs => {
        this.surahs = surahs;
      });
      
      // Setup auth check interval
      this.setupAuthCheck();
      
      // Update verse count without resetting verse number
      await this.updateVerseCount(false);
      
      // Load the verse with current state
      await this.loadVerse();
      
      await this.checkPremiumStatus();
    } catch (error) {
      console.error('Error in ngOnInit:', error);
    }
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
    try {
      const state = {
        selectedSurah: this.selectedSurah,
        selectedVerse: this.selectedVerse,
        selectedTafsir: this.selectedTafsir,
        messages: this.messages,
        lastUpdated: new Date().toISOString()
      };
      localStorage.setItem(this.LEARN_STATE_KEY, JSON.stringify(state));
      console.log('State saved:', state);
    } catch (error) {
      console.error('Error saving state:', error);
    }
  }

  private restoreState() {
    try {
      const savedState = localStorage.getItem(this.LEARN_STATE_KEY);
      if (savedState) {
        const state = JSON.parse(savedState);
        // Only set default values if no saved state exists
        this.selectedSurah = state.selectedSurah ?? 1;
        this.selectedVerse = state.selectedVerse ?? 1;
        this.selectedTafsir = state.selectedTafsir ?? 'ibn-kathir';
        
        if (state.messages) {
          this.messages = state.messages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }));
        }

        console.log('State restored:', {
          surah: this.selectedSurah,
          verse: this.selectedVerse,
          messageCount: this.messages.length,
          lastUpdated: state.lastUpdated
        });
      }
    } catch (error) {
      console.error('Error restoring state:', error);
      // Only set defaults if restoration fails
      this.selectedSurah = 1;
      this.selectedVerse = 1;
      this.selectedTafsir = 'ibn-kathir';
      this.messages = [];
    }
  }

  async loadSurahs() {
    try {
      this.surahs = await firstValueFrom(this.quranService.getSurahs());
      await this.updateVerseCount();
    } catch (error) {
      console.error('Error loading surahs:', error);
    }
  }

  async updateVerseCount(resetVerse: boolean = true) {
    try {
      const surahData = await firstValueFrom(this.quranService.getVerseCount(this.selectedSurah));
      this.verseCounts = surahData.numberOfAyahs;
      
      // Only reset to verse 1 if explicitly requested
      if (resetVerse) {
        this.selectedVerse = 1;
      }
      
      // Ensure selected verse is within bounds
      if (this.selectedVerse > this.verseCounts) {
        this.selectedVerse = this.verseCounts;
      }
      
      await this.loadVerse();
      this.saveState();
    } catch (error) {
      console.error('Error updating verse count:', error);
    }
  }

  async loadVerse() {
    this.isLoading = true;
    try {
      const verseData = await firstValueFrom(this.quranService.getVerse(this.selectedSurah, this.selectedVerse));
      
      // Reset isFirstResponse when loading a new verse
      const currentVerse = `${this.selectedSurah}:${this.selectedVerse}`;
      if (this.lastSurahVerse !== currentVerse) {
        this.isFirstResponse = true;
        this.lastSurahVerse = currentVerse;
      }
      
      // Handle Bismillah for first verses
      if (this.selectedVerse === 1) {
        if (this.selectedSurah === 1 || this.selectedSurah === 9) {
          // For Al-Fatiha (1) and At-Tawbah (9), show verse as is
          this.currentVerse = verseData.text;
        } else {
          // For other surahs, remove Bismillah from first verse
          this.currentVerse = verseData.text.replace(/^بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ/, '').trim();
        }
      } else {
        // For non-first verses, show as is
        this.currentVerse = verseData.text;
      }
      
      this.translation = verseData.translation;
      
      // Load tafsir entries from all sources
      const tafsirEntries = await firstValueFrom(
        this.tafsirDatabaseService.getTafsirEntries(this.selectedSurah, this.selectedVerse)
      );
      this.tafsirEntries = tafsirEntries;
      
      await this.getAISummary();
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

  private scrollToBottom(): void {
    try {
      setTimeout(() => {
        if (this.chatContainer) {
          this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
        }
      }, 100); // Small delay to ensure content is rendered
    } catch (err) {
      console.error('Error scrolling to bottom:', err);
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
    this.scrollToBottom();

    const question = this.userQuestion;
    this.userQuestion = ''; // Clear input
    this.isLoading = true;

    try {
      // Check if it's just a pleasantry
      const pleasantries = ['thank you', 'thanks', 'ok', 'okay', 'got it', 'understood', 'jazakallah', 'jazak allah', 'mashallah', 'masha allah', 'alhamdulillah'];
      if (pleasantries.some(p => question.toLowerCase().includes(p))) {
        this.messages.push({
          role: 'assistant',
          content: '🌟 Alhamdulillah! You\'re welcome, dear seeker of knowledge. Feel free to ask any other questions about this verse. May Allah increase us in beneficial knowledge.',
          timestamp: new Date()
        });
        this.isLoading = false;
        this.saveState();
        return;
      }

      // Get tafsir entries first to ensure we have the context
      const tafsirEntries = await firstValueFrom(
        this.tafsirDatabaseService.getTafsirEntries(this.selectedSurah, this.selectedVerse)
      );
      this.tafsirEntries = tafsirEntries;

      // Check if we've switched to a new verse
      const currentVerse = `${this.selectedSurah}:${this.selectedVerse}`;
      if (this.lastSurahVerse !== currentVerse) {
        this.isFirstResponse = true;
        this.lastSurahVerse = currentVerse;
      }

      // Get AI response based on tafsir database content
      const response = await firstValueFrom(this.quranService.getTafsirExplanation(
        this.selectedSurah,
        this.selectedVerse,
        question,
        this.selectedTafsir,
        this.isFirstResponse
      ));

      // Add surah and verse information to the response
      const surahName = this.surahs.find(s => s.number === this.selectedSurah)?.englishName || '';
      const verseInfo = `<div class="verse-header bg-[#B7A57A15] p-3 rounded-lg mb-4 border-l-4 border-[#B7A57A]">
        <span class="text-[#B7A57A] font-semibold">📖 Surah ${this.selectedSurah}. ${surahName}</span>
        <span class="text-gray-500"> • </span>
        <span class="text-[#B7A57A] font-semibold">Verse ${this.selectedVerse}</span>
      </div>\n\n`;
      
      // Check if the question is unrelated to Quran or inappropriate
      const unrelatedKeywords = ['music', 'movies', 'games', 'sports', 'politics', 'celebrities'];
      const inappropriateKeywords = ['dating', 'boyfriend', 'girlfriend', 'party', 'dance'];
      
      if (unrelatedKeywords.some(keyword => question.toLowerCase().includes(keyword))) {
        this.messages.push({
          role: 'assistant',
          content: verseInfo + '🤲 Dear seeker of knowledge, I am a dedicated Quran learning assistant. I can only answer questions related to the Quran, its verses, and Islamic teachings. Please ask me about this verse or other Quranic topics, and I will be happy to help you understand them better.',
          timestamp: new Date()
        });
      } else if (inappropriateKeywords.some(keyword => question.toLowerCase().includes(keyword))) {
        this.messages.push({
          role: 'assistant',
          content: verseInfo + '🤲 As your Muslim scholar assistant, I must remind you to maintain appropriate Islamic etiquette in our discussions. Let\'s focus on understanding the Quran and its teachings. How may I help you understand this verse better?',
          timestamp: new Date()
        });
      } else {
        this.messages.push({
          role: 'assistant',
          content: verseInfo + (response || 'Astaghfirullah, I am unable to generate a response at this time. Please try again later.'),
          timestamp: new Date()
        });
      }

      // Set first response flag to false after responding
      if (this.isFirstResponse) {
        this.isFirstResponse = false;
      }
    } catch (error) {
      console.error('Error getting AI response:', error);
      this.messages.push({
        role: 'assistant',
        content: 'Astaghfirullah, I encountered an error. Please try asking your question again.',
        timestamp: new Date()
      });
    }
    this.isLoading = false;
    this.saveState();
  }

  private formatTafsirSources(): string {
    return this.tafsirEntries.map(entry => 
      `[${entry.source}]:\n${entry.content}\n\n`
    ).join('\n');
  }

  onTafsirChange() {
    // Update the selected tafsir in the QuranService
    this.quranService.setSelectedTafsir(this.selectedTafsir);
    // Reload the verse to get updated summary
    this.loadVerse();
  }

  // toggleSheikhMode() {
  //   this.textToSpeech.toggleSheikhMode();
  // }

  // Add new methods for navigation
  async previousVerse() {
    if (this.selectedVerse > 1) {
      this.selectedVerse--;
      await this.loadVerse();
    } else if (this.selectedSurah > 1) {
      this.selectedSurah--;
      await this.updateVerseCount(false);
      this.selectedVerse = this.verseCounts;
      await this.loadVerse();
    }
    this.saveState();
  }

  async nextVerse() {
    if (this.selectedVerse < this.verseCounts) {
      this.selectedVerse++;
      await this.loadVerse();
    } else if (this.selectedSurah < 114) {
      this.selectedSurah++;
      await this.updateVerseCount(false);
      this.selectedVerse = 1;
      await this.loadVerse();
    }
    this.saveState();
  }

  // Add method to clear chat
  clearChat() {
    this.messages = [];
    this.saveState();
  }

  clearCache() {
    this.quranService.clearCache();
    this.messages = [];
    this.loadVerse();
    this.saveState();
  }

  // Add keyboard navigation handler
  handleKeyboardNavigation(event: KeyboardEvent) {
    // Only handle navigation when not typing in an input
    if (event.target instanceof HTMLInputElement || 
        event.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        this.previousVerse();
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.nextVerse();
        break;
    }
  }
} 