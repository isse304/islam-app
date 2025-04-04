import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { QuranService } from '../../services/quran.service';
import { SubscriptionService } from '../../services/subscription.service';
import { Router, RouterModule } from '@angular/router';
import { firstValueFrom, Subscription, switchMap, tap } from 'rxjs';
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
import { ApiService } from '../../services/api.service';
import { FirebaseAuthService } from '../../services/firebase-auth.service';
import { take, from } from 'rxjs';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  type?: 'tafsir' | 'conversation' | 'greeting' | 'error' | 'warning';
  context?: {
    surah?: number;
    verse?: number;
    topic?: string;
  };
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
  aiSummary: string = '';  // AI feature enabled
  tafsirEntries: TafsirEntry[] = [];
  private readonly LEARN_STATE_KEY = 'learn_quran_state';
  private readonly AUTH_CHECK_INTERVAL = 30000; // 30 seconds
  private authCheckInterval: any;
  private lastSurahVerse: string = '';
  private isFirstResponse: boolean = true;
  private initSubscription: Subscription | null = null; // Subscription for ngOnInit async ops

  private conversationContext: {
    lastTopic?: string;
    lastMessageType?: string;
    consecutiveGreetings: number;
    isDiscussingVerse: boolean;
  } = {
    consecutiveGreetings: 0,
    isDiscussingVerse: false
  };

  // Add a getter for verse numbers array
  get verseNumbers(): number[] {
    return Array.from({ length: this.verseCounts }, (_, i) => i + 1);
  }

  constructor(
    private quranService: QuranService,
    private subscriptionService: SubscriptionService,
    public firebaseAuthService: FirebaseAuthService,
    private tafsirDatabaseService: TafsirDatabaseService,
    private apiService: ApiService,
    public router: Router
  ) {}

  ngOnInit() {
    // Restore state synchronously first
    this.restoreState();

    // Use RxJS chain for initialization
    this.initSubscription = this.quranService.surahs$.pipe(
      take(1), // Ensure we get the first populated list
      tap(surahs => {
        this.surahs = surahs; // Assign the loaded surahs to the component property
        // console.log('[LearnComponent] Surah list loaded via surahs$.');
      }),
      // After surah list is confirmed loaded, proceed
      switchMap(() => {
        // console.log('[LearnComponent] Proceeding to updateVerseCount.');
        // Wrap updateVerseCount in a promise-like structure if needed, or handle its async nature
        // Since updateVerseCount is async, we convert its promise back to an observable
        return from(this.updateVerseCount(false));
      }),
      // Potentially chain other async operations needed after verse count update
      // switchMap(() => from(this.loadVerse())), // loadVerse is called within updateVerseCount
      switchMap(() => from(this.checkPremiumStatus()))
    ).subscribe({
      next: () => {
        // console.log('[LearnComponent] Initialization sequence complete.');
        // Setup auth check interval after main init is done
        this.setupAuthCheck();
      },
      error: (error) => {
        console.error('Error during LearnComponent initialization:', error);
        // Handle initialization error (e.g., show error message)
        this.isLoading = false; // Ensure loading stops on error
      }
    });
  }

  ngOnDestroy() {
    this.saveState();
    if (this.authCheckInterval) {
      clearInterval(this.authCheckInterval);
    }
    // Unsubscribe from the initialization subscription
    this.initSubscription?.unsubscribe();
  }

  private setupAuthCheck() {
    // Check premium status periodically
    this.authCheckInterval = setInterval(() => {
      this.checkPremiumStatus();
    }, this.AUTH_CHECK_INTERVAL);
  }

  private async checkPremiumStatus() {
    const isPremium = await this.firebaseAuthService.isPremiumUser();
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
      // Added logging
      // console.log('[LearnComponent] State saved:', { 
      //   surah: state.selectedSurah, 
      //   verse: state.selectedVerse, 
      //   ts: state.lastUpdated 
      // });
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

        // Added logging
        // console.log('[LearnComponent] State restored:', {
        //   surah: this.selectedSurah,
        //   verse: this.selectedVerse,
        //   messageCount: this.messages.length,
        //   lastUpdated: state.lastUpdated
        // });
      } else {
         // Added logging for no state found case
         // console.log('[LearnComponent] No saved state found in localStorage.');
         // Set defaults if no state found
         this.selectedSurah = 1;
         this.selectedVerse = 1;
         this.selectedTafsir = 'ibn-kathir';
         this.messages = [];
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
    // console.log(`[LearnComponent] updateVerseCount called for Surah ${this.selectedSurah}`);
    this.isLoading = true; // Set loading true at the start
    try {
      // getVerseCount now correctly waits for the surahs$ observable
      const surahData = await firstValueFrom(this.quranService.getVerseCount(this.selectedSurah));
      // console.log(`[LearnComponent] Received verse count: ${surahData.numberOfAyahs} for Surah ${this.selectedSurah}`);
      this.verseCounts = surahData.numberOfAyahs;

      if (resetVerse) {
        this.selectedVerse = 1;
      }
      // Ensure selectedVerse is valid after potential surah change or count update
      if (this.selectedVerse < 1 || this.selectedVerse > this.verseCounts) {
        this.selectedVerse = this.verseCounts > 0 ? 1 : 1; // Default to 1 if count changes make it invalid
      }

      // Crucially, call loadVerse AFTER verse count is confirmed and verse number adjusted
      await this.loadVerse(); 
      // Save state AFTER verse is potentially adjusted and loaded by loadVerse
      // saveState() is now called within loadVerse when the verse reference changes
      // this.saveState(); // Removed from here
    } catch (error) {
      console.error(`Error updating verse count for Surah ${this.selectedSurah}:`, error);
      // Handle error appropriately, maybe show a message to the user
    } finally {
        this.isLoading = false; // Ensure loading is false
    }
  }

  async loadVerse() {
    // console.log(`[LearnComponent] loadVerse called for ${this.selectedSurah}:${this.selectedVerse}`);
    this.isLoading = true;
    try {
      // Fetch verse data first
      const verseData = await firstValueFrom(this.quranService.getVerse(this.selectedSurah, this.selectedVerse));
      
      // Reset isFirstResponse flag if the verse actually changed
      const currentVerseRef = `${this.selectedSurah}:${this.selectedVerse}`;
      if (this.lastSurahVerse !== currentVerseRef) {
        this.isFirstResponse = true;
        this.lastSurahVerse = currentVerseRef;
        // Save state immediately after confirming a new verse is being processed
        this.saveState(); // Save to localStorage

        // Save history to backend (async, fire-and-forget for now)
        this.firebaseAuthService.saveReadingHistory({ 
          surah: this.selectedSurah, 
          verse: this.selectedVerse,
          timestamp: new Date().toISOString() // Add timestamp to satisfy interface
        }).catch(err => {
          console.warn('Failed to save reading history to backend:', err);
          // Optionally inform the user if saving fails consistently
        });

        // Added logging
        console.log(`[LearnComponent] Verse changed to ${currentVerseRef}, state saved locally and history save triggered.`);
      }
      
      // Handle Bismillah for first verses
      if (this.selectedVerse === 1) {
        if (this.selectedSurah === 1 || this.selectedSurah === 9) {
          // For Al-Fatiha (1) and At-Tawbah (9), show verse as is
          this.currentVerse = verseData.text;
        } else {
          // For other surahs, remove Bismillah from first verse
          this.currentVerse = verseData.text.replace(/^بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ/, '').trim();
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
      
      // Get AI summary for the verse
      await this.getAISummary(); // This might modify state indirectly (aiSummary)
      
      // Removed saveState() from the end of the try block

    } catch (error) {
      console.error(`Error loading verse ${this.selectedSurah}:${this.selectedVerse}:`, error);
      this.messages.push({
         role: 'assistant',
         content: 'Error loading verse data. Please try again or select a different verse.',
         timestamp: new Date(),
         type: 'error'
      });
    } finally {
      this.isLoading = false; // Ensure loading is false after completion or error
      this.scrollToBottom(); // Scroll after potential new messages (like errors)
    }
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
        timestamp: new Date(),
        type: 'error'
      });
      return;
    }

    // Add user message
    const userMessage: Message = {
      role: 'user',
      content: this.userQuestion,
      timestamp: new Date()
    };
    this.messages.push(userMessage);
    this.scrollToBottom();

    const question = this.userQuestion;
    this.userQuestion = ''; // Clear input
    this.isLoading = true;

    try {
      // Get current verse context
      const surahName = this.surahs.find(s => s.number === this.selectedSurah)?.englishName || '';
      
      // Detect message type with more specific patterns
      const isIslamicGreeting = /^(salam|assalamualaikum)/i.test(question.trim());
      const isGeneralGreeting = /^(hi|hello|hey)/i.test(question.trim());
      const isAboutCapabilities = /what.*(can|do).*you.*(do|help)|tell.*me.*(about|your).*(capabilities|features|help)/i.test(question.toLowerCase());
      const isPleasantry = /^(thanks?|thank you|that'?s? all|goodbye|bye|jazak|barak)/i.test(question.trim());
      
      // More specific Quranic question detection
      const isQuranQuestion = 
        question.toLowerCase().includes('verse') || 
        question.toLowerCase().includes('surah') || 
        question.toLowerCase().includes('ayah') ||
        question.toLowerCase().includes('quran') ||
        question.toLowerCase().includes('tafsir') ||
        /what.*(mean|about|refer|say|tell|explain|understand)/i.test(question) ||
        /meaning|interpretation|explanation|context|reason|why|how|when/i.test(question) ||
        /dream|story|event|people|prophet|revelation|theme|linguistic|arabic|word/i.test(question);

      let response: string;

      if (isIslamicGreeting || isGeneralGreeting || isAboutCapabilities || isPleasantry) {
        // Use general AI endpoint for greetings and pleasantries
        const prompt = {
          systemMessage: `You are a knowledgeable Islamic AI assistant focused on helping users understand the Quran through authentic tafsir. Follow these guidelines:

1. For greetings and pleasantries: 
   - For "salam" or "assalamualaikum": Respond with "🌟 Wa alaikum assalam wa rahmatullahi wa barakatuh! Would you like to learn more about this verse?"
   - For "hi", "hello", "hey": Respond with "🌟 As-salaam-alaikum! I can help you understand this verse better."
   - For "thanks" or "thank you": Respond with "You're welcome! Would you like to explore more about this verse or surah?"
   - For "goodbye" or "that's all": Respond with "May Allah increase us in knowledge. Feel free to return when you want to learn more about the Quran."

2. For questions about capabilities:
   Explain: "I can help you understand the Quran by:
   • Explaining verses using authentic tafsir from Ibn Kathir and Al-Tabari
   • Analyzing the linguistic aspects and context of verses
   • Discussing themes and lessons from surahs
   • Explaining the historical context and circumstances of revelation
   • Connecting verses with related ones in the Quran

   I'm currently focused on Surah ${this.selectedSurah}, Verse ${this.selectedVerse}. What would you like to know about it?"

3. For off-topic questions:
   Politely redirect to Quranic discussion: "Let me guide our discussion back to Surah ${this.selectedSurah}. Would you like to understand this verse better or learn about the themes of this surah?"`,
          userMessage: question,
          temperature: 0.7
        };

        const aiResponse = await this.apiService.generateAIResponse(prompt);
        response = aiResponse.content;
      } else {
        // Use tafsir endpoint for everything else - assume it's a Quranic question
        const verseContext = `CURRENT VERSE CONTEXT:
• You are discussing Surah ${this.selectedSurah}, Verse ${this.selectedVerse}
• This is the specific verse being discussed, not any other verse
• Do not mix this verse with other verses unless explicitly comparing them
• If asked about linguistics, themes, or interpretation, focus only on THIS verse
• If you need to reference other verses, clearly mark them as references

VERSE TEXT:
${this.currentVerse}

TRANSLATION:
${this.translation}`;

        const tafsirResponse = await firstValueFrom(this.quranService.getTafsirExplanation(
          this.selectedSurah,
          this.selectedVerse,
          `${verseContext}\n\nUser Question: ${question}`,
          this.selectedTafsir,
          false
        ));
        
        // Format the tafsir response with proper markdown
        const formattedTafsirResponse = `## Surah ${this.selectedSurah}. ${surahName} • Verse ${this.selectedVerse}

${tafsirResponse}`;

        response = formattedTafsirResponse;
      }

      // Format response based on type
      let formattedResponse = response || 'Astaghfirullah, I am unable to generate a response at this time. Please try again later.';

      // Add response message
      this.messages.push({
        role: 'assistant',
        content: formattedResponse,
        timestamp: new Date(),
        type: isIslamicGreeting || isGeneralGreeting ? 'greeting' : isAboutCapabilities ? 'conversation' : isQuranQuestion ? 'tafsir' : 'conversation'
      });

    } catch (error) {
      console.error('Error in chat:', error);
      this.messages.push({
        role: 'assistant',
        content: 'Astaghfirullah, I encountered an error. Please try asking your question again.',
        timestamp: new Date(),
        type: 'error'
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
    // console.log(`[LearnComponent] Navigating to previous verse: ${this.selectedSurah}:${this.selectedVerse}`);
    if (this.selectedVerse > 1) {
      this.selectedVerse--;
      await this.loadVerse();
    } else if (this.selectedSurah > 1) {
      const targetSurah = this.selectedSurah - 1;
      // console.log(`[LearnComponent] Navigating to previous surah: ${targetSurah}`);
      const prevSurahData = await firstValueFrom(this.quranService.getVerseCount(targetSurah));
      this.selectedSurah--;
      this.selectedVerse = prevSurahData.numberOfAyahs;
      await this.loadVerse();
    } else {
      // console.log('[LearnComponent] Already at the first verse of the first surah.');
    }
  }

  async nextVerse() {
    // console.log(`[LearnComponent] Navigating to next verse: ${this.selectedSurah}:${this.selectedVerse}`);
    const currentSurahData = await firstValueFrom(this.quranService.getVerseCount(this.selectedSurah));
    if (this.selectedVerse < currentSurahData.numberOfAyahs) {
      this.selectedVerse++;
      await this.loadVerse();
    } else if (this.selectedSurah < 114) {
      // console.log(`[LearnComponent] Navigating to next surah: ${this.selectedSurah}:${this.selectedVerse}`);
      this.selectedSurah++;
      this.selectedVerse = 1;
      await this.loadVerse();
    } else {
      // console.log('[LearnComponent] Already at the last verse of the last surah.');
    }
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