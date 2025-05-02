import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, ViewEncapsulation, ChangeDetectionStrategy, HostListener, HostBinding, ApplicationRef } from '@angular/core';
import { QuranService } from '../../services/quran.service';
import { SubscriptionService } from '../../services/subscription.service';
import { Router, RouterModule } from '@angular/router';
import { firstValueFrom, Subscription, switchMap, tap, catchError, of, take, from, Observable, Subject, throwError, forkJoin } from 'rxjs';
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
import { FirebaseAuthService, AppUser } from '../../services/firebase-auth.service';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Title, Meta } from '@angular/platform-browser';
import { environment } from '../../../environments/environment';
import { ThemeService, Theme } from '../../services/theme.service';
import { map, takeUntil, finalize } from 'rxjs/operators';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { ToastService } from '../../services/toast.service';


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

interface TafsirChatResponse {
  success: boolean;
  content?: string;
  error?: string;
  source?: string;
  sources?: any[]; 
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
  encapsulation: ViewEncapsulation.None,
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
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
  @ViewChild('verseDisplayContainer') private verseDisplayContainer!: ElementRef;
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
  initialPremiumCheckComplete: boolean = false; // Flag for initial check
  isPremium: boolean = false; // Store premium status
  currentTheme$: Observable<string>; // Changed Theme to string
  private destroy$ = new Subject<void>();

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
    private http: HttpClient,
    public router: Router,
    private cdr: ChangeDetectorRef,
    private titleService: Title,
    private metaService: Meta,
    public themeService: ThemeService,
    private toastService: ToastService,
    private elementRef: ElementRef,
    private appRef: ApplicationRef
  ) {
    this.currentTheme$ = this.themeService.currentTheme$;
  }

  async ngOnInit(): Promise<void> {
    this.titleService.setTitle('Learn Quran & AI Tafsir Chat | Nura AI');
    this.metaService.addTags([
      { name: 'description', content: 'Learn Quran interactively. Select Surah/Verse, view translation, and chat with Nura AI for Tafsir explanations from Ibn Kathir or Tabari.' },
      { name: 'keywords', content: 'learn quran, tafsir, quran explanation, ibn kathir, tabari, ai tafsir, quran chat, islamic learning' }
    ]);

    this.initialPremiumCheckComplete = false;
    this.isLoading = true;
    this.cdr.markForCheck(); // Initial mark for check
    // Restore state synchronously first
    this.restoreState();
    this.cdr.detectChanges(); // Manually trigger change detection after restoring state

    // Use RxJS chain for initialization
    this.initSubscription = this.quranService.surahs$.pipe(
      take(1), // Ensure we get the first populated list
      tap(surahs => {
        this.surahs = surahs; // Assign the loaded surahs to the component property
      }),
      switchMap(() => from(this.updateVerseCount(false))),
      // Perform the initial premium check
      switchMap(() => from(this.checkPremiumStatus()))
    ).subscribe({
      next: (isPremiumResult) => {
        this.isPremium = isPremiumResult; // Store the result
        this.initialPremiumCheckComplete = true; // Mark initial check as done
        this.cdr.detectChanges();
        this.isLoading = false; // Stop loading AFTER checks
        if (this.isPremium) {
             this.setupAuthCheck(); // Only setup periodic check if initially premium
        }
      },
      error: (error) => {
        console.error('Error during LearnComponent initialization:', error);
        this.initialPremiumCheckComplete = true; // Still mark as complete even on error
        this.cdr.detectChanges();
        this.isLoading = false; // Ensure loading stops on error
        // Handle initialization error (e.g., show error message)
      }
    });

    // Force change detection AND trigger reflow after initialization
    setTimeout(() => {
      try {
        // Use the ViewChild if available, otherwise querySelector
        const containerElement = this.verseDisplayContainer?.nativeElement ?? 
                                 this.elementRef.nativeElement.querySelector('.hidden.lg\:block.rounded-xl'); // Find the specific container
        if (containerElement) {
          // Reading offsetHeight forces the browser to recalculate layout
          const _ = containerElement.offsetHeight;
          console.log('[LearnComponent] Triggered reflow for verse container.');
        }
      } catch (e) {
        console.error('[LearnComponent] Error triggering reflow:', e);
      }
      this.cdr.markForCheck(); // Mark for check after triggering reflow
    }, 50); // Increased timeout slightly 

    // Subscribe to theme changes
    this.themeService.currentTheme$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        // console.log('[LearnComponent] Theme changed, marking for check');
        this.cdr.markForCheck(); // Mark for check on theme changes
      });

    // Force application tick after initialization is likely complete
    setTimeout(() => {
      console.log('[LearnComponent OnInit] Forcing appRef.tick()');
      this.appRef.tick(); 
    }, 100); 
    
    this.isLoading = false;
    this.cdr.markForCheck(); // Final mark for check
  }

  ngOnDestroy() {
    this.saveState();
    if (this.authCheckInterval) {
      clearInterval(this.authCheckInterval);
    }
    // Unsubscribe from the initialization subscription
    this.initSubscription?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupAuthCheck() {
    // Check premium status periodically
    // Only run if the component should be active (i.e., user is premium)
    if (!this.isPremium) return; // Extra safety check
    this.authCheckInterval = setInterval(async () => {
      const stillPremium = await this.firebaseAuthService.isPremiumUser();
      if (!stillPremium && this.isPremium) {
         // If status changed from premium to non-premium while using
         this.isPremium = false;
         this.subscriptionService.showSubscriptionPage('Learn Feature');
         clearInterval(this.authCheckInterval); // Stop checking
      }
      this.isPremium = stillPremium; // Update status
    }, this.AUTH_CHECK_INTERVAL);
  }

  private async checkPremiumStatus(): Promise<boolean> { // Return boolean
    const isPremiumCheck = await this.firebaseAuthService.isPremiumUser();
    this.isPremium = isPremiumCheck; // Update local state
    // REMOVED: Don't redirect from within the component during init.
    // The premiumGuard handles route access.
    // if (!isPremiumCheck) {
    //   this.subscriptionService.showSubscriptionPage('Learn Feature');
    //   return false;
    // }
    return isPremiumCheck; // Simply return the status
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
    this.cdr.markForCheck();
    let verseData: any = null; // To store verse data if successful

    // --- Step 1: Try fetching essential verse data --- 
    try {
      verseData = await firstValueFrom(this.quranService.getVerse(this.selectedSurah, this.selectedVerse));
      
      // Handle Bismillah logic and update component properties
      const currentVerseRef = `${this.selectedSurah}:${this.selectedVerse}`;
      if (this.lastSurahVerse !== currentVerseRef) {
        this.isFirstResponse = true;
        this.lastSurahVerse = currentVerseRef;
        this.saveState(); 
        this.firebaseAuthService.saveReadingHistory({ type: 'verse', surah: this.selectedSurah, verse: this.selectedVerse })
          .catch(err => console.warn('Failed to save reading history to backend:', err));
      }
      
      if (this.selectedVerse === 1 && this.selectedSurah !== 1 && this.selectedSurah !== 9) {
        this.currentVerse = verseData.text.replace(/^بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ/, '').trim();
      } else {
        this.currentVerse = verseData.text;
      }
      this.translation = verseData.translation;

    } catch (error) {
      // --- Catch block ONLY for essential verse data failure --- 
      console.error(`Error loading essential verse data for ${this.selectedSurah}:${this.selectedVerse}:`, error);
      this.currentVerse = 'Error'; // Indicate error visually
      this.translation = 'Could not load verse content.';
      this.messages.push({
         role: 'assistant',
         content: 'Error loading verse data. Please try again or select a different verse.', 
         timestamp: new Date(),
         type: 'error'
      });
      // Set loading false and exit early if essential data fails
      this.isLoading = false;
      this.cdr.markForCheck();
      this.scrollToLatestMessage();
      return; // Stop further processing
    }

    // --- Step 2: Try fetching Tafsir data (only if verse data loaded) ---
    if (verseData) { // Proceed only if verseData was successfully fetched
        try {
            const tafsirEntries = await firstValueFrom(
                this.tafsirDatabaseService.getTafsirEntries(this.selectedSurah, this.selectedVerse)
            );
            this.tafsirEntries = tafsirEntries;
        } catch (tafsirError) {
            // --- Catch block ONLY for Tafsir data failure --- 
            console.warn(`Warning: Failed to load Tafsir entries for ${this.selectedSurah}:${this.selectedVerse}:`, tafsirError);
            this.tafsirEntries = []; // Clear any previous tafsir
            // Optionally, add a non-blocking warning message if desired
            // this.messages.push({ role: 'assistant', content: 'Could not load Tafsir details for this verse.', timestamp: new Date(), type: 'warning' });
        }
    }

    // --- Final steps (always run if essential data loaded) --- 
    this.isLoading = false;
    this.cdr.markForCheck();
    this.scrollToLatestMessage();
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

  private scrollToLatestMessage(role: 'user' | 'assistant' = 'assistant'): void { 
    try {
      setTimeout(() => {
        if (this.chatContainer) {
          const messages = this.chatContainer.nativeElement.querySelectorAll('.flex.flex-col');
          if (messages.length > 0) {
            // Find the last message, prioritizing assistant messages if specified
            let targetMessageIndex = messages.length - 1;
            if (role === 'assistant') {
              // Search backwards for the last assistant message
              for (let i = messages.length - 1; i >= 0; i--) {
                // Check the class of the inner div to determine role
                const innerDiv = messages[i].querySelector('div > div'); // Get the div holding the ngClass
                if (innerDiv && innerDiv.classList.contains('mr-auto')) { // 'mr-auto' indicates assistant
                  targetMessageIndex = i;
                  break;
                }
              }
            }
            const lastMessageElement = messages[targetMessageIndex];
            if (lastMessageElement) {
              lastMessageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        }
      }, 150); // Increased delay slightly to ensure rendering
    } catch (err) {
      console.error('Error scrolling to latest message:', err);
    }
  }

  async sendQuestion() {
    if (!this.userQuestion.trim() || this.isLoading) {
      return; // Don't send empty questions or if already loading
    }

    this.isLoading = true; // START loading
    const questionToSend = this.userQuestion;

    // Add user message immediately
    this.messages.push({
      role: 'user',
      content: questionToSend,
      timestamp: new Date(),
      type: 'conversation'
    });
    this.userQuestion = ''; // Clear input
    this.scrollToLatestMessage('user'); // Scroll user message into view
    this.cdr.detectChanges(); // Update UI to show user message & loading spinner

    try {
      // Determine if context (surah/verse) should be sent based on the question
      const cleanedQuestion = questionToSend.toLowerCase().trim();
      const greetings = ['hi', 'hello', 'salam', 'assalamu alaikum', 'wa alaikum assalam', 'thank you', 'thanks', 'shukran'];
      const capabilityQueries = ['what can you do', 'how do you work', 'what are your functions', 'capabilities'];
      
      // Consider it general if it's a greeting, a capability query, or very short
      const isGeneralQuery = greetings.some(g => cleanedQuestion.startsWith(g)) ||
                             capabilityQueries.some(q => cleanedQuestion.includes(q)) || // Add capability check
                             cleanedQuestion.length < 5;

      // Construct payload conditionally
      const payload: any = {
        question: questionToSend,
        selectedTafsir: this.selectedTafsir,
        // Only include surah/verse if it's NOT determined to be a general query
        ...( !isGeneralQuery && { surah: this.selectedSurah, verse: this.selectedVerse } )
      };
      // console.log('[LearnComponent] Sending payload:', payload); // Log the payload being sent

      // Call the backend API service directly using HttpClient
      // Ensure the correct API base URL is used so the interceptor adds the token
      const response = await firstValueFrom(this.http.post<TafsirChatResponse>(`${environment.apiUrl}/api/tafsir/chat`, payload).pipe(
         catchError((error: any) => {
           console.error('Error calling /api/tafsir/chat:', error);
           // Return a fallback error response compatible with TafsirChatResponse interface
           return of({ 
             success: false, 
             error: error?.error?.details || error?.message || 'Failed to communicate with the chat service.', // Try to get backend error detail
             content: '' 
           } as TafsirChatResponse);
         })
      ));

      // --- SUCCESS CASE --- 
      // isFirstResponse is handled by backend now

      if (response.success && response.content) {
        this.messages.push({
          role: 'assistant',
          content: response.content,
          timestamp: new Date(),
          type: response.source === 'tafsir_sources' ? 'tafsir' : 'conversation' // Use source from backend
        });
        this.saveState();
      } else {
        // Handle cases where the API call succeeded but returned no content or success:false
        console.warn('API call successful but response indicates failure or no content:', response);
        this.messages.push({
          role: 'assistant',
          content: response.error || 'Sorry, I received an unexpected response. Please try again.',
          timestamp: new Date(),
          type: 'error'
        });
      }
      // --- END SUCCESS CASE --- 

    } catch (error: any) { // Catch as any for easier property access
       // --- ERROR CASE --- 
      console.error('Error sending question to API:', error);
      let errorMessage = 'Sorry, an error occurred while processing your request. Please try again later.';
      if (error && typeof error === 'object' && 'status' in error) {
          if ((error as any).status === 429) {
              errorMessage = 'You have exceeded the daily AI request limit. Please try again tomorrow or upgrade your plan.';
          } else if ((error as any).status === 401 || (error as any).status === 403) {
              errorMessage = 'Authentication error. Please ensure you are logged in and have premium access.';
          }
      }
      this.messages.push({
        role: 'assistant',
        content: errorMessage,
        timestamp: new Date(),
        type: 'error'
      });
       // --- END ERROR CASE --- 
    } finally {
       // --- FINALLY BLOCK (executes on success OR error) --- 
      this.isLoading = false; // STOP loading
      this.scrollToLatestMessage('assistant'); // Scroll new assistant response/error into view
      this.cdr.detectChanges(); // Ensure UI updates after loading stops
      // --- END FINALLY BLOCK ---
    }
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