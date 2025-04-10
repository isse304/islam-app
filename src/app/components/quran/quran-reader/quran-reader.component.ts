export {};

import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ViewChild, ElementRef, ChangeDetectorRef, Injector, NgZone, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { Observable, Subscription, Subject, of, forkJoin, from, throwError, timer, combineLatest, EMPTY, firstValueFrom } from 'rxjs';
import { catchError, map, switchMap, debounceTime, distinctUntilChanged, finalize, take, filter, tap, retry, takeUntil } from 'rxjs/operators';

// Angular Material Modules (Cleaned up duplicates)
import { MatSliderModule } from '@angular/material/slider';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';

// Removed ScrollingModule

import { QuranService, QuranVerse, Reciter, Surah, Juz, WordDetails } from '../../../services/quran.service';
import { SttService } from '../../../services/stt.service';
import { QuranFlashService } from '../../../services/quran-flash.service';
import { ToastService } from '../../../services/toast.service';
import { environment } from '../../../../environments/environment';
import { ClickOutsideDirective } from '../../../directives/click-outside.directive';
import { AppUser, FirebaseAuthService, UserPreferences, BookmarkResponse, ReadingHistoryResponse } from '../../../services/firebase-auth.service';

// Removed duplicate Material imports that were added again

interface SearchSuggestion {
  type: 'surah' | 'verse';
  name?: string;
  translation: string;
  number?: number;
  surahNumber?: string;
  verseNumber?: string;
  text?: string;
  highlightedText?: string;
}

interface MushafPage {
  page: number;
  imageUrl: string;
  ayahs?: any[];
}

interface MushafContent {
  showBismillah: boolean;
  lines: Array<{
    text: string;
    verseNumber?: number;
  }>;
  currentSurah?: number;
}

interface SurahResponse {
  verse?: {
    page: number;
  };
}

interface TimingData {
  surah: number;
  ayah: number;
  segments: [number, number, number, number][];
  stats: { insertions: number; deletions: number; transpositions: number; };
}

@Component({
  selector: 'app-quran-reader',
  standalone: true,
  // Removed ChangeDetectionStrategy.OnPush
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    // Material Modules
    MatSliderModule,
    MatIconModule,
    MatButtonModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatListModule,
    MatMenuModule,
    MatTooltipModule,
    MatDialogModule
    // ScrollingModule // Removed ScrollingModule
  ],
  templateUrl: './quran-reader.component.html',
  styleUrls: ['./quran-reader.component.scss']
})
export class QuranReaderComponent implements OnInit, OnDestroy {
  @Input() selectedSurah: number = 1;
  @Output() surahSelectionChange = new EventEmitter<number>();
  @ViewChild('verseContainer') verseContainer!: ElementRef;
  @ViewChild('audioPlayerRef') audioPlayerRef!: ElementRef<HTMLAudioElement>;
  surahs: Surah[] = [];
  currentSurah: number = 1;
  currentVerse: number = 1;
  verses: QuranVerse[] = [];
  selectedVerse?: QuranVerse;
  tafsir: string = '';
  bookmarks: string[] = [];
  selectedReciter: Reciter = {
    id: 1,  // Default to Mishari Rashid al-`Afasy
    name: 'Mishari Rashid al-`Afasy',
    identifier: 'ar.alafasy',
    style: 'Murattal',
    surahIdentifier: 'ar.alafasy'
  };
  reciters: Reciter[] = [];
  audioPlayer: HTMLAudioElement = new Audio();
  isPlaying: boolean = false;
  audioPaused: boolean = true;
  currentTime: string = '0:00';
  duration: string = '0:00';
  progress: number = 0;
  currentlyPlaying: string = '';
  currentPlayingVerse: number | null = null;
  selectedTafsir: string = 'en.tafsir-ibn-kathir';
  selectedTranslation: string = '131';
  translations: any[] = [];
  isPlayingFullSurah: boolean = false;
  currentVerseIndex: number = 0;
  selectedWord: { text: string, translation: string } | null = null;
  searchQuery: string = '';
  searchResults: any[] = [];
  searchSuggestions: SearchSuggestion[] = [];
  isSearching: boolean = false;
  showSuggestions: boolean = false;
  selectedWordDetails: WordDetails | null = null;
  juzList: Juz[] = [];
  selectedJuz?: number;
  currentWord?: { text: string; audioUrl: string };
  isPlayingWord: boolean = false;
  fontSize: number = 24;
  isDarkMode: boolean = false;
  showWordByWord: boolean = false;
  arabicFont: 'uthmani' | 'naskh' = 'uthmani';
  showingTranslation: boolean = true;
  currentSurahDetails?: Surah;
  isRepeatEnabled: boolean = false;
  currentRecitingVerse: number | null = null;
  currentWordIndex: number | null = null;
  private verseTimestamps: { [key: string]: number } = {};
  private verseCheckInterval: any;
  private verseTimings: Array<{
    verse_number: number;
    timestamp_from: number;
    timestamp_to: number;
  }> = [];
  private lastScrollTime: number = 0;
  private scrollBuffer: number = 300; // 300ms buffer between scrolls
  private verseBuffer: number = 0.1; // 100ms buffer for verse timing
  isMushafView: boolean = false;
  arabicFontSize: number = 32;
  mushafPages: MushafPage[] = [];
  displayPageNumber: number = 1;  // For display to user (1-604)
  currentPage: number = 10;       // For actual file access (10-627)
  readonly FIRST_PAGE = 10;       // First actual page number
  readonly LAST_PAGE = 613;       // Last actual page number (604 + 9)
  readonly DISPLAY_TOTAL = 604;   // Total displayable pages
  totalPages: number = 604;       // For backward compatibility
  mushafContent: MushafContent | null = null;
  previousMushafContent: MushafContent | null = null;
  mushafPage: MushafPage | null = null;
  mushafZoom: number = 0.9;
  mushafMode: 'single' | 'double' = 'single';
  surahName: string = '';
  pageImageUrl: string = '';
  pageSubscription?: Subscription;
  ayahs: any[] = [];
  isDoublePageView = false;
  secondPageImageUrl: string = '';
  pageInput: number = 1;
  surahNumber: number = 1;
  @ViewChild('searchContainer') searchContainer!: ElementRef;
  verse: QuranVerse | null = null;
  activeWord: any = null;
  isMobile = window.innerWidth < 768;
  preferences: any = {
    lastState: { lastSurah: 1, lastVerse: 1 },
    selectedTranslation: '131',
    selectedTafsir: 'en.tafsir-ibn-kathir',
    fontSize: 24,
    bookmarks: []
  };
  // Add these properties
  private audioElement: HTMLAudioElement | null = null;
  private currentlyPlayingVerse: number | null = null;
  currentPreferences: any = { reciterId: 1 };
  navigationTimeout: any;
  // Add these properties at the top of the class
  private audioLoadingTimeout: any;
  isAudioLoading = false; // Use this consistently for audio loading state
  private currentAudioUrl: string | null = null;
  // Add these properties to the class
  private timingData: Map<string, TimingData[]> = new Map();
  private currentAyahTimings: TimingData | null = null;
  private verseTimeRanges: Map<string, Map<number, { start: number, end: number }>> = new Map();
  // Add these properties to the class
  private audioContext: AudioContext | null = null;
  private audioSource: MediaElementAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private audioDataArray: Uint8Array | null = null;
  private rafId: number | null = null;
  private lastRenderedVerseTime: number = 0;
  private scrollAnimating: boolean = false;
  private verseHighlightElements: Map<number, HTMLElement> = new Map();
  private audioStartTime: number = 0;
  private audioPositionMarker: HTMLElement | null = null;
  // Flag to track if we initialized Web Audio
  private webAudioInitialized: boolean = false;
  
  // Add these constants for better control
  private readonly SCROLL_ANIMATION_DURATION = 800; // ms
  private readonly VERSE_PRELOAD_TIME = 1000; // ms
  private readonly POSITION_UPDATE_INTERVAL = 16; // ~60fps
  
  // Add a debounced version of updateUrlParams
  private urlUpdateTimeoutId: any = null;
  private lastUrlUpdateTime: number = 0;
  private readonly URL_UPDATE_DEBOUNCE_TIME = 300; // ms

  readingHistory: any[] = [];  // Add this property

  // Add verse caching
  private versesCache: Map<string, {verses: any[], timestamp: number}> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Consolidate preference saving logic
  private debounceTimer: any;
  private readonly DEBOUNCE_TIME = 2000; // 2 seconds

  // Add debounced history saving
  private historyDebounceTimer: any;
  private readonly HISTORY_DEBOUNCE_TIME = 1000; // 1 second

  private loadSurahSubscription: Subscription | null = null; // Add this property
  private isScrolling = false;
  private scrollDebounceTimer: any = null; // Timer for scroll event debouncing
  private readonly SCROLL_DEBOUNCE_TIME = 150; // ms for updating currentVerse on scroll

  // Add the arrow function property for the unload handler
  private saveStateToLocalStorageOnUnload = (): void => {
    console.log('[QuranReader] Saving state to localStorage before unload...');
    const stateToSave = {
      surah: this.currentSurah || 1,
      verse: this.currentVerse || 1,
      translation: this.selectedTranslation || '131',
      reciterId: this.selectedReciter?.id || 1,
      isMushafView: this.isMushafView, // <-- Save view state
      page: this.displayPageNumber || 1, // Save current display page number
      fontSize: this.fontSize,
      arabicFontSize: this.arabicFontSize,
      mushafZoom: this.mushafZoom,
      isDoublePageView: this.isDoublePageView,
      showingTranslation: this.showingTranslation
    };
    try {
      localStorage.setItem('quranReaderState', JSON.stringify(stateToSave));
      console.log('[QuranReader] Saved state:', stateToSave);
    } catch (e) {
      console.error('[QuranReader] Failed to save state to localStorage:', e);
    }
  };

  user: AppUser | null = null; // Add user property
  private destroy$ = new Subject<void>(); // Add destroy subject

  constructor(
    public quranService: QuranService,
    private sttService: SttService,
    private quranFlash: QuranFlashService,
    private router: Router,
    private sanitizer: DomSanitizer,
    private authService: FirebaseAuthService, // Ensure injected
    private toastService: ToastService,
    private route: ActivatedRoute,
    private changeDetector: ChangeDetectorRef, // Use changeDetector consistently
    private http: HttpClient,
    private ngZone: NgZone
  ) {
    // Don't set reciters here, wait for ngOnInit
  }

  async ngOnInit() {
    console.log('[ngOnInit] Starting...');
    window.addEventListener('beforeunload', this.saveStateToLocalStorageOnUnload);
    this.isAudioLoading = true; // Start loading indicator
    this.loadSurahSubscription?.unsubscribe();

    // Subscribe to user changes FIRST, needed for subsequent calls
    this.authService.user$.pipe(
      takeUntil(this.destroy$)
    ).subscribe((u: AppUser | null) => {
      console.log('[QuranReader] User state update received.');
      this.user = u;
      // Avoid detectChanges here if possible, let other initial loads handle it
    });

    try {
      // --- Load Essential Data (Non-blocking UI elements) ---
      console.log('[ngOnInit] Loading essential data (Surahs, Translations, Reciters)...');
      await Promise.all([
        this.loadSurahs(),
        this.loadTranslationsData(),
        this.loadRecitersData(),
      ]);
      console.log('[ngOnInit] Essential data loading complete.');

      // --- Apply Default UI Settings ---
      this.checkDarkMode();
      this.selectedTranslation = '131'; // Default translation
      this.selectedReciter = this.reciters.find(r => r.id === 1) || this.reciters[0]; // Default reciter
      this.fontSize = 24; // Default font size

      // --- Determine Final Initial State (URL > localStorage > Default) ---
      console.log('[ngOnInit] Determining final initial state...');
      let finalSurah = 1;
      let finalVerse = 1;
      let finalIsMushaf = false;
      let stateSource = 'Default';
      let restoredState: any = null; // Declare restoredState here

      // 1. Check localStorage
      try {
        // Correct the localStorage key to match the saving key
        const stateJson = localStorage.getItem('quranReaderState'); 
        if (stateJson) {
          restoredState = JSON.parse(stateJson); // Assign inside the try block
          // Add logging to see exactly what is restored
          console.log('[ngOnInit] Restored state from localStorage:', restoredState);
          if (restoredState && restoredState.surah && restoredState.verse) {
            finalSurah = parseInt(restoredState.surah, 10) || finalSurah;
            finalVerse = parseInt(restoredState.verse, 10) || finalVerse;
            // Use isMushafView directly from restored state
            finalIsMushaf = !!restoredState.isMushafView; 
            // Apply reciter/translation from localStorage here if valid
            this.selectedTranslation = restoredState.translation || this.selectedTranslation;
            const restoredReciter = this.reciters.find(r => r.id === restoredState.reciterId); // Use reciterId
            if (restoredReciter) this.selectedReciter = restoredReciter;
            stateSource = 'localStorage';
            console.log(`[ngOnInit] State loaded from localStorage: S${finalSurah}:V${finalVerse}, Mode: ${finalIsMushaf ? 'mushaf' : 'translation'}`);
          }
        }
      } catch (e) {
        console.warn('[ngOnInit] Error reading or parsing localStorage state:', e);
        localStorage.removeItem('quran_reader_state'); // Clear potentially corrupt state
      }

      // 2. Check URL (Overrides localStorage and Default)
      const params = this.route.snapshot.queryParams;
      const urlSurah = parseInt(params['surah'], 10);
      const urlVerse = parseInt(params['verse'], 10);
      const urlMode = params['mode'];
      const urlTranslation = params['translation'];
      const urlReciter = parseInt(params['reciter'], 10);
      const urlPage = parseInt(params['page'], 10); // <-- Get URL page number

      let finalPageNumber = 1; // Initialize default page

      if (urlSurah >= 1 && urlSurah <= 114) {
        finalSurah = urlSurah;
        finalVerse = (urlVerse >= 1) ? urlVerse : 1; // Ensure verse is at least 1
        finalIsMushaf = urlMode === 'mushaf';
        if (urlTranslation) this.selectedTranslation = urlTranslation; // Override if present
        if (!isNaN(urlReciter)) { // Override if present and valid
             const foundReciter = this.reciters.find(r => r.id === urlReciter);
             if (foundReciter) this.selectedReciter = foundReciter;
        }
        stateSource = 'URL';
        console.log(`[ngOnInit] State overridden by URL params: S${finalSurah}:V${finalVerse}, Mode: ${finalIsMushaf ? 'mushaf' : 'translation'}`);
      }

      // Determine finalPageNumber specifically for Mushaf mode
      if (finalIsMushaf) {
        if (urlPage >= 1 && urlPage <= this.DISPLAY_TOTAL) {
          finalPageNumber = urlPage;
          console.log(`[ngOnInit] Mushaf page overridden by URL: ${finalPageNumber}`);
        } else if (restoredState && restoredState.page >= 1 && restoredState.page <= this.DISPLAY_TOTAL) {
          finalPageNumber = restoredState.page;
          console.log(`[ngOnInit] Mushaf page restored from localStorage: ${finalPageNumber}`);
        } else {
          finalPageNumber = 1; // Default if no valid page found
          console.log(`[ngOnInit] Mushaf page defaulted to 1.`);
        }
        // Ensure component state reflects the final page number immediately
        this.displayPageNumber = finalPageNumber;
        this.currentPage = this.displayToActualPage(finalPageNumber);
      }

      console.log(`[ngOnInit] Final initial state determined from ${stateSource}: S${finalSurah}:V${finalVerse}, Mode: ${finalIsMushaf ? 'mushaf' : 'translation'}, Page: ${finalPageNumber}, Trans: ${this.selectedTranslation}, Reciter: ${this.selectedReciter.id}`);

      // --- Apply Final State to Component ---
      this.currentSurah = finalSurah;
      this.selectedSurah = finalSurah; // Ensure dropdown matches
      this.currentVerse = finalVerse;
      this.isMushafView = finalIsMushaf;
      // Preferences like font size are loaded later, no need to apply them to final state determination

      // --- Load Initial Content Based on Final State --- 
      // Pass the determined page number IF it's Mushaf view
      this.loadInitialContent(finalSurah, finalVerse, finalIsMushaf, finalIsMushaf ? finalPageNumber : undefined);

      // --- Asynchronously Load Secondary Data (Preferences, History, Bookmarks) ---
      // No need to pass initial state anymore, it's already determined
      setTimeout(() => {
        this.loadSecondaryData();
      }, 50); // Slightly longer timeout just in case

    } catch (error) {
      console.error('[ngOnInit] Critical error during essential initialization:', error);
      this.isAudioLoading = false; // Ensure loading stops on major error
      this.toastService.showError('Initialization failed. Please refresh.');
      this.changeDetector.markForCheck(); // Use markForCheck
    }
  }

  // *** UPDATED HELPER METHOD ***
  // Helper to load initial content based on determined state
  private loadInitialContent(surah: number, verse: number, isMushaf: boolean, targetDisplayPage?: number): void { // <-- Add targetDisplayPage parameter
    console.log(`[loadInitialContent] Called with S:${surah}, V:${verse}, Mushaf:${isMushaf}, TargetPage:${targetDisplayPage}`);
    //this.showLoadingUI(); // Show loading indicators
    this.changeDetector.markForCheck(); // Update UI for loading indicator

    // Reset previous verses if changing Surah or view mode
    this.verses = [];

    if (isMushaf) {
      let actualPageToLoad: number;
      // If a target page is provided (from URL or localStorage), use it.
      if (targetDisplayPage && targetDisplayPage >= 1 && targetDisplayPage <= this.DISPLAY_TOTAL) {
        actualPageToLoad = this.displayToActualPage(targetDisplayPage);
        console.log(`[loadInitialContent] Using targetDisplayPage ${targetDisplayPage} -> actualPage ${actualPageToLoad}`);
      } else {
        // Fallback: Find page for the specific verse (should ideally not be needed often on init)
        console.warn(`[loadInitialContent] No valid targetDisplayPage provided. Falling back to finding page for S${surah}:V${verse}`);
        actualPageToLoad = this.quranFlash.surahPageMap[surah] || this.FIRST_PAGE;
        // Since getPageBySurah caused issues, use the direct map lookup as a simpler fallback
      }

      // Update component state
      this.currentPage = actualPageToLoad;
      this.displayPageNumber = this.actualToDisplayPage(actualPageToLoad);

      // Load the Mushaf Page
      from(this.loadMushafPage(actualPageToLoad)).pipe(
          take(1),
          finalize(() => {
              this.isAudioLoading = false;
              this.updateUrlParams(); // Update URL after load attempt
              this.changeDetector.markForCheck();
              console.log(`[loadInitialContent] Mushaf loading finalized for page ${this.currentPage}.`);
          })
      ).subscribe({
          // Success handling is implicitly done by loadMushafPage
          error: (err) => {
              console.error('[loadInitialContent] Error in loadMushafPage pipe:', err);
              // Finalize still runs to stop loading indicator
          }
      });

    } else {
      // Load Verse View
      console.log(`[loadInitialContent] Loading verse view for S${surah}...`);
      this.loadSurahSubscription?.unsubscribe(); // Cancel previous load if any
      this.loadSurahSubscription = this.loadSurah(surah).pipe(
          // Ensure hideLoadingUI and change detection run even if loadSurah completes quickly from cache
          finalize(() => {
              //this.hideLoadingUI();
              this.isAudioLoading = false; // <-- Set loading false in finalize
              this.changeDetector.markForCheck();
              // Scroll to the target verse AFTER verses are loaded and DOM is likely updated
              // Use setTimeout to give DOM a chance to render
              setTimeout(() => {
                this.scrollToVerse(this.currentVerse);
              }, 150); // Adjust delay if needed
              console.log(`[loadInitialContent] Verse view loading finalized for Surah ${surah}. Will attempt scroll.`);
              // Update URL after successful load
              this.updateUrlParams();
          })
      ).subscribe({
          // next: handled by loadSurah
          error: (err) => {
              console.error(`[loadInitialContent] Error in loadSurah pipe for Surah ${surah}:`, err);
              // No need to hideLoadingUI here, finalize handles it
          }
      });
    }
  }

  // *** SIMPLIFIED HELPER METHOD ***
  // Helper to load non-essential data (preferences, history, bookmarks)
  private async loadSecondaryData(): Promise<void> {
    console.log('[QuranReader] Loading secondary data...');
    //this.showLoadingUI(); // <-- Remove argument

    // Load preferences, history (async), and bookmarks (observable)
    // Convert bookmark observable to promise for Promise.all
    const bookmarksPromise = firstValueFrom(this.loadBookmarks());

    await Promise.all([ 
      this.loadUserPreferences(), 
      bookmarksPromise, // Wait for the bookmark loading to complete
      this.loadReadingHistory()
    ]);

    // --- Restore state from LocalStorage AFTER loading prefs/bookmarks/history --- 
    try {
      const savedStateString = localStorage.getItem('quranReaderState');
      if (savedStateString) {
        const savedState = JSON.parse(savedStateString);
        console.log('[QuranReader] Found saved state in localStorage:', savedState);

        // Restore view mode FIRST, if available, before potentially conflicting prefs
        if (typeof savedState.isMushafView === 'boolean') {
            this.isMushafView = savedState.isMushafView;
            console.log('[QuranReader] Restored isMushafView from localStorage:', this.isMushafView);
        }

        // Restore other settings from localStorage if they exist
        if (savedState.page) this.displayPageNumber = savedState.page;
        if (savedState.fontSize) this.fontSize = savedState.fontSize;
        if (savedState.arabicFontSize) this.arabicFontSize = savedState.arabicFontSize;
        if (savedState.mushafZoom) this.mushafZoom = savedState.mushafZoom;
        if (typeof savedState.isDoublePageView === 'boolean') this.isDoublePageView = savedState.isDoublePageView;
        if (typeof savedState.showingTranslation === 'boolean') this.showingTranslation = savedState.showingTranslation;

        // We might still override with DB prefs if they exist, but localStorage provides a quick fallback
        // The logic in loadUserPreferences handles applying DB prefs over these defaults/localStorage values

        console.log('[QuranReader] State after localStorage restore:', { 
            isMushafView: this.isMushafView, 
            page: this.displayPageNumber 
            // Add other relevant state vars
        });

      } else {
          console.log('[QuranReader] No state found in localStorage.');
      }
    } catch (error) {
      console.error('[QuranReader] Error loading state from localStorage:', error);
    }
    // --- End of localStorage restoration ---

    // Setup view mode based on the potentially restored state
    this.setupViewMode();

    console.log('[QuranReader] Secondary data loading complete.');
    //this.hideLoadingUI(); // <-- Remove argument
    this.changeDetector.markForCheck(); // Ensure UI reflects loaded data (final check)
  }



  private scrollToVerse(verseNumber: number, maxAttempts: number = 5): boolean { // Reduced maxAttempts
      if (!verseNumber || this.isMushafView) return false; // Don't scroll in mushaf view

      let scrolledSuccessfully = false;

      const attemptScroll = (attempts: number = 0) => {
          const verseElement = document.getElementById(`verse-${verseNumber}`);
          if (verseElement) {
              console.log(`[Scroll attempt ${attempts + 1}] Found element for verse ${verseNumber}. Preparing to scroll...`);
              // Existing highlight and scroll logic...
              document.querySelectorAll('.highlighted-verse').forEach(el => {
                  el.classList.remove('highlighted-verse');
              });
              verseElement.classList.add('highlighted-verse');
              const headerOffset = 80;
              const elementPosition = verseElement.getBoundingClientRect().top;
              const offsetPosition = elementPosition + window.scrollY - headerOffset;

              // Update state *before* scrolling
              this.currentVerse = verseNumber;
              // this.currentRecitingVerse = verseNumber; // Only set this if audio is playing

              // Save state immediately (can be debounced later if needed)
              // this.savePreferences(); // Avoid frequent saves during init/scroll
              // this.debouncedSaveHistory(verseNumber); // Debounce history

              this.updateUrlParams(); // Update URL to reflect the scrolled verse

              window.scrollTo({ top: offsetPosition, behavior: 'smooth' });

              setTimeout(() => {
                  verseElement.classList.remove('highlighted-verse');
              }, 2000); // Shorter highlight duration

              scrolledSuccessfully = true;
              return;
          } else if (attempts < maxAttempts) {
              // console.log(`[scrollToVerse] Verse ${verseNumber} not found (Attempt ${attempts + 1}). Retrying...`); // Optional log
              // Simplified retry: Use setTimeout directly
              setTimeout(() => attemptScroll(attempts + 1), 100 + attempts * 50); // Simple increasing delay
          } else {
              console.warn(`[scrollToVerse] Failed to find verse element ${verseNumber} after ${maxAttempts} attempts.`);
              this.updateUrlParams(); // Update URL even on failure
          }
      };

      attemptScroll();
      return scrolledSuccessfully;
  }

  private debouncedSavePreferences() {
    // Clear existing timer
    if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
    }

    // Set new timer
    this.debounceTimer = setTimeout(async () => {
        // Ensure we have valid arrays for bookmarks and history
        const currentBookmarks = Array.isArray(this.bookmarks) ? this.bookmarks : [];
        const currentHistory = Array.isArray(this.readingHistory) ? this.readingHistory : [];

        const prefsToSave = {
            selectedReciter: this.selectedReciter?.id || 1,
            selectedTranslation: this.selectedTranslation || '131',
            fontSize: this.fontSize || 24,
            bookmarks: currentBookmarks,
            readingHistory: currentHistory,
            lastState: {
                lastSurah: this.currentSurah || 1,
                lastVerse: this.currentVerse || 1,
                isMushafView: this.isMushafView,
                timestamp: new Date().toISOString()
            }
        };

        // Save to localStorage immediately
        // try {
        //     localStorage.setItem('quran_reader_preferences', JSON.stringify(prefsToSave));
        // } catch (error) {
        //     console.warn('Error saving to localStorage:', error);
        // }

        // Save to server if authenticated
        try {
            const isAuthenticated = await this.authService.isAuthenticated();
            if (isAuthenticated) {
                await this.authService.saveUserPreferences(prefsToSave);
                // console.log('Preferences saved successfully:', prefsToSave);
            }
        } catch (error: unknown) {
            if ((error as { status?: number })?.status !== 429) {
                console.error('Error saving preferences:', error);
            }
        }
    }, this.DEBOUNCE_TIME);
  }

  private debouncedSaveHistory(verseNumber: number) {
    clearTimeout(this.historyDebounceTimer);
    this.historyDebounceTimer = setTimeout(async () => {
      // console.log(`[QuranReader] Debounced save history triggered for verse ${verseNumber}.`);
      // Use this.user and isValidVerseForHistory check
      if (!this.user || !this.isValidVerseForHistory(this.currentSurah, verseNumber)) {
        // console.log('[QuranReader] User not logged in or invalid verse, skipping history save.');
        return;
      }

        // Update local state immediately
        const currentHistory = Array.isArray(this.readingHistory) ? this.readingHistory : [];
        const historyEntry = { surah: this.currentSurah, verse: verseNumber, timestamp: new Date().toISOString() }; // Define historyEntry
        this.readingHistory = [
            historyEntry,
            ...currentHistory.filter(h => 
                !(h.surah === historyEntry.surah && h.verse === historyEntry.verse)
            )
        ].slice(0, 100);

        // Save to localStorage first
        try {
            const prefs = JSON.parse(localStorage.getItem('quran_reader_preferences') || '{}');
            prefs.readingHistory = this.readingHistory;
            prefs.lastState = {
                lastSurah: this.currentSurah,
                lastVerse: verseNumber,
                isMushafView: this.isMushafView,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('quran_reader_preferences', JSON.stringify(prefs));

            // Also update quran_reader_state
            localStorage.setItem('quran_reader_state', JSON.stringify({
                mode: this.isMushafView ? 'mushaf' : 'translation',
                translation: this.selectedTranslation,
                reciter: this.selectedReciter?.id,
                surah: this.currentSurah,
                verse: verseNumber,
                timestamp: new Date().toISOString()
            }));
        } catch (error) {
            console.warn('Error saving to localStorage:', error);
        }

        // Save to server
        try {
            await this.authService.saveReadingHistory(historyEntry.surah, historyEntry.verse);
            // console.log('History saved successfully:', historyEntry);
        } catch (error: unknown) {
            if ((error as { status?: number })?.status !== 429) {
                console.error('Error saving reading history:', error);
                // Revert local state on error
                this.readingHistory = currentHistory;
                try {
                    const prefs = JSON.parse(localStorage.getItem('quran_reader_preferences') || '{}');
                    prefs.readingHistory = currentHistory;
                    localStorage.setItem('quran_reader_preferences', JSON.stringify(prefs));
                } catch (e) {
                    console.warn('Error reverting localStorage:', e);
                }
            }
        }

        // Also save preferences to ensure lastState is updated
        await this.debouncedSavePreferences();
    }, this.HISTORY_DEBOUNCE_TIME);
  }

  // Add the helper method needed by debouncedSaveHistory
  private isValidVerseForHistory(surah: number, verse: number): boolean {
    // Basic validation, adjust if needed based on QuranService data
    return (
      Number.isInteger(surah) &&
      Number.isInteger(verse) &&
      surah >= 1 &&
      surah <= 114 &&
      verse >= 1 &&
      // Optional: Check against actual verse count for the surah if available
      // verse <= (this.quranService.getVerseCountForSurah(surah) || 999)
      true // Placeholder for now
    );
  }

  // Bookmark methods
  public isBookmarked(verseNumber: number): boolean {
    if (!this.currentSurah || !this.bookmarks || !Array.isArray(this.bookmarks)) {
      return false;
    }
    return this.bookmarks.includes(`${this.currentSurah}:${verseNumber}`);
  }

  public toggleBookmark(verseNumber: number): void {
    if (!this.currentSurah) return;
    
    const bookmark = `${this.currentSurah}:${verseNumber}`;
    const currentBookmarks = Array.isArray(this.bookmarks) ? this.bookmarks : [];
    const isBookmarked = currentBookmarks.includes(bookmark);
    
    // Optimistically update UI
    this.bookmarks = isBookmarked 
      ? currentBookmarks.filter(b => b !== bookmark)
      : [...currentBookmarks, bookmark];
    
    // Save to localStorage
    try {
      const prefs = JSON.parse(localStorage.getItem('quran_reader_preferences') || '{}');
      prefs.bookmarks = this.bookmarks;
      localStorage.setItem('quran_reader_preferences', JSON.stringify(prefs));
    } catch (error) {
      console.warn('Error saving to localStorage:', error);
    }
    
    // Call appropriate server method
    const serverAction = isBookmarked 
      ? this.authService.removeBookmark(bookmark)
      : this.authService.addBookmark(bookmark);
    
    serverAction.pipe(
      take(1), // Take only one emission
      catchError(error => {
        console.error('Error updating bookmark:', error);
        // Revert local changes on error
        this.bookmarks = currentBookmarks;
        this.revertLocalStorageBookmarks(currentBookmarks);
        this.toastService.show('Failed to update bookmark');
        return EMPTY;
      })
    ).subscribe(response => {
      if (response.success) {
        this.bookmarks = response.bookmarks;
        this.toastService.show(isBookmarked ? 'Bookmark removed' : 'Bookmark added');
        this.debouncedSavePreferences();
      } else {
        // Revert local changes if server fails
        this.bookmarks = currentBookmarks;
        this.revertLocalStorageBookmarks(currentBookmarks);
        this.toastService.show(response.message || 'Failed to update bookmark');
      }
    });
  }

  private revertLocalStorageBookmarks(bookmarks: string[]) {
    try {
        const prefs = JSON.parse(localStorage.getItem('quran_reader_preferences') || '{}');
        prefs.bookmarks = bookmarks;
        localStorage.setItem('quran_reader_preferences', JSON.stringify(prefs));
    } catch (error) {
        console.warn('Error reverting localStorage bookmarks:', error);
    }
  }

  private loadBookmarks(): Observable<string[]> { 
    // First try to load from localStorage (synchronous part)
    try {
      const prefs = JSON.parse(localStorage.getItem('quran_reader_preferences') || '{}');
      if (Array.isArray(prefs.bookmarks)) {
        this.bookmarks = prefs.bookmarks;
      }
    } catch (error) {
      console.warn('Error loading bookmarks from localStorage:', error);
      this.bookmarks = [];
    }

    // Return the observable stream for the server call
    return this.authService.getBookmarks().pipe(
      take(1), // Take only one emission
      catchError(error => {
        console.error('Error loading bookmarks from server:', error);
        // Return the locally cached bookmarks on server error
        return of(this.bookmarks); 
      }),
      tap(serverBookmarks => { // Use tap to perform side effects without altering the stream
        if (Array.isArray(serverBookmarks)) {
          // console.log('[loadBookmarks] Received server bookmarks:', serverBookmarks); // Optional log
          this.bookmarks = serverBookmarks; // Update local array
          
          // Update localStorage with server data
          try {
            const prefs = JSON.parse(localStorage.getItem('quran_reader_preferences') || '{}');
            prefs.bookmarks = this.bookmarks;
            localStorage.setItem('quran_reader_preferences', JSON.stringify(prefs));
          } catch (error) {
            console.warn('Error saving bookmarks to localStorage:', error);
          }
          // Trigger change detection specifically after bookmarks are updated from server
          this.changeDetector.markForCheck(); 
        }
      }),
      takeUntil(this.destroy$)
    );
  }

  private async loadSurahs(): Promise<void> {
    try {
      // First try to load from cache
      const cachedSurahs = localStorage.getItem('quran_surahs');
      if (cachedSurahs) {
        try {
          this.surahs = JSON.parse(cachedSurahs);
          // console.log('Loaded surah list from cache');
          if (this.surahs.length > 0) {
            return Promise.resolve();
          }
        } catch (parseError) {
          console.warn('Error parsing cached surahs:', parseError);
        }
      }
      
      // If no cache or cache is invalid, load from API
      // console.log('Loading surah list from API...');
      
      // Create a promise that will reject after 5 seconds
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout loading surah list')), 5000);
      });
      
      // Race between the actual data fetch and the timeout
      this.surahs = await Promise.race([
        firstValueFrom(this.quranService.getSurahs()),
        timeoutPromise
      ]) as Surah[];
      
      // Cache the result
      try {
        localStorage.setItem('quran_surahs', JSON.stringify(this.surahs));
      } catch (cacheError) {
        console.warn('Error caching surahs:', cacheError);
      }
      
      // console.log('Loaded surah list successfully', this.surahs.length);
      return Promise.resolve();
    } catch (error) {
      console.error('Error loading surah list:', error);
      
      // Provide fallback data if loading fails
      if (this.surahs.length === 0) {
        // console.log('Using fallback surah list');
        this.surahs = [{
          number: 1,
          name: 'Al-Fatiha',
          englishName: 'The Opening',
          englishNameTranslation: 'The Opening',
          numberOfAyahs: 7
        }];
      }
      
      return Promise.resolve(); // Resolve with fallback data
    }
  }

  /**
   * Loads the data for a specific surah, including verses and translations.
   * Caches results for performance.
   * @param surahNumber The number of the surah to load.
   * @returns An observable that completes when the surah is loaded or emits null on error.
   */
  public loadSurah(surahNumber: number): Observable<void | null> {
    this.isAudioLoading = true; // Set loading true for the current operation
    this.changeDetector.detectChanges();
    // console.log(`[loadSurah] Started loading Surah ${surahNumber}. isAudioLoading: ${this.isAudioLoading}`); // REMOVE DEBUG

    // Reset current verse selection when surah changes
    this.currentVerse = 1;

    // Return the observable stream
    return this.quranService.getSurah(surahNumber, this.selectedTranslation, this.selectedReciter.id).pipe(
      map(verses => {
        // console.log(`[loadSurah] Received ${verses?.length} verses for Surah ${surahNumber}.`); // REMOVE DEBUG
        this.verses = verses;
        this.currentSurahDetails = this.surahs.find(s => s.number === surahNumber);
        // Ensure other related properties are updated if needed
        this.currentSurah = surahNumber;
        
        // Set cached verses
        this.setCachedVerses(surahNumber, this.selectedReciter.id, verses);
        
        // Load verse timings if needed for highlighting
        // await this.loadVerseTimings(surahNumber, this.selectedReciter.path);

        // console.log(`[loadSurah] Setting isAudioLoading = false for Surah ${surahNumber}.`); // REMOVE DEBUG
        this.isAudioLoading = false;
        this.changeDetector.detectChanges();

        // Add a slight delay before updating URL to allow rendering
        setTimeout(() => this.updateUrlParams(), 50);
      }),
      catchError(error => {
        // console.error('[loadSurah] Error loading surah data:', error); // REMOVE DEBUG
        this.isAudioLoading = false;
        this.toastService.showError('Failed to load surah data.');
        this.changeDetector.detectChanges();
        return of(null); // Return observable of null on error
      })
    );
  }

  /**
   * Plays the audio for the entire current surah.
   * @param url The audio URL for the full surah.
   */
  private async playSurahAudio(url: string): Promise<void> {
    await this.stopAndCloseAudioPlayer(); 

    this.isPlayingFullSurah = true;
    this.currentPlayingVerse = null; // Ensure no verse is marked as playing
    
    // Ensure currentSurahDetails is up-to-date
    const surahDetails = this.surahs.find(s => s.number === this.currentSurah);
    this.currentSurahDetails = surahDetails; // Update the component property
    const surahDisplayName = surahDetails ? `${surahDetails.englishName} (${surahDetails.name})` : `Surah ${this.currentSurah}`;
    this.currentlyPlaying = `Full ${surahDisplayName}`; // Update display text

    this.isAudioLoading = true;
    this.audioPaused = false;
    this.isPlaying = true;
    this.currentAudioUrl = url;

    try {
      if (!this.audioPlayer) {
        this.audioPlayer = new Audio();
        this.setupAudioEvents();
      }

      this.audioPlayer.src = url;
      this.audioPlayer.load();
      await this.audioPlayer.play();

      this.isAudioLoading = false; // Loading complete after play starts
      // this.changeDetector.detectChanges(); // NgZone handles detection

    } catch (error) {
      console.error('Full Surah audio playback error:', error);
      this.handleAudioError(error); // Use the existing error handler
      // Reset specific full surah state
      this.isPlayingFullSurah = false;
      // General reset is handled by handleAudioError
      // this.changeDetector.detectChanges(); // NgZone handles detection
    }
    // this.changeDetector.detectChanges(); // Ensure UI update after try/catch
  }

  /**
   * Plays audio for a specific verse, generating the URL dynamically based on the currently selected reciter.
   * @param verse The QuranVerse object containing verse information.
   */
  public async playVerseAudio(verse: QuranVerse): Promise<void> {
    const verseNumber = verse.number;
    const surahNumber = this.currentSurah; // Assuming currentSurah is correct

    if (!this.selectedReciter || !surahNumber) {
      console.error('Reciter or Surah not selected for audio playback');
      this.toastService.showError('Please select a reciter and surah first.');
      return;
    }

    // Construct the verse key (e.g., "1:7")
    const verseKey = `${surahNumber}:${verseNumber}`;

    // Construct the correct audio URL
    const correctAudioUrl = this.quranService.getVerseAudioUrl(this.selectedReciter.id, verseKey);

    if (!correctAudioUrl) {
      console.error(`Could not generate audio URL for ${verseKey} with reciter ${this.selectedReciter.id}`);
      this.toastService.showError('Error getting audio URL for this verse.');
      return;
    }

    // Set the display text immediately
    const surahDetails = this.currentSurahDetails; // Use the already fetched details
    const surahDisplayName = surahDetails ? `${surahDetails.englishName} (${surahDetails.name})` : `Surah ${surahNumber}`;
    this.currentlyPlaying = `${surahDisplayName} - Verse ${verseNumber}`;
    // Remove immediate change detection after setting title
    // this.changeDetector.detectChanges(); 

    // Call the existing playAudio method with the dynamically generated URL
    await this.playAudio(correctAudioUrl, verseNumber);
  }

  // Existing playAudio method (reverted version)
  public async playAudio(url: string, verseNumber: number | null): Promise<void> {
    if (!url) {
      console.error('Audio URL is invalid.');
      this.handleAudioError('Invalid audio URL');
      return;
    }

    try {
      if (this.isPlaying && this.currentlyPlaying === url) {
        // If the same verse is clicked again, pause it
        this.audioPlayer.pause();
        this.isPlaying = false;
        this.audioPaused = true;
        this.currentPlayingVerse = null; // Reset currently playing verse
      } else {
        // Stop any currently playing audio first
        this.audioPlayer.pause();

        // --- Store scroll position BEFORE potentially disturbing it ---
        const currentScrollY = window.scrollY;
        // -----------------------------------------------------------

        this.currentlyPlaying = url;
        this.currentPlayingVerse = verseNumber; // Set the currently playing verse
        this.isAudioLoading = true; // Indicate loading
        this.audioPaused = false;
        // Set user-friendly display text instead of URL
        const surahDetails = this.currentSurahDetails;
        const surahDisplayName = surahDetails ? `${surahDetails.englishName} (${surahDetails.name})` : `Surah ${this.currentSurah}`;
        this.currentlyPlaying = verseNumber ? `${surahDisplayName} - Verse ${verseNumber}` : `Full ${surahDisplayName}`;
        // console.log('Setting audio source:', url); // Removed log
        this.audioPlayer.src = url;

        // Remove old event listeners before adding new ones
        this.removeAudioEvents();
        // Set up event listeners
        this.setupAudioEvents();

        await this.audioPlayer.load(); // Explicitly load the new source
        // console.log('Audio loaded, attempting to play...'); // Removed log
        await this.audioPlayer.play();
        this.isPlaying = true;
        // console.log('Audio playback started.'); // Removed log

        // --- Restore scroll position AFTER playback starts ---
        requestAnimationFrame(() => {
            // Check if scroll position changed significantly (e.g., > 5px)
            if (Math.abs(window.scrollY - currentScrollY) > 5) {
                // console.log(`[playAudio] Restoring scroll position from ${window.scrollY} to ${currentScrollY}`);
                window.scrollTo({ top: currentScrollY, behavior: 'instant' }); // Use 'instant' to avoid visual jump
            }
        });
        // ------------------------------------------------------

        // Set timeout for loading indicator
        clearTimeout(this.audioLoadingTimeout);
        this.audioLoadingTimeout = setTimeout(() => {
          if (this.isAudioLoading) {
            console.warn('Audio loading timed out.');
            this.handleAudioError('Audio loading timed out');
            this.isAudioLoading = false;
          }
        }, 10000); // 10 second timeout

        // Optional: Save playback state or perform other actions
        // this.savePreferences(); <-- REMOVED this line
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      this.handleAudioError('Failed to play audio');
      this.isPlaying = false;
      this.audioPaused = true;
      this.currentPlayingVerse = null; // Reset on error
      this.isAudioLoading = false; // Ensure loading is false on error
      clearTimeout(this.audioLoadingTimeout);
    }
  }

  private setupAudioEvents(): void {
    if (!this.audioPlayer) return;

    // Remove existing event listeners to prevent duplicates
    this.removeAudioEvents();

    // Bind the handlers correctly to maintain 'this' context
    this.audioPlayer.addEventListener('timeupdate', this.onTimeUpdate);
    this.audioPlayer.addEventListener('loadedmetadata', this.onLoadedMetadata);
    this.audioPlayer.addEventListener('ended', this.onEnded);
    this.audioPlayer.addEventListener('error', this.onError);
    this.audioPlayer.addEventListener('pause', this.onPause);
    this.audioPlayer.addEventListener('play', this.onPlay);

    // Add listeners for loading states
    this.audioPlayer.addEventListener('waiting', () => this.isAudioLoading = true);
    this.audioPlayer.addEventListener('playing', () => this.isAudioLoading = false);
    this.audioPlayer.addEventListener('canplay', () => this.isAudioLoading = false);
  }

  private readonly onTimeUpdate = (): void => {
    this.ngZone.run(() => {
      if (!this.audioPlayer.duration) return;
      this.currentTime = this.formatTime(this.audioPlayer.currentTime);
      this.duration = this.formatTime(this.audioPlayer.duration);
      this.progress = (this.audioPlayer.currentTime / this.audioPlayer.duration) * 100;
      this.updateRecitingVerse(this.audioPlayer.currentTime);
      this.changeDetector.detectChanges(); // Trigger change detection
    });
  };

  private readonly onLoadedMetadata = (): void => {
    this.ngZone.run(() => {
      if (!this.audioPlayer.duration) return;
      this.duration = this.formatTime(this.audioPlayer.duration);
      this.currentTime = '0:00';
      this.progress = 0;
      this.isAudioLoading = false; // Audio metadata loaded
      clearTimeout(this.audioLoadingTimeout); // Clear timeout
      this.changeDetector.detectChanges(); // Trigger change detection
      // Fetch verse timings if playing full surah
      if (this.isPlayingFullSurah && this.currentSurah) {
        this.loadVerseTimings(this.currentSurah);
      }
    });
  };

  private readonly onEnded = (): void => {
    this.ngZone.run(() => {
      this.isPlaying = false;
      this.audioPaused = true; // Mark as paused when ended
      this.progress = 0;
      this.currentTime = '0:00';
      this.currentPlayingVerse = null; // Reset currently playing verse
      this.currentRecitingVerse = null; // Reset reciting verse highlight
      this.changeDetector.detectChanges(); // Trigger change detection

      if (this.isRepeatEnabled) {
        this.audioPlayer.currentTime = 0;
        this.audioPlayer.play();
        this.isPlaying = true;
        this.audioPaused = false;
      } else if (this.isPlayingFullSurah) {
        // Optionally handle ending of full surah playback
        console.log('Full surah playback ended.');
        this.isPlayingFullSurah = false; // Reset flag
      }
    });
  };

  private readonly onError = (e: Event): void => {
    this.ngZone.run(() => {
      console.error('Audio player error:', e);
      this.handleAudioError('Error occurred during playback');
      this.changeDetector.detectChanges(); // Trigger change detection
    });
  };

  private readonly onPause = (): void => {
    this.ngZone.run(() => {
      this.isPlaying = false;
      this.audioPaused = true;
      this.changeDetector.detectChanges(); // Trigger change detection
    });
  };

  private readonly onPlay = (): void => {
    this.ngZone.run(() => {
      this.isPlaying = true;
      this.audioPaused = false;
      this.changeDetector.detectChanges(); // Trigger change detection
    });
  };

  seekAudio(event: Event): void {
    if (!this.audioPlayer || isNaN(this.audioPlayer.duration)) return;
    
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);
    const time = (value / 100) * this.audioPlayer.duration;
    this.audioPlayer.currentTime = time;
    
    // Update UI immediately within seek
    this.ngZone.run(() => {
      this.progress = value;
      this.currentTime = this.formatTime(time);
    });
  }

  private formatTime(time: number): string {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  // Update the stopAndCloseAudioPlayer method
  async stopAndCloseAudioPlayer() {
    try {
      if (this.audioPlayer) {
        try {
          await this.audioPlayer.pause();
          this.audioPlayer.currentTime = 0;
          this.audioPlayer.removeAttribute('src');
        } catch (e) {
          console.warn('Error stopping audio player:', e);
        }
      }
      
      this.isPlaying = false;
      this.audioPaused = true;
      this.currentPlayingVerse = null;
      this.currentlyPlaying = '';
      this.currentAudioUrl = null;
      this.progress = 0;
      this.currentTime = '0:00';
      this.duration = '0:00';
      
      // this.changeDetector.detectChanges(); // NgZone handles detection
      
      if (this.isPlayingFullSurah) {
        this.stopFullSurah();
      }
    } catch (error) {
      console.warn('Error closing audio player:', error);
    }
  }

  // Add back the missing methods
  private async loadUserPreferences() {
    try {
      // Initialize reciters first
      this.reciters = this.quranService.reciters;
      if (!this.reciters?.length) {
        console.error('No reciters available');
        return;
      }

      // Try to load from localStorage first for immediate state
      const localPrefs = localStorage.getItem('quran_reader_preferences');
      if (localPrefs) {
        try {
          const prefs = JSON.parse(localPrefs);
          // Apply local preferences immediately
          if (prefs.selectedReciter) {
            const reciterId = parseInt(prefs.selectedReciter, 10);
            const foundReciter = this.reciters.find(r => r.id === reciterId);
            if (foundReciter) {
              this.selectedReciter = foundReciter;
            }
          }
          if (prefs.selectedTranslation) {
            this.selectedTranslation = prefs.selectedTranslation;
          }
          if (prefs.fontSize) {
            this.fontSize = prefs.fontSize;
          }
          if (prefs.bookmarks) {
            this.bookmarks = prefs.bookmarks;
          }
          if (prefs.readingHistory) {
            this.readingHistory = prefs.readingHistory;
          }
          if (prefs.lastState) {
            this.currentSurah = prefs.lastState.lastSurah || 1;
            this.currentVerse = prefs.lastState.lastVerse || 1;
            this.isMushafView = prefs.lastState.isMushafView ?? false;
          }
        } catch (error) {
          console.warn('Error parsing local preferences:', error);
        }
      }
      
      // Then try to load from server if user is authenticated
      const isLoggedIn = await this.authService.isAuthenticated();
      if (isLoggedIn) {
        try {
          const serverPrefs = await this.authService.getUserPreferences();
          if (serverPrefs) {
            // Update preferences with server data
            if (serverPrefs.selectedReciter) {
              const reciterId = parseInt(serverPrefs.selectedReciter, 10);
              const foundReciter = this.reciters.find(r => r.id === reciterId);
              if (foundReciter) {
                this.selectedReciter = foundReciter;
              }
            }
            if (serverPrefs.selectedTranslation) {
              this.selectedTranslation = serverPrefs.selectedTranslation;
            }
            if (serverPrefs.fontSize) {
              this.fontSize = serverPrefs.fontSize;
            }
            if (serverPrefs.bookmarks) {
              this.bookmarks = serverPrefs.bookmarks;
            }
            if (serverPrefs.readingHistory) {
              this.readingHistory = serverPrefs.readingHistory;
            }
            if (serverPrefs.lastState) {
              this.currentSurah = serverPrefs.lastState.lastSurah || this.currentSurah;
              this.currentVerse = serverPrefs.lastState.lastVerse || this.currentVerse;
              this.isMushafView = serverPrefs.lastState.isMushafView ?? this.isMushafView;
            }
            
            // Save merged preferences back to localStorage
            this.savePreferences();
          }
        } catch (error) {
          console.warn('Error loading server preferences:', error);
        }
      }
    } catch (error) {
      console.warn('Error in loadUserPreferences:', error);
    }
  }

  private savePreferences() {
    try {
        // Get current URL state
        const currentUrl = new URL(window.location.href);
        const urlParams = new URLSearchParams(currentUrl.search);
        
        // Prepare preferences to save
        const prefsToSave = {
            selectedReciter: this.selectedReciter?.id,
            selectedTranslation: this.selectedTranslation,
            fontSize: this.fontSize,
            bookmarks: this.bookmarks || [],
            readingHistory: this.readingHistory || [],
            lastState: {
                lastSurah: this.currentSurah || 1,
                lastVerse: this.currentVerse || 1,
                isMushafView: this.isMushafView,
                timestamp: new Date().toISOString()
            },
            // Save URL state
            urlState: {
                mode: urlParams.get('mode') || 'translation',
                translation: urlParams.get('translation') || this.selectedTranslation,
                reciter: urlParams.get('reciter') || this.selectedReciter?.id,
                surah: urlParams.get('surah') || this.currentSurah,
                verse: urlParams.get('verse') || this.currentVerse,
                page: urlParams.get('page')
            }
        };
        
        // Save to localStorage
        localStorage.setItem('quran_reader_preferences', JSON.stringify(prefsToSave));
        
        // Also save current state separately for better state management
        const currentState = {
            mode: prefsToSave.urlState.mode,
            translation: prefsToSave.urlState.translation,
            reciter: prefsToSave.urlState.reciter,
            surah: prefsToSave.urlState.surah,
            verse: prefsToSave.urlState.verse,
            page: prefsToSave.urlState.page,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem('quran_reader_state', JSON.stringify(currentState));
        
        // Save to server if authenticated
        this.authService.isAuthenticated().then(isLoggedIn => {
            if (isLoggedIn) {
                this.authService.saveUserPreferences(prefsToSave).catch((error: { status?: number }) => {
                    if (error?.status !== 429) {
                        console.warn('Error saving preferences to server:', error);
                    }
                });
            }
        });
    } catch (error) {
        console.warn('Error saving preferences:', error);
    }
  }

  private async loadTranslationsData(): Promise<any[]> {
    if (this.translations.length === 0) {
      try {
        this.translations = await firstValueFrom(this.quranService.getTranslations());
      } catch (error) {
        console.warn('Error loading translations:', error);
      }
    }
    return this.translations;
  }

  private async loadRecitersData(): Promise<Reciter[]> {
    if (this.reciters.length === 0 && this.quranService.reciters?.length > 0) {
      this.reciters = this.quranService.reciters.map(reciter => ({
        ...reciter,
        surahIdentifier: reciter.identifier
      }));
      if (this.reciters.length > 0 && !this.selectedReciter) {
        this.selectedReciter = this.reciters[0];
      }
    }
    return this.reciters;
  }

  private checkDarkMode() {
    const savedMode = localStorage.getItem('darkMode');
    if (savedMode === 'true') {
      this.isDarkMode = true;
      document.documentElement.classList.add('dark');
    }
  }

  private setupViewMode() {
    const queryParams = new URLSearchParams(window.location.search);
    const modeParam = queryParams.get('mode');
    
    if (modeParam) {
      this.isMushafView = modeParam === 'mushaf';
    } else {
      // Default to translation view if no mode is specified
      this.isMushafView = false;
    }
    
    localStorage.setItem('quran_view_mode', this.isMushafView ? 'mushaf' : 'translation');
  }



  private async loadFonts(): Promise<boolean> {
    try {
      const googleFonts = [
        'Scheherazade New',
        'Noto Naskh Arabic',
        'Amiri'
      ];
      
      googleFonts.forEach(fontName => {
        const element = document.createElement('span');
        element.style.fontFamily = fontName;
        element.style.visibility = 'hidden';
        element.textContent = 'ﷺ';
        document.body.appendChild(element);
        
        setTimeout(() => {
          document.body.removeChild(element);
        }, 1000);
      });
      
      return true;
    } catch (error) {
      console.warn('Font loading failed:', error);
      return false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next(); // Signal completion for observables
    this.destroy$.complete();
    console.log('[QuranReader] Destroying component...');
    window.removeEventListener('beforeunload', this.saveStateToLocalStorageOnUnload);
    // Explicitly trigger final save if needed, though unload handler should cover it
    // this.saveStateToLocalStorageOnUnload(); // Let beforeunload handle it
    this.loadSurahSubscription?.unsubscribe();
    this.pageSubscription?.unsubscribe();
    this.removeAudioEvents();
    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer.src = '';
    }
    // Clear timers
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.historyDebounceTimer) clearTimeout(this.historyDebounceTimer);
    if (this.audioLoadingTimeout) clearTimeout(this.audioLoadingTimeout);
    if (this.urlUpdateTimeoutId) clearTimeout(this.urlUpdateTimeoutId);
    if (this.scrollDebounceTimer) clearTimeout(this.scrollDebounceTimer); // Clear scroll timer
    console.log('[QuranReader] Cleanup complete.');
  }

  // === Initialization & State Management ===

  // Scroll handler - Re-enabled and simplified
  @HostListener('window:scroll', ['$event'])
  onScroll() {
    if (!this.verses?.length || this.isAudioLoading) return; // Don't process if no verses or loading

    // Debounce the scroll handling to avoid excessive calculations
    clearTimeout(this.scrollDebounceTimer);
    this.scrollDebounceTimer = setTimeout(() => {
      if (this.isMushafView) return; // No verse tracking needed in Mushaf view scroll

      const headerOffset = 90; // Account for header height + some buffer
      let topmostVisibleVerseNumber = this.currentVerse; // Default to current if none found

      // Find the first verse element that is at or below the header offset
      for (const verse of this.verses) {
        const element = document.getElementById(`verse-${verse.number}`);
        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.top >= headerOffset) {
            topmostVisibleVerseNumber = verse.number;
            break; // Found the first visible verse, no need to check further
          }
        }
      }

      // Update currentVerse if it has changed
      if (this.currentVerse !== topmostVisibleVerseNumber) {
          // console.log(`[onScroll] Topmost visible verse changed to: ${topmostVisibleVerseNumber}`); // Optional log
          this.currentVerse = topmostVisibleVerseNumber;
          // Update URL parameters (debounced within the function)
          this.updateUrlParams(); // This will update surah, mode, etc. (verse handled by localStorage)
          // Trigger debounced history save *only* for server update
          this.debouncedSaveHistory(this.currentVerse);
      }

    }, this.SCROLL_DEBOUNCE_TIME);
  }

  private handleAudioError(error?: any) {
    this.isPlaying = false;
    this.audioPaused = true;
    this.currentPlayingVerse = null;
    this.currentlyPlaying = '';
    
    if (this.isPlayingFullSurah) {
      this.stopFullSurah();
    }
    
    if (this.audioPlayer) {
      try {
        this.audioPlayer.pause();
        this.audioPlayer.currentTime = 0;
        this.audioPlayer.removeAttribute('src');
      } catch (e) {
        console.warn('Error cleaning up audio player:', e);
      }
    }
    
    this.toastService.showError('Error playing audio. Please try again.');
  }

  public stopFullSurah(): void {
    this.isPlayingFullSurah = false;
    this.currentVerseIndex = 0;
    this.stopAndCloseAudioPlayer();
  }

  private updateCurrentSurah(pageNumber: number) {
    const displayPage = this.actualToDisplayPage(pageNumber);
    let foundSurah: number | null = null;
    let latestStartPage = -1;

    Object.entries(this.quranFlash.surahPageMap).forEach(([surahStr, startPage]) => {
      const surahNum = parseInt(surahStr);
      const surahStartPage = this.quranFlash.actualToDisplayPage(startPage);
      
      if (surahStartPage <= displayPage && surahStartPage > latestStartPage) {
        foundSurah = surahNum;
        latestStartPage = surahStartPage;
      }
    });

    if (foundSurah) {
      this.currentSurah = foundSurah;
      const surahDetails = this.surahs.find(s => s.number === foundSurah);
      if (surahDetails) {
        this.currentSurahDetails = surahDetails;
        this.surahName = surahDetails.name;
      }
    }
  }

  private updateUrlParams() {
    if (this.urlUpdateTimeoutId) {
        clearTimeout(this.urlUpdateTimeoutId);
    }

    // Use a fixed, slightly longer debounce time now that onScroll isn't calling it frequently
    const debounceTime = 400; // ms

    this.urlUpdateTimeoutId = setTimeout(() => {
        const params: any = {
            mode: this.isMushafView ? 'mushaf' : 'translation',
            // Optional: include translation/reciter if needed in URL always
            translation: this.selectedTranslation,
            reciter: this.selectedReciter?.id,
        };

        // Add surah always
        params.surah = this.currentSurah;

        // Add verse only if > 1 and in translation view
        if (!this.isMushafView && this.currentVerse && this.currentVerse > 1) {
            params.verse = this.currentVerse;
        }

        // Add page only if in mushaf view
        if (this.isMushafView && this.currentPage) {
            params.page = this.actualToDisplayPage(this.currentPage);
        }

        // No need to save localStorage state here, beforeunload handles it reliably

        // Update URL - use replaceUrl: true for state restoration/scroll updates
        // Use queryParamsHandling: 'merge' to keep other potential params
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: params,
            queryParamsHandling: 'merge',
            replaceUrl: true // Replace state as this reflects current view
        });

        this.lastUrlUpdateTime = Date.now(); // Keep track if needed elsewhere
        this.urlUpdateTimeoutId = null;
    }, debounceTime);
  }

  selectTafsir(tafsirId: string): void {
    this.selectedTafsir = tafsirId;
    if (this.selectedVerse) {
      this.showTafsir(this.selectedVerse);
    }
    this.updateUrlParams();
  }

  showTafsir(verse: QuranVerse) {
    this.selectedVerse = verse;
    
    this.quranService.getTafsir(this.currentSurah as number, verse.number, this.selectedTafsir)
      .subscribe({
        next: (response) => {
          this.tafsir = response.text;
        },
        error: (error) => {
          console.error('Error loading tafsir:', error);
          this.tafsir = 'Error loading tafsir. Please try again later.';
        }
      });
  }

  // Search related methods
  public onSearchInput(): void {
    if (this.searchQuery) {
      this.isSearching = true;
      this.quranService.searchQuran(this.searchQuery).subscribe({
        next: (response) => {
          this.searchSuggestions = response.suggestions;
          this.showSuggestions = true;
          this.isSearching = false;
        },
        error: (error) => {
          console.error('Search error:', error);
          this.isSearching = false;
        }
      });
    } else {
      this.searchSuggestions = [];
      this.showSuggestions = false;
    }
  }

  // Navigation methods
  public selectSurah(surahNumber: number): void {
    if (!surahNumber || surahNumber === this.currentSurah) return; // Don't reload if same surah

    console.log(`[selectSurah] Changing to Surah ${surahNumber}`);

    // --- Immediate State Updates ---
    this.currentSurah = surahNumber;
    this.selectedSurah = surahNumber; // Ensure dropdown selection is updated
    this.currentVerse = 1; // Reset verse to 1 when changing surah

    // Stop any ongoing audio playback
    this.stopAndCloseAudioPlayer(); 
    // --- End Immediate State Updates ---

    // --- Update URL Immediately ---
    // Use setTimeout 0 to push URL update slightly after current execution context
    // but before async data loading might interfere further.
    setTimeout(() => this.updateUrlParams(), 0);
    // --- End URL Update ---

    // --- Load Content Based on View Mode ---
    if (this.isMushafView) {
      console.log(`[selectSurah] Loading Mushaf view for Surah ${surahNumber}`);
      const surahStartPage = this.quranFlash.surahPageMap[surahNumber];
      if (surahStartPage) {
        this.currentPage = surahStartPage;
        this.displayPageNumber = this.actualToDisplayPage(surahStartPage);
        // Load the mushaf page (this will also handle URL update for page number)
        this.loadMushafPage(this.currentPage); 
      } else {
         console.warn(`[selectSurah] No page mapping found for Surah ${surahNumber}, defaulting.`);
         this.currentPage = this.FIRST_PAGE;
         this.displayPageNumber = 1;
         this.loadMushafPage(this.currentPage);
      }
    } else {
      // For translation view, load the verses
      console.log(`[selectSurah] Loading Translation view for Surah ${surahNumber}`);
      this.loadSurah(surahNumber).subscribe({
          // Optional: Add next/error handlers if specific actions needed after load
          next: () => console.log(`[selectSurah] Translation view loaded for Surah ${surahNumber}`),
          error: (err) => console.error(`[selectSurah] Error loading translation view for Surah ${surahNumber}:`, err)
      });
    }
    
    // Trigger change detection after initiating load
    this.changeDetector.markForCheck();
  }

  public goToVerse(verseNumber: number, surahNumber?: number): void {
    this.isMushafView = false; // Ensure translation view is active
    const targetSurah = surahNumber || this.currentSurah;

    if (targetSurah !== this.currentSurah) {
      // Need to load the new surah first
      this.loadSurah(targetSurah).subscribe({
        next: () => {
          // Update state AFTER loading is successful
          this.currentSurah = targetSurah;
          this.selectedSurah = targetSurah; // <-- Update dropdown selection
          this.currentVerse = verseNumber;
          this.updateUrlParams(); // Update URL
          // Use setTimeout to ensure DOM is updated after surah load
          setTimeout(() => this.scrollToVerse(verseNumber), 150);
        },
        error: (err) => {
          console.error(`Error loading Surah ${targetSurah} before scrolling:`, err);
          this.toastService.showError(`Failed to load Surah ${targetSurah}`);
        }
      });
    } else {
      // Surah is already loaded, just update verse and scroll
      this.currentVerse = verseNumber;
      this.updateUrlParams(); // Update URL
      // Use setTimeout just in case
      setTimeout(() => this.scrollToVerse(verseNumber), 50);
    }
    this.showSuggestions = false; // Hide search suggestions if open
    this.changeDetector.markForCheck(); // Ensure UI updates
  }

  // Audio control methods
  public onReciterChange(event: Event): void {
    const reciterId = Number((event.target as HTMLSelectElement).value);
    const validReciterId = this.validateReciterId(reciterId);
    const newReciter = this.reciters.find(r => r.id === validReciterId);
    
    // Only update if we found a valid reciter
    if (newReciter) {
      this.selectedReciter = newReciter;
      
      // Stop any currently playing audio
      if (this.isPlaying) {
        this.stopAndCloseAudioPlayer();
      }

      // Save preferences (debounced)
      this.debouncedSavePreferences();

      // Update URL parameters immediately
      this.updateUrlParams();

      // Load verses in background
      if (this.currentSurah) {
        this.loadVersesInBackground(this.currentSurah);
      }
    } else {
      console.error('Invalid reciter selected:', reciterId);
    }
  }

  private getCachedVerses(surahNumber: number, reciterId: number): any[] | null {
    const cacheKey = `${surahNumber}-${reciterId}`;
    const cached = this.versesCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.verses;
    }
    return null;
  }

  private setCachedVerses(surahNumber: number, reciterId: number, verses: any[]): void {
    const cacheKey = `${surahNumber}-${reciterId}`;
    this.versesCache.set(cacheKey, {
      verses: verses,
      timestamp: Date.now()
    });
  }

  private loadVersesInBackground(surahNumber: number): void {
    if (!surahNumber) return;

    // Show subtle loading indicator
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.style.opacity = '0.3';
    }

    this.loadSurahSubscription?.unsubscribe();
    this.loadSurahSubscription = this.loadSurah(surahNumber).subscribe({
      next: () => {
        // Optional: Add logic after surah change load completes
        // console.log(`[Handler for line 1656] Surah ${surahNumber} loaded successfully.`); // Removed log
        this.updateUrlParams(); // Update URL after successful load
        // Ensure isLoading is handled within loadSurah itself
      },
      error: (err) => {
        // console.error(`[Handler for line 1656] Error loading surah ${surahNumber}:`, err); // Keep this error log
        // Ensure isLoading is handled within loadSurah itself
      }
    });
  }

  public playFullSurah(): void {
    if (!this.currentSurah || !this.selectedReciter) {
      console.warn('Cannot play full surah: Missing currentSurah or selectedReciter');
      this.toastService.showError('Cannot play audio: Surah or Reciter not selected.');
      return;
    }

    const surahAudioUrl = this.quranService.getSurahAudioUrl(this.currentSurah, this.selectedReciter.id);
    if (!surahAudioUrl) {
      this.toastService.showError('Could not get audio URL for this Surah/Reciter combination.');
      return;
    }

    this.isPlayingFullSurah = true; // Set the flag before playing
    this.playAudio(surahAudioUrl, null); // Pass null for verseNumber
  }

  public toggleRepeat(): void {
    this.isRepeatEnabled = !this.isRepeatEnabled;
    if (this.audioPlayer) {
      this.audioPlayer.loop = this.isRepeatEnabled;
    }
  }

  public skipBackward(): void {
    if (this.audioPlayer) {
      this.audioPlayer.currentTime = Math.max(0, this.audioPlayer.currentTime - 10);
    }
  }

  public togglePlay(): void {
    if (!this.audioPlayer) return;
    if (this.audioPaused) {
      this.audioPlayer.play();
    } else {
      this.audioPlayer.pause();
    }
  }

  public skipForward(): void {
    if (this.audioPlayer) {
      this.audioPlayer.currentTime = Math.min(
        this.audioPlayer.duration,
        this.audioPlayer.currentTime + 10
      );
    }
  }

  // UI interaction methods
  public toggleView(): void {
    this.isMushafView = !this.isMushafView;
    
    // Prepare query parameters
    const params: any = {
      mode: this.isMushafView ? 'mushaf' : 'translation',
      translation: this.selectedTranslation,
      reciter: this.selectedReciter?.id
    };

    if (this.isMushafView) {
      // When switching to mushaf view, get the page number for current surah
      const surahStartPage = this.quranFlash.surahPageMap[this.currentSurah || 1];
      if (surahStartPage) {
        this.currentPage = surahStartPage;
        this.displayPageNumber = this.actualToDisplayPage(surahStartPage);
        params.page = this.displayPageNumber;
      } else {
        this.currentPage = this.FIRST_PAGE;
        this.displayPageNumber = 1;
        params.page = 1;
      }
      params.surah = this.currentSurah;
      this.loadMushafPage(this.currentPage);
    } else {
      // When switching to translation view
      params.surah = this.currentSurah;
      this.loadSurah(this.currentSurah || 1).subscribe();
    }

    // Save preferences (debounced) after view toggle
    this.debouncedSavePreferences();

    // Update URL parameters
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      replaceUrl: true
    });
  }

  public toggleVerseTranslation(event: Event, verseNumber: number): void {
    event.preventDefault();
    const verseElement = (event.target as HTMLElement).closest('.verse-container');
    if (verseElement) {
      const translation = verseElement.querySelector('.translation');
      if (translation) {
        translation.classList.toggle('show');
      }
    }
  }

  public showWordTranslation(word: any, event: Event): void {
    event.stopPropagation();
    this.selectedWord = word;
  }

  // Page navigation methods
  public nextPage(): void {
    if (this.displayPageNumber > 1) {
      this.loadMushafPage(this.displayToActualPage(this.displayPageNumber - 1));
    }
  }

  public previousPage(): void {
    if (this.displayPageNumber < this.DISPLAY_TOTAL) {
      this.loadMushafPage(this.displayToActualPage(this.displayPageNumber + 1));
    }
  }

  public goToPage(): void {
    if (this.displayPageNumber >= 1 && this.displayPageNumber <= this.DISPLAY_TOTAL) {
      this.loadMushafPage(this.displayToActualPage(this.displayPageNumber));
    }
  }

  // View control methods
  public togglePageView(): void {
    this.isDoublePageView = !this.isDoublePageView;
  }

  public zoomMushaf(delta: number): void {
    this.mushafZoom = Math.min(Math.max(0.5, this.mushafZoom + delta), 2.0);
  }

  // Add the methods in their correct locations
  public selectSearchResult(result: any): void {
    if (result.type === 'surah') {
      this.selectSurah(result.number);
    } else {
      this.goToVerse(result.verse);
    }
  }

  public logTranslationChange(event: any): void {
    console.log('Translation changed:', event);
  }

  public selectTranslation(translationId: string): void {
    // Update UI immediately
    this.selectedTranslation = translationId;
    
    // Save preferences (debounced)
    this.debouncedSavePreferences();
    
    // Update URL params
    this.updateUrlParams();
    
    // Load new translation in background
    if (this.currentSurah) {
      this.loadVersesInBackground(this.currentSurah);
    }
  }

  public playCurrentSurah(): void {
    if (this.isPlayingFullSurah) {
      if (this.audioPlayer) {
        this.audioPlayer.pause();
        this.audioPaused = true;
      }
      this.isPlayingFullSurah = false;
    } else {
      this.playFullSurah();
    }
  }

  loadVerses(surahNumber: number = this.currentSurah || 1): void {
    this.isAudioLoading = true;
    this.loadSurahSubscription?.unsubscribe();
    this.loadSurahSubscription = this.loadSurah(surahNumber).subscribe({
      next: () => {
        // Optional: Add logic after surah change load completes
        console.log(`[Handler for line 1656] Surah ${surahNumber} loaded successfully.`);
        this.updateUrlParams(); // Update URL after successful load
        // Ensure isLoading is handled within loadSurah itself
      },
      error: (err) => {
        console.error(`[Handler for line 1656] Error loading surah ${surahNumber}:`, err);
        // Ensure isLoading is handled within loadSurah itself
      }
    });
  }

  private loadCurrentSurah(): void {
    // Load the current surah data
    if (this.currentSurah) {
      // Implementation will depend on your Quran data service
      // This is just a placeholder
      // console.log('Loading surah:', this.currentSurah);
    }
  }

  private setupKeyboardNavigation(): void {
    // Setup keyboard navigation handlers
    document.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        this.navigateToNextVerse();
      } else if (event.key === 'ArrowLeft') {
        this.navigateToPreviousVerse();
      }
    });
  }

  private navigateToNextVerse(): void {
    // Implementation for next verse navigation
    // console.log('Navigate to next verse');
  }

  private navigateToPreviousVerse(): void {
    // Implementation for previous verse navigation
    // console.log('Navigate to previous verse');
  }

  // Add this method to validate reciter ID
  private validateReciterId(reciterId: number): number {
    if (this.reciters.some(r => r.id === reciterId)) {
      return reciterId;
    }
    return this.reciters[0]?.id || 1;
  }

  private loadReadingHistory(): Promise<void> {
    // Explicitly type the response
    return firstValueFrom(this.authService.getReadingHistory()).then((response: { success: boolean; history: any[] }) => {
      if (response.success) {
        this.readingHistory = response.history;
      } else {
        // Handle the case where reading history is not successfully retrieved
        console.error('Error retrieving reading history'); // Removed response.message
      }
    });
  }

  // Add these methods for page number conversion
  private actualToDisplayPage(actualPage: number): number {
    return actualPage - 9;
  }

  private displayToActualPage(displayPage: number): number {
    return displayPage + 9;
  }

  private async loadMushafPage(pageNumber: number) {
    this.isAudioLoading = true;
    this.pageImageUrl = ''; // Reset image URLs
    this.secondPageImageUrl = ''; 
    
    try {
      if (pageNumber < this.FIRST_PAGE || pageNumber > this.LAST_PAGE) {
        pageNumber = this.FIRST_PAGE;
      }
      
      this.currentPage = pageNumber;
      this.displayPageNumber = this.actualToDisplayPage(pageNumber);
      // Set the main page image URL
      this.pageImageUrl = this.quranFlash.getPageImageUrl(pageNumber);

      // Handle double page view
      if (this.isDoublePageView) {
          const secondPageActualNumber = pageNumber - 1;
          if (secondPageActualNumber >= this.FIRST_PAGE) {
              this.secondPageImageUrl = this.quranFlash.getPageImageUrl(secondPageActualNumber);
          }
      }
      
      // Preload images
      const preloadPromises: Promise<void>[] = [];
      if (this.pageImageUrl) {
          preloadPromises.push(this.preloadImage(this.pageImageUrl));
      }
      if (this.secondPageImageUrl) {
          preloadPromises.push(this.preloadImage(this.secondPageImageUrl));
      }

      // Only proceed if there are images to load
      if (preloadPromises.length > 0) {
        await Promise.all(preloadPromises);
      } else if (this.pageImageUrl) {
        // Fallback for single image load just in case (though covered by above)
        await this.preloadImage(this.pageImageUrl);
      } else {
         console.warn(`[loadMushafPage] No image URL generated for page ${pageNumber}`);
         // Potentially throw an error or handle the case where no image could be determined
      }
      
      this.updateCurrentSurah(pageNumber);
      
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {
          mode: 'mushaf',
          page: this.displayPageNumber
        },
        replaceUrl: true
      });
      
    } catch (error) {
      console.error('Error loading mushaf page:', error);
      this.toastService.show('Error loading Quran page');
    } finally {
      this.isAudioLoading = false;
    }
  }

  private preloadImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = (errorEvent) => {
          // More detailed error logging
          console.error(`Failed to load image. URL: ${url}. Error:`, errorEvent);
          reject(new Error(`Failed to load image: ${url}`));
      };
      img.src = url;
    });
  }

  private removeAudioEvents(): void {
    if (this.audioPlayer) {
      this.audioPlayer.removeEventListener('timeupdate', this.onTimeUpdate);
      this.audioPlayer.removeEventListener('loadedmetadata', this.onLoadedMetadata);
      this.audioPlayer.removeEventListener('ended', this.onEnded);
      this.audioPlayer.removeEventListener('error', this.onError);
      this.audioPlayer.removeEventListener('pause', this.onPause);
      this.audioPlayer.removeEventListener('play', this.onPlay);
      this.audioPlayer.removeEventListener('waiting', () => this.isAudioLoading = true);
      this.audioPlayer.removeEventListener('playing', () => this.isAudioLoading = false);
      this.audioPlayer.removeEventListener('canplay', () => this.isAudioLoading = false);
    }
  }

  // Renamed from attemptPlayback for clarity
  private startPlaybackWhenReady(): void {
    if (this.audioPlayer && !this.isPlaying && this.isAudioLoading) { // Only play if loading and not already playing
        console.log('Attempting to play audio now that it is ready...');
        this.audioPlayer.play()
            .then(() => {
                console.log('Audio play() promise resolved after ready.');
                // isPlaying and isAudioLoading state will be updated by 'play' and 'canplay' event handlers
            })
            .catch(err => {
                console.error('Error starting playback after ready:', err);
                this.handleAudioError('Could not start audio playback.');
            });
    }
  }

  // --- Event Handlers ---

  private updateRecitingVerse(currentTime: number): void {
    // Implement logic to update reciting verse based on current time
    // This is a placeholder implementation
    // console.log('Current time:', currentTime); // Removed log
  }

  // Add the missing method definition here
  private loadVerseTimings(surahNumber: number): void {
    this.quranService.getVerseTimings(surahNumber).subscribe({
      next: (timings) => {
        this.verseTimings = timings;
        // console.log(`[loadVerseTimings] Loaded timings for Surah ${surahNumber}`, this.verseTimings); // Removed log
        // Potentially trigger change detection if needed, although NgZone might handle it
        // this.changeDetector.detectChanges(); 
      },
      error: (err) => {
        // console.error(`[loadVerseTimings] Error loading timings for Surah ${surahNumber}:`, err); // Keep this error log for debugging
        this.verseTimings = []; // Clear timings on error
      }
    });
  }

  // --- End Event Handlers ---

  // Add this function back
  trackVerse(index: number, verse: QuranVerse): number {
    return verse.number; // Track by verse number
  }

  goToHistoryEntry(entry: { surah: number, verse: number }): void {
    this.isMushafView = false; // Ensure translation view is active
    const targetSurah = entry.surah;
    const targetVerse = entry.verse;

    if (targetSurah !== this.currentSurah) {
      // Load the new surah first
      this.loadSurah(targetSurah).subscribe({
        next: () => {
          // Update state AFTER loading is successful
          this.currentSurah = targetSurah;
          this.selectedSurah = targetSurah; // <-- Update dropdown selection
          this.currentVerse = targetVerse;
          this.updateUrlParams(); // Update URL
          // Longer delay to allow DOM update after surah load
          setTimeout(() => this.scrollToVerse(targetVerse), 150);
        },
        error: (err) => {
          console.error(`Error loading Surah ${targetSurah} from history:`, err);
          this.toastService.showError(`Failed to load Surah ${targetSurah}`);
        }
      });
    } else {
      // Surah is already loaded, just update verse and scroll
      this.currentVerse = targetVerse;
      this.updateUrlParams(); // Update URL
      setTimeout(() => this.scrollToVerse(targetVerse), 50); // Short delay
    }
    this.changeDetector.markForCheck(); // Ensure UI updates
  }
}