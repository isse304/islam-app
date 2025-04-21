export {};

import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ViewChild, ElementRef, ChangeDetectorRef, Injector, NgZone, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml, Title, Meta } from '@angular/platform-browser';
import { Observable, Subscription, Subject, of, forkJoin, from, throwError, timer, combineLatest, EMPTY, firstValueFrom, BehaviorSubject } from 'rxjs';
import { catchError, map, switchMap, debounceTime, distinctUntilChanged, finalize, take, filter, tap, retry, takeUntil, mergeMap, shareReplay, timeout } from 'rxjs/operators';
import { trigger, state, style, transition, animate } from '@angular/animations';

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

import { QuranService, QuranVerse, Reciter, Surah, Juz, WordDetails } from '../../../services/quran.service';
import { SttService } from '../../../services/stt.service';
import { QuranFlashService } from '../../../services/quran-flash.service';
import { ToastService } from '../../../services/toast.service';
import { environment } from '../../../../environments/environment';
import { ClickOutsideDirective } from '../../../directives/click-outside.directive';
import { AppUser, FirebaseAuthService, UserPreferences, BookmarkResponse, ReadingHistoryResponse } from '../../../services/firebase-auth.service';
import { ReadingHistory } from '../../../interfaces/reading-history.interface'; // Add import

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
    // -- REMOVE ScrollingModule from imports --
    // ScrollingModule
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
  // Add missing word audio properties
  wordProgress: number = 0;
  wordCurrentTime: string = '0:00';
  wordDuration: string = '0:00';
  private verseTimestamps: { [key: string]: number } = {};
  private verseCheckInterval: any;
  private verseTimings: Array<{
    verse_number: number;
    timestamp_from: number;
    timestamp_to: number;
  }> = [];
  private scrollBuffer: number = 300; // 300ms buffer between scrolls
  private verseBuffer: number = 0.1; // 100ms buffer for verse timing
  isMushafView: boolean = false;
  arabicFontSize: number = 32;
  mushafPages: MushafPage[] = [];
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

  readingHistory: ReadingHistory[] = [];  // Update type from any[]

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
  private readonly SCROLL_DEBOUNCE_TIME = 200; // Increased debounce time slightly

  // Define the state key
  private readonly quranReaderStateKey = 'quranReaderState';

  // Add state for minimized controls
  public isControlsMinimized = false; // Start expanded by default

  // +++ ADD state for main controls minimized +++
  public isMainControlsMinimized = false; // Start expanded

  // +++ ADD property to track last scroll position +++
  private lastScrollTop: number = 0;
  private readonly scrollThreshold = 10; // Pixels to scroll before reacting

  // State for main controls
  public isPopupOpen = false; // Popup is initially closed

  // ++ NEW State for Audio Player ++ 
  public isAudioPlayerMinimized = false; 

  // ++ NEW State for Mobile Mushaf Bottom Bar ++
  public isMobileMushafBarVisible = true; // Added this line
  private mobileBarHideTimeout: any = null;

  private routeParamsSub: Subscription | null = null; // Subscription for query params
  // initialModeDetermined: boolean = false; // <<< REMOVE this flag

  // ++ Add properties to store state before switching to Mushaf ++ 
  private lastTranslationSurah: number = 1;
  private lastTranslationVerse: number = 1;
  private lastMushafPage: number = 1; // Actual page number (10-613)
  private isTogglingView: boolean = false; // Flag to prevent concurrent toggles
  private ignoreNextQueryParamChange: boolean = false; // Flag to ignore URL update from toggleView
  private initialLoadComplete: boolean = false; // Flag for initial load

  isLoading: boolean = false; // Add isLoading flag back

  // Method to toggle the minimized state
  public toggleControlsView(): void {
    this.isControlsMinimized = !this.isControlsMinimized;
    // Optionally, add change detection if needed, though usually handled by Angular
    this.changeDetector.markForCheck();
  }

  // +++ ADD Method to toggle the main controls minimized state +++
  public toggleMainControlsView(source: 'bubble' | 'minimizeButton' | 'backdrop' | 'internalPopupMinimize' = 'minimizeButton'): void {
    if (source === 'bubble') {
      // Clicking the bubble (mobile or desktop minimized) ALWAYS opens the popup.
      this.isPopupOpen = true;
    } else if (source === 'minimizeButton') {
      // Clicking minimize in the *in-flow* controls (DESKTOP ONLY)
      if (!this.isMobile) { // Add safety check
        this.isMainControlsMinimized = true;
        this.isPopupOpen = false;
      }
    } else if (source === 'internalPopupMinimize' || source === 'backdrop') {
      // Clicking minimize *inside* the popup, or the backdrop
      this.isPopupOpen = false;
      // isMainControlsMinimized remains true
    }

    this.changeDetector.markForCheck();
  }

  @ViewChild('mainControlsElement') mainControlsElement!: ElementRef; // Ensure this ViewChild exists

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
    private ngZone: NgZone,
    private titleService: Title, // Inject Title
    private metaService: Meta    // Inject Meta
  ) {
    // Don't set reciters here, wait for ngOnInit
  }

  // Define the key for saving navigation state
  private readonly lastNavStateKey = 'quranReaderLastNavState';

  // ++ STEP 1: Add BehaviorSubject for bookmarks ++
  private bookmarksSubject = new BehaviorSubject<string[]>([]);
  bookmarks$ = this.bookmarksSubject.asObservable();

  // ++ STEP 2: Add BehaviorSubject for displayPageNumber ++
  private displayPageNumberSubject = new BehaviorSubject<number>(1);
  displayPageNumber$ = this.displayPageNumberSubject.asObservable();

  // ++ STEP 3: Create combined Observable for bookmark status ++
  isCurrentPageBookmarked$: Observable<boolean> = combineLatest([
    this.bookmarksSubject,     // Use the subject here
    this.displayPageNumberSubject // Use the subject here
  ]).pipe(
    map(([bookmarks, displayPage]) => {
      const bookmarkString = `mushaf:${displayPage}`;
      return bookmarks.includes(bookmarkString);
    }),
    distinctUntilChanged(), // Only emit when the boolean value actually changes
    shareReplay(1) // Share the last emitted value with new subscribers
  );

  async ngOnInit() {
    this.isLoading = true;
    this.changeDetector.markForCheck();
    ////console.log('%c[QuranReader ngOnInit] Starting initialization...', 'color: green; font-weight: bold;');

    try {
        // 1. Load essential non-user data first (can run in parallel)
        await Promise.all([
            this.loadSurahs(),
            this.loadTranslationsData(),
            this.loadRecitersData(),
            // this.loadReadingHistory(), // History can load later if needed
            // this.loadBookmarks() // Bookmarks can load later if needed
        ]);
        this.checkDarkMode();

        // 2. Load user preferences and WAIT for them
        // Store prefs in a local variable for easier access in this scope
        const prefs = await this.loadUserPreferences(true); 

        // 3. Determine Initial State (URL > Defaults) - Simplified
        let initialSurah: number = 1;
        let initialVerse: number = 1;
        let initialPage: number = 1; // Display page (1-604)
        let initialModeIsMushaf: boolean = false;
        let stateSource: string = 'defaults (forced translation)';

        const queryParams = this.route.snapshot.queryParams;
        ////console.log(`%c[QuranReader ngOnInit] Query Params:`, 'color: green;', queryParams);
        const routePage = queryParams['page'] ? parseInt(queryParams['page'], 10) : null;
        const routeMode = queryParams['mode'];
        const routeSurah = queryParams['surah'] ? parseInt(queryParams['surah'], 10) : null;
        const routeVerse = queryParams['verse'] ? parseInt(queryParams['verse'], 10) : null;

        // --- Simplified Prioritization Logic ---

        // 1. URL Parameter Check (Highest Priority)
        // Check if URL specifies Mushaf mode and a page
        if (routeMode === 'mushaf' && routePage) {
            // URL requests Mushaf view
            stateSource = 'url (mushaf)';
            initialModeIsMushaf = true; // Set to Mushaf based on URL
            initialPage = (routePage >= 1 && routePage <= this.DISPLAY_TOTAL) ? routePage : 1;
            const actualPage = this.displayToActualPage(initialPage);
            initialSurah = this.getSurahFromPage(actualPage) || 1;
            initialVerse = 1; // Verse irrelevant for Mushaf page mode
            this.currentPage = actualPage;
        } 
        // Check if URL specifies a Surah or Verse (implies Translation mode)
        else if (routeSurah || routeVerse) {
            // URL requests Translation view (implicitly or explicitly)
            stateSource = 'url (translation)';
            initialModeIsMushaf = false; // Set to Translation based on URL
            initialSurah = (routeSurah && routeSurah >= 1 && routeSurah <= 114) ? routeSurah : 1;
            const surahInfo = this.surahs.find(s => s.number === initialSurah);
            const maxVerse = surahInfo ? surahInfo.numberOfAyahs : 1;
            initialVerse = (routeVerse && routeVerse >= 1 && routeVerse <= maxVerse) ? routeVerse : 1;
            // Determine page based on Surah start for Translation view
            initialPage = this.actualToDisplayPage(this.quranFlash.surahPageMap[initialSurah] || this.FIRST_PAGE);
            this.currentPage = this.displayToActualPage(initialPage);
        } 
        // 2. Defaults (No relevant URL params) -> Force Translation
        else {
            stateSource = 'defaults (forced translation)';
            initialModeIsMushaf = false; // Always default to translation now
            // Load last *translation* state if available, otherwise pure defaults
            initialSurah = prefs?.lastState?.lastTranslationSurah || 1;
            const surahInfo = this.surahs.find(s => s.number === initialSurah);
            const maxVerse = surahInfo ? surahInfo.numberOfAyahs : 1;
            initialVerse = (prefs?.lastState?.lastTranslationVerse && prefs.lastState.lastTranslationVerse >= 1 && prefs.lastState.lastTranslationVerse <= maxVerse) ? prefs.lastState.lastTranslationVerse : 1;
            initialPage = this.actualToDisplayPage(this.quranFlash.surahPageMap[initialSurah] || this.FIRST_PAGE);
            this.currentPage = this.displayToActualPage(initialPage);
        }

        //console.log(`%c[QuranReader ngOnInit] Determined Source: ${stateSource}`, 'color: green; font-weight: bold;');
        //console.log(`%c[QuranReader ngOnInit] Applying Initial State -> Mode: ${initialModeIsMushaf ? 'Mushaf' : 'Translation'}, S:${initialSurah} V:${initialVerse} DisplayP:${initialPage} ActualP:${this.currentPage}`, 'color: green; font-weight: bold;');

        // --- Apply Determined Initial State ---
        this.isMushafView = initialModeIsMushaf;
        this.currentSurah = initialSurah;
        this.selectedSurah = initialSurah;
        this.currentVerse = initialVerse;
        this.displayPageNumberSubject.next(initialPage);
        this.pageInput = initialPage;
        this.updateTitleAndMeta(initialSurah);
        this.changeDetector.markForCheck();

        // +++ ADD LOG BEFORE loadInitialContent +++
        ////console.log(`%c[QuranReader ngOnInit] BEFORE loadInitialContent. isMushafView: ${this.isMushafView}, CurrentPage: ${this.currentPage}, DisplayPage: ${this.displayPageNumberSubject.value}`, 'color: blue');
        // --- Load Initial Content ---
        this.loadInitialContent(this.currentSurah, this.currentVerse, this.isMushafView, initialPage);
        // +++ ADD LOG AFTER loadInitialContent +++
        ////console.log(`%c[QuranReader ngOnInit] AFTER loadInitialContent call.`, 'color: blue');

        // --- Post-Content Load Setup ---
        this.initialLoadComplete = true;
        //////console.log('%c[QuranReader ngOnInit] Initialization complete. initialLoadComplete = true.', 'color: green; font-weight: bold;');
        this.subscribeToRouteParams();
        this.loadSecondaryData().catch(err => console.warn("Error loading secondary data:", err)); // Keep this one warn

    } catch (error) {
        console.error('[ngOnInit ERROR] Critical error during initialization:', error);
        this.toastService.showError('Failed to initialize Quran Reader.');
        this.isLoading = false;
        this.initialLoadComplete = true;
        this.changeDetector.markForCheck();
    }
    // Subscribe to user changes
    this.authService.user$.pipe(takeUntil(this.destroy$)).subscribe(currentUser => {
      this.user = currentUser;
      this.changeDetector.markForCheck();
    });
  }

  // Helper to update title and meta tags
  private updateTitleAndMeta(surahNumber: number): void {
    const surahDetails = this.surahs.find(s => s.number === surahNumber);
    const surahName = surahDetails ? `${surahDetails.englishName} (${surahDetails.name})` : `Surah ${surahNumber}`;
    const title = `${surahName} - Quran Reader | Nura AI`;
    const description = `Read and listen to Surah ${surahName} from the Holy Quran online with Nura AI. Includes translation, tafsir, audio, and Mushaf view.`;

    this.titleService.setTitle(title);
    this.metaService.updateTag({ name: 'description', content: description });
    // Add other relevant meta tags if needed (e.g., Open Graph)
  }

  public loadSurah(surahNumber: number): Observable<void | null> {
    this.isAudioLoading = true;
    // //////console.log(`[loadSurah ENTRY] Loading Surah ${surahNumber}. Current component state Surah: ${this.currentSurah}`);
    // *** Set currentSurah immediately when starting load ***
    this.currentSurah = surahNumber;
    this.selectedSurah = surahNumber; // Also sync dropdown immediately
    // REMOVE this line: this.currentVerse = 1; // Reset verse

    this.changeDetector.markForCheck(); // Mark for check after immediate state update

    // Return the observable stream
    return this.quranService.getSurah(surahNumber, this.selectedTranslation, this.selectedReciter.id).pipe(
      map(verses => {
        // //////console.log(`[loadSurah MAP] Received ${verses?.length} verses for Surah ${surahNumber}.`);
        this.verses = verses;
        this.currentSurahDetails = this.surahs.find(s => s.number === surahNumber);
        // this.currentSurah = surahNumber; // Already set above
        // //////console.log(`[loadSurah MAP] AFTER assigning verses. Current Surah: ${this.currentSurah}, Selected Surah: ${this.selectedSurah}`);

        this.setCachedVerses(surahNumber, this.selectedReciter.id, verses);
        this.isAudioLoading = false;
        this.changeDetector.markForCheck(); // Mark again after verses are loaded

        // REMOVE Update URL params call from here
        // this.updateUrlParams();
      }),
      catchError(error => {
        console.error(`[loadSurah ERROR] Error loading surah ${surahNumber}:`, error);
        this.isAudioLoading = false;
        this.toastService.showError('Failed to load surah data.');
        this.changeDetector.markForCheck();
        return of(null);
      })
    );
  }

  // *** UPDATED HELPER METHOD ***
  // Helper to load initial content based on determined state
  private loadInitialContent(surah: number, verse: number, isMushaf: boolean, targetDisplayPage?: number): void { 
    ////console.log(`%c[loadInitialContent] Called. isMushaf: ${isMushaf}, TargetDisplayPage: ${targetDisplayPage}, CurrentPage: ${this.currentPage}`, 'color: magenta'); // +++ ADD LOG +++
    if (isMushaf) {
      // Use the explicitly passed targetDisplayPage if available, otherwise fallback to currentPage
      const pageToLoad = targetDisplayPage ? this.displayToActualPage(targetDisplayPage) : this.currentPage;
      ////console.log(`%c[loadInitialContent] Loading Mushaf - Calling loadMushafPage(${pageToLoad})`, 'color: magenta'); // +++ ADD LOG +++
      this.loadMushafPage(pageToLoad);
    } else {
       // Translation Mode
       this.isMushafView = false; // Ensure view state is correct
       // Set Surah immediately, but NOT verse yet
       this.currentSurah = surah;
       this.selectedSurah = surah; // Sync dropdown
       // // //////console.log(`[loadInitialContent] Translation mode. Set currentSurah to ${this.currentSurah}. Current verse still ${this.currentVerse}. Calling loadSurah(${surah}).`);

       this.loadSurahSubscription?.unsubscribe();
       this.loadSurahSubscription = this.loadSurah(surah).pipe(
          finalize(() => {
              // // //////console.log(`[loadInitialContent FINALIZE] Surah ${surah} load finished.`);
              this.isLoading = false;
              // *** Set the target verse *after* surah load completes ***
              this.currentVerse = verse;
              // // //////console.log(`[loadInitialContent FINALIZE] Set currentVerse to ${this.currentVerse}.`);

              this.changeDetector.markForCheck(); // Ensure verse update is checked
              // Scroll to verse AFTER loading finishes and verse is set
              setTimeout(() => {
                  // // //////console.log(`[loadInitialContent FINALIZE setTimeout] Scrolling to verse ${verse}.`);
                  this.scrollToVerse(verse); // Now scroll to the correct verse
              }, 200); // Keep delay for rendering
              this.updateUrlParams(); // URL will now have correct surah and verse
          })
       ).subscribe({
            // next: () => { // //////console.log(`[loadInitialContent] loadSurah(${surah}) emitted next.`); },
            error: (err) => {
              console.error(`[loadInitialContent ERROR] Error in loadSurah(${surah}) subscription:`, err);
              this.isLoading = false; // Ensure loading is stopped on error
              this.changeDetector.markForCheck();
            },
            // complete: () => { // //////console.log(`[loadInitialContent] loadSurah(${surah}) completed.`); }
       });
    }
  }

  // *** SIMPLIFIED HELPER METHOD ***
  // Helper to load non-essential data (preferences, history, bookmarks)
  private async loadSecondaryData(): Promise<void> {
    // // //////console.log('[QuranReader] Loading secondary data...');
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
 
    // --- End of localStorage restoration ---

    // Setup view mode based on the potentially restored state
    this.setupViewMode();

    // // //////console.log('[QuranReader] Secondary data loading complete.');
    //this.hideLoadingUI(); // <-- Remove argument
    this.changeDetector.markForCheck(); // Ensure UI reflects loaded data (final check)
  }



  private scrollToVerse(verseNumber: number, maxAttempts: number = 5): boolean {
    if (!verseNumber || this.isMushafView) return false;
    // // //////console.log(`[scrollToVerse] Called with verseNumber: ${verseNumber}`);

    let scrolledSuccessfully = false;

    const attemptScroll = (attempts: number = 0) => {
      const verseElement = document.getElementById(`verse-${verseNumber}`);
      // // //////console.log(`[scrollToVerse Attempt ${attempts + 1}] Element lookup for 'verse-${verseNumber}':`, verseElement ? 'Found' : 'NOT Found');

      if (verseElement) {
        // ++ Add a small delay before calculating position and scrolling ++
        setTimeout(() => {
          // // //////console.log(`[Scroll attempt ${attempts + 1}] Found element for verse ${verseNumber}. Preparing to scroll...`);
          document.querySelectorAll('.highlighted-verse').forEach(el => {
            el.classList.remove('.highlighted-verse');
          });
          verseElement.classList.add('highlighted-verse');

          // ++ Increased Manual Offset Again ++ 
          const headerOffset = 500; // Increased offset further. Adjust based on actual header height.
          const elementPosition = verseElement.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.scrollY - headerOffset;
          window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
          // ++ End manual offset calculation ++ 

          // Update state *after* initiating scroll (or slightly delayed)
          // Use setTimeout to ensure state update happens after scroll starts processing
          setTimeout(() => {
            this.currentVerse = verseNumber;
            // Do not update URL params here, let the scroll listener handle it if needed
          }, 50); // Small delay for state update

          // Remove highlight after scroll settles + delay
          setTimeout(() => {
            verseElement.classList.remove('.highlighted-verse');
          }, 2500); // Longer highlight duration

          scrolledSuccessfully = true;
        }, 50); // 50ms delay before scrolling logic executes
        return; // Exit attemptScroll early as the timeout will handle the rest
      } else if (attempts < maxAttempts) {
        setTimeout(() => attemptScroll(attempts + 1), 100 + attempts * 50);
      } else {
        // console.warn(`[scrollToVerse] Failed to find verse element ${verseNumber} after ${maxAttempts} attempts.`);
      }
    };

    attemptScroll();
    return scrolledSuccessfully;
  }

  private debouncedSavePreferences() {
        const currentUrl = new URL(window.location.href);
        const urlParams = new URLSearchParams(currentUrl.search);
    // Debounce preference saving
    // REMOVE Debounce Timer logic
    // if (this.debounceTimer) {
    //   clearTimeout(this.debounceTimer);
    // }
    // this.debounceTimer = setTimeout(async () => {

    // --- Make the save logic run immediately --- 
    const runSave = async () => { 
      // Get the latest bookmarks directly from the BehaviorSubject
      // Ensure this line is REMOVED: const latestBookmarks = this.authService.userDataSubject.value?.bookmarks || [];
      
      const prefsToSave = {
        selectedReciter: this.selectedReciter?.id,
        selectedTranslation: this.selectedTranslation || '131',
        fontSize: this.fontSize || 24,
        // *** Ensure this uses component's bookmarks property ***
        // readingHistory is handled separately
        lastState: this.isMushafView 
          ? { // Mushaf State
              lastMushafPage: this.currentPage || this.FIRST_PAGE,
              isMushafView: true,
              isMainControlsMinimized: this.isMainControlsMinimized,
              timestamp: new Date().toISOString()
            }
          : { // Translation State
              lastTranslationSurah: this.currentSurah || 1,
              lastTranslationVerse: this.currentVerse || 1,
              isMushafView: false,
              isMainControlsMinimized: this.isMainControlsMinimized,
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

      // //////console.log('[QuranReader savePreferences] Attempting to save:', JSON.stringify(prefsToSave)); // Log the object being saved

      try {
        // Save locally immediately for responsiveness
        localStorage.setItem('quran_reader_preferences', JSON.stringify(prefsToSave));

        // Save to server (no need to await if we don't need the result immediately)
        this.authService.saveUserPreferences(prefsToSave).then(() => {
          // //////console.log('[QuranReader savePreferences] Server save successful (async).');
        }).catch(error => {
          console.warn('[QuranReader savePreferences] Server save failed (async):', error);
          // Optionally notify user or retry
        });

      } catch (error) {
        console.error('[QuranReader savePreferences] Error saving preferences:', error);
      }
    };

    runSave(); // Execute the save logic immediately

    // REMOVE Debounce Timer closing bracket
    // }, this.DEBOUNCE_TIME);
  }

  private debouncedSaveHistory(location: { type: 'verse', surah: number, verse: number } | { type: 'page', page: number }) {
    clearTimeout(this.historyDebounceTimer);
    // //////console.log(`[QuranReader debouncedSaveHistory] Timer cleared. Queuing save for:`, location);

    this.historyDebounceTimer = setTimeout(async () => {
      // //////console.log(`[QuranReader debouncedSaveHistory] Timeout executed for:`, location);
      // //////console.log(`[QuranReader debouncedSaveHistory] Checking conditions: this.user exists? ${!!this.user}`);

      if (!this.user) {
        // //////console.log('[QuranReader debouncedSaveHistory] User not logged in, SKIPPING history save.');
        return;
      }
      
      // Prepare the entry to be stored locally and potentially sent to backend
      // We store the type along with the data for easier filtering later
      const historyEntry = {
        ...location,
        timestamp: new Date().toISOString()
      };

      // --- REMOVE localStorage update for lastState ---
      /*
      try {
          const prefs = JSON.parse(localStorage.getItem('quran_reader_preferences') || '{}');
          // ... (code to update prefs.readingHistory) ...
          prefs.lastState = { // <--- REMOVE THIS BLOCK
              lastSurah: this.currentSurah,
              lastVerse: verseNumber,
              isMushafView: this.isMushafView,
              timestamp: new Date().toISOString()
          };
          localStorage.setItem('quran_reader_preferences', JSON.stringify(prefs));
          // ... (code to update quran_reader_state) ...
      } catch (error) {
          console.warn('Error saving to localStorage:', error);
      }
      */

      // Only save the specific history entry to the server history log
      // *** USE THE NEW location object format ***
      let historyDataToSave: { surah: number; verse: number; } | { page: number; } | null = null;
      let isValidLocation = false;
      if (location.type === 'verse') {
          // *** FIX: Pass correct arguments to isValidVerseForHistory ***
          // ++ Add explicit type casting ++ 
          const verseLocation = location as { type: 'verse', surah: number, verse: number };
          // ++ Temporarily comment out validation check ++ 
          // if (this.isValidVerseForHistory(verseLocation.surah, verseLocation.verse)) { 
              historyDataToSave = { surah: verseLocation.surah, verse: verseLocation.verse };
              isValidLocation = true;
          // } 
      } else if (location.type === 'page') {
          if (location.page >= this.FIRST_PAGE && location.page <= this.LAST_PAGE) {
              historyDataToSave = { page: location.page };
              isValidLocation = true;
          }
      }

      if (!isValidLocation || !historyDataToSave) {
          //////console.log('[QuranReader debouncedSaveHistory] Invalid location data, skipping server save.', location);
          return;
      }

      try {
          // //////console.log(`[QuranReader debouncedSaveHistory] Calling authService.saveReadingHistory with:`, historyDataToSave);
          if (historyDataToSave && 'surah' in historyDataToSave && 'verse' in historyDataToSave) { // Check if it's a verse entry
            // *** UPDATE: Call the unified saveReadingHistory method with a single location object ***
            await this.authService.saveReadingHistory({ type: 'verse', surah: historyDataToSave.surah, verse: historyDataToSave.verse });
          } else if (historyDataToSave && 'page' in historyDataToSave) { // Check if it's a page entry
              // Determine the surah for the current page
              const currentSurahOnPage = this.getSurahFromPage(historyDataToSave.page);
              if (currentSurahOnPage === null) {
                  console.warn(`[debouncedSaveHistory] Could not determine Surah for page ${historyDataToSave.page}, skipping save.`);
                  return; // Don't save if surah is unknown
              }
              // Call saveReadingHistory including the surah
              await this.authService.saveReadingHistory({
                  type: 'page',
                  page: historyDataToSave.page,
                  surah: currentSurahOnPage // Include the determined surah
              });
          } else {
              //////console.log('[QuranReader debouncedSaveHistory] Skipping save for invalid data.');
          }

          // Update local readingHistory array optimistically
          // Ensure historyEntry is created with a Date timestamp before this point
          const currentHistory = Array.isArray(this.readingHistory) ? this.readingHistory : [];

          // Filter existing history, ensuring valid format and Date timestamp
          const filteredHistory = currentHistory.filter((h): h is ReadingHistory => {
              if (typeof h !== 'object' || h === null || !('type' in h) || !(h.timestamp instanceof Date)) {
                  // console.warn('Filtering out history item with unexpected format or non-Date timestamp:', h);
                  return false;
              }
              // Don't keep existing entry if it matches the new entry's type and key properties
              if (h.type === 'verse' && historyEntry.type === 'verse') {
                  return !(h.surah === historyEntry.surah && h.verse === historyEntry.verse);
              } else if (h.type === 'page' && historyEntry.type === 'page') {
                  return !(h.page === historyEntry.page);
              }
              return true; // Keep if types don't match
          });

          // Prepend the new entry and ensure the final array conforms to ReadingHistory[]
          // *** LINTER FIX: Cast the final array to ReadingHistory[] ***
          this.readingHistory = [
              historyEntry, // Assuming this has timestamp: Date
              ...filteredHistory
          ] as ReadingHistory[];

          // Limit history size
          this.readingHistory = this.readingHistory.slice(0, 50);
          this.changeDetector.markForCheck(); // Update UI if history list changes

      } catch (error: unknown) {
          if ((error as { status?: number })?.status !== 429) {
              console.error('Error saving reading history:', error);
              // Revert local state on error (can stay)
               const currentHistory = Array.isArray(this.readingHistory) ? this.readingHistory : []; // Need to re-fetch current state before reverting
               this.readingHistory = currentHistory; // Simplistic revert, might need original state
               /* Consider more robust revert if needed:
               try {
                   const prefs = JSON.parse(localStorage.getItem('quran_reader_preferences') || '{}');
                   prefs.readingHistory = currentHistory; // Assuming currentHistory holds pre-optimistic state
                   localStorage.setItem('quran_reader_preferences', JSON.stringify(prefs));
               } catch (e) {
                   console.warn('Error reverting localStorage:', e);
               }
               */
          }
      }

      // --- REMOVE final call to savePreferences ---
      // await this.savePreferences(); // <-- REMOVE THIS

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
    if (!this.bookmarks || !Array.isArray(this.bookmarks) || this.isMushafView) {
      // In Mushaf view, this method shouldn't be used for page check
      return false;
    }
    const bookmarkToCheck = `verse:${this.currentSurah}:${verseNumber}`;
    return this.bookmarks.includes(bookmarkToCheck);
  }

  // *** NEW Method: Check if the current Mushaf page is bookmarked ***
  public isCurrentPageBookmarked(): boolean {
    if (!this.bookmarks || !Array.isArray(this.bookmarks) || !this.isMushafView) {
      // Only applicable in Mushaf view
      return false;
    }
    const bookmarkToCheck = `mushaf:${this.currentPage}`;
    return this.bookmarks.includes(bookmarkToCheck);
  }

  // *** MODIFY: Make verseNumber optional ***
  public toggleBookmark(verseNumber?: number): void { // Make parameter optional
    let bookmark: string;

    // Determine bookmark format based on current view
    if (this.isMushafView) {
      // *** FIX: Use displayPageNumber for Mushaf bookmarks ***
      bookmark = `mushaf:${this.displayPageNumberSubject.value}`;
    } else if (verseNumber !== undefined && this.currentSurah) { // Check if verseNumber is provided for translation view
      bookmark = `verse:${this.currentSurah}:${verseNumber}`;
    } else {
      console.warn('Cannot toggle bookmark: Invalid state (missing verseNumber in translation view?)');
      return; // Exit if state is invalid
    }

    const currentBookmarks = Array.isArray(this.bookmarks) ? this.bookmarks : [];
    const isCurrentlyBookmarked = currentBookmarks.includes(bookmark);
    
    // Optimistically update UI
    this.bookmarks = isCurrentlyBookmarked 
      ? currentBookmarks.filter(b => b !== bookmark)
      : [...currentBookmarks, bookmark];
    // ++ ADD: Update subject immediately after optimistic update ++
    this.bookmarksSubject.next(this.bookmarks);
    // ++ END ADD ++
    
    // Save to localStorage
    try {
      const prefs = JSON.parse(localStorage.getItem('quran_reader_preferences') || '{}');
      prefs.bookmarks = this.bookmarks;
      localStorage.setItem('quran_reader_preferences', JSON.stringify(prefs));
    } catch (error) {
      console.warn('Error saving to localStorage:', error);
    }
    
    // Call appropriate server method
    const serverAction = isCurrentlyBookmarked 
      ? this.authService.removeBookmark(bookmark)
      : this.authService.addBookmark(bookmark);
    
    serverAction.pipe(
      take(1), // Take only one emission
      catchError(error => {
        console.error('Error updating bookmark:', error);
        // Revert local changes on error
        this.bookmarks = currentBookmarks;
        // ++ ADD: Update subject on error reversion ++
        this.bookmarksSubject.next(this.bookmarks);
        // ++ END ADD ++
        this.revertLocalStorageBookmarks(currentBookmarks);
        this.toastService.show('Failed to update bookmark');
        return EMPTY;
      })
    ).subscribe(response => {
      if (response.success) {
        this.bookmarks = response.bookmarks;
        // ++ ADD: Update subject on successful server response ++
        this.bookmarksSubject.next(this.bookmarks);
        // ++ END ADD ++
        this.toastService.show(isCurrentlyBookmarked ? 'Bookmark removed' : 'Bookmark added');
          } else {
        // Revert local changes if server fails
        this.bookmarks = currentBookmarks;
        // ++ ADD: Update subject on failure reversion ++
        this.bookmarksSubject.next(this.bookmarks);
        // ++ END ADD ++
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
    return this.authService.getBookmarks().pipe(
      tap(bookmarks => {
        const validBookmarks = Array.isArray(bookmarks) ? bookmarks : [];
        this.bookmarksSubject.next(validBookmarks); // Emit bookmarks through the subject
        // No need to assign to this.bookmarks directly anymore
        this.changeDetector.markForCheck(); // Ensure detection runs if needed
      }),
      catchError(error => {
        console.error('[QuranReader] Error loading bookmarks:', error);
        this.toastService.showError('Failed to load bookmarks. Some features might be limited.');
        this.bookmarksSubject.next([]); // Emit empty array on error
        return of([]); // Return empty array observable to continue the stream
      })
    );
  }

  private async loadSurahs(): Promise<void> {
    try {
      // First try to load from cache
      const cachedSurahs = localStorage.getItem('quran_surahs');
      if (cachedSurahs) {
        try {
          this.surahs = JSON.parse(cachedSurahs);
          // // //////console.log('Loaded surah list from cache');
          if (this.surahs.length > 0) {
            return Promise.resolve();
          }
        } catch (parseError) {
          console.warn('Error parsing cached surahs:', parseError);
        }
      }
      
      // If no cache or cache is invalid, load from API
      // // //////console.log('Loading surah list from API...');
      
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
      
      // // //////console.log('Loaded surah list successfully', this.surahs.length);
      return Promise.resolve();
    } catch (error) {
      console.error('Error loading surah list:', error);
      
      // Provide fallback data if loading fails
      if (this.surahs.length === 0) {
        // // //////console.log('Using fallback surah list');
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

    // 1. Set loading state immediately and trigger UI update
    this.isAudioLoading = true;
    this.audioPaused = false; // Assume playback will start
    this.currentPlayingVerse = verseNumber; // Set target verse
    // Set user-friendly display text
    const surahDetails = this.currentSurahDetails;
    const surahDisplayName = surahDetails ? `${surahDetails.englishName} (${surahDetails.name})` : `Surah ${this.currentSurah}`;
    this.currentlyPlaying = verseNumber ? `${surahDisplayName} - Verse ${verseNumber}` : `Full ${surahDisplayName}`;
    this.changeDetector.markForCheck(); // Ensure loading indicator shows

    // 2. Stop previous audio and prepare new one asynchronously
    // Use setTimeout to allow the UI to update before potentially heavy operations
    setTimeout(async () => {
      try {
        // Stop any currently playing audio first
        if (this.audioPlayer) {
          this.audioPlayer.pause();
          this.removeAudioEvents();
          this.audioPlayer.removeAttribute('src'); // Clean up old source
          // //////console.log('[playAudio] Previous player paused and cleaned.');
        }

        // Store scroll position BEFORE creating/loading new audio
        const currentScrollY = window.scrollY;

        // Create and configure the NEW Audio element
        this.audioPlayer = new Audio(url);
        this.currentAudioUrl = url; // Store the current URL
        this.setupAudioEvents(); // Add listeners to the new player

        // //////console.log(`[playAudio] New audio element created for URL: ${url}`);

        // Initiate loading
        this.audioPlayer.load();

        // Set timeout for loading indicator - reset it here
        clearTimeout(this.audioLoadingTimeout);
        this.audioLoadingTimeout = setTimeout(() => {
          if (this.isAudioLoading && this.audioPlayer?.networkState === HTMLMediaElement.NETWORK_LOADING) {
             console.warn('Audio loading timed out.');
             this.ngZone.run(() => this.handleAudioError('Audio loading timed out'));
          }
        }, 15000); // 15 second timeout

        // Attempt to play - Browser might block this until user interaction
        // The 'canplay' event or 'playing' event will set isAudioLoading to false
        try {
          await this.audioPlayer.play();
          // //////console.log('[playAudio] Play promise resolved.');
          // Note: isPlaying and isAudioLoading state will be updated by 'play' and 'canplay' event handlers
        } catch (playError: any) {
           // Handle cases where autoplay fails (common in browsers)
           console.warn('[playAudio] Autoplay error (might be expected):', playError.message);
           // Don't necessarily treat this as a full error, user might need to click play again
           this.ngZone.run(() => {
              this.isPlaying = false;
              this.audioPaused = true;
              // Keep isAudioLoading potentially true until 'canplay' if load is ongoing
           });
        }

        // Restore scroll position AFTER attempting playback (use rAF)
        requestAnimationFrame(() => {
          if (Math.abs(window.scrollY - currentScrollY) > 5) {
              // //////console.log(`[playAudio] Restoring scroll position from ${window.scrollY} to ${currentScrollY}`);
              window.scrollTo({ top: currentScrollY, behavior: 'instant' });
          }
        });

      } catch (error) {
        console.error('[playAudio] Error setting up audio:', error);
        this.ngZone.run(() => this.handleAudioError('Failed to set up audio'));
      }
    }, 0); // setTimeout 0ms helps prevent blocking the main thread
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
    });
  };

  private readonly onError = (e: Event): void => {
    this.ngZone.run(() => {
      console.error('Audio player error:', e);
      this.handleAudioError('Error occurred during playback');
    });
  };

  private readonly onPause = (): void => {
    this.ngZone.run(() => {
      this.isPlaying = false;
      this.audioPaused = true;
    });
  };

  private readonly onPlay = (): void => {
    this.ngZone.run(() => {
      this.isPlaying = true;
      this.audioPaused = false;
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
  

  private savePreferences() {
    try {
        // Get current URL state first
        const currentUrl = new URL(window.location.href);
        const urlParams = new URLSearchParams(currentUrl.search);
        
        // Conditionally build lastState
        const lastStateObject = this.isMushafView
          ? { // Mushaf State
              lastMushafPage: this.currentPage || this.FIRST_PAGE,
              isMushafView: true,
              isMainControlsMinimized: this.isMainControlsMinimized,
              timestamp: new Date().toISOString()
            }
          : { // Translation State
              lastTranslationSurah: this.currentSurah || 1,
              lastTranslationVerse: this.currentVerse || 1,
              isMushafView: false,
              isMainControlsMinimized: this.isMainControlsMinimized,
              timestamp: new Date().toISOString()
            };

        // Prepare preferences to save, including the built lastState and urlState
        const prefsToSave = {
            selectedReciter: this.selectedReciter?.id,
            selectedTranslation: this.selectedTranslation,
            fontSize: this.fontSize,
            // readingHistory is handled separately
            lastState: lastStateObject, // Assign the conditionally built object
            urlState: { // urlState uses urlParams defined above
                mode: urlParams.get('mode') || 'translation',
                translation: urlParams.get('translation') || this.selectedTranslation,
                reciter: urlParams.get('reciter') || this.selectedReciter?.id,
                surah: urlParams.get('surah') || this.currentSurah,
                verse: urlParams.get('verse') || this.currentVerse,
                page: urlParams.get('page')
            }
        };

        // *** ADD LOG HERE ***
        //////console.log('%c[savePreferences] Attempting to save:', 'color: brown; font-weight: bold;', JSON.parse(JSON.stringify(prefsToSave))); // Deep copy for logging

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
                    if (error?.status !== 429) { // Avoid logging rate limit errors
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

  async ngOnDestroy(): Promise<void> { // Make ngOnDestroy async
    // // // //////console.log('[QuranReader] Destroying component...');
    // Capture final state before cleanup
    const finalSurah = this.currentSurah;
    const finalVerse = this.currentVerse;
    const finalPage = this.currentPage; // Actual page
    const finalIsMushaf = this.isMushafView;
    // Log state *before* calling save
    //////console.log(`%c[QuranReader ngOnDestroy] State BEFORE save: Mode=${finalIsMushaf ? 'Mushaf' : 'Translation'}, S:${finalSurah} V:${finalVerse} ActualP:${finalPage}`, 'color: orange; font-weight: bold;');
    this.destroy$.next();
    this.destroy$.complete();

    // --- Save final HISTORY entry --- 
    if (this.user && this.isValidVerseForHistory(finalSurah, finalVerse)) {
         // //////console.log(`[QuranReader ngOnDestroy] Saving final HISTORY entry S:${finalSurah} V:${finalVerse}`);
         try {
             // Call service directly, bypass debounce for immediate save on destroy
             await this.authService.saveReadingHistory({ type: 'verse', surah: finalSurah, verse: finalVerse }); // Await history save
             // //////console.log('[QuranReader ngOnDestroy] Final HISTORY entry save successful.');
         } catch (error) {
             console.error('[QuranReader ngOnDestroy] Error saving final HISTORY entry:', error);
         }
    } else {
        // //////console.log('[QuranReader ngOnDestroy] Skipping final HISTORY entry save (no user or invalid verse).');
    }

    // --- Save final PREFERENCES state (including lastState) --- 
    // //////console.log('[QuranReader] Saving final preferences on destroy...');
    try {
        await this.savePreferences(); // Await preferences save
        // //////console.log('[QuranReader ngOnDestroy] savePreferences() finished.');
    } catch (error) {
        console.error('[QuranReader ngOnDestroy] Error awaiting savePreferences:', error);
        // Decide if we need to handle this error differently, 
        // but proceed with cleanup regardless.
    }

    // Stop audio playback and remove listeners
    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer.src = '';
    }
    // Clear timers
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.historyDebounceTimer) clearTimeout(this.historyDebounceTimer);
    if (this.audioLoadingTimeout) clearTimeout(this.audioLoadingTimeout);
    if (this.urlUpdateTimeoutId) clearTimeout(this.urlUpdateTimeoutId);
    // //////console.log('[ngOnDestroy] Cleanup complete.');
  }

  // === Initialization & State Management ===

  // Scroll handler - Re-enabled and simplified
  // @HostListener('window:scroll', ['$event'])
  // onScroll() {
  //    // ALL CODE THAT WAS PREVIOUSLY HERE
  // }
  // --- END OF REMOVAL --- 

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
      this.selectedSurah = foundSurah; // <-- Add this line to sync dropdown
      const surahDetails = this.surahs.find(s => s.number === foundSurah);
      if (surahDetails) {
        this.currentSurahDetails = surahDetails;
        this.surahName = surahDetails.name;
      }
      this.changeDetector.markForCheck(); // Ensure UI update
    }
  }

  private updateUrlParams(replaceUrlOverride: boolean = false): void {
    // Debounce URL updates to prevent excessive history entries
    if (this.urlUpdateTimeoutId) {
      clearTimeout(this.urlUpdateTimeoutId);
    }

    const debounceTime = 500; // Use a reasonable debounce time

    this.urlUpdateTimeoutId = setTimeout(() => {
      const currentDisplayPage = this.isMushafView ? this.actualToDisplayPage(this.currentPage) : null;
      const currentSurahForUrl = this.isMushafView ? (this.getSurahFromPage(this.currentPage) || this.currentSurah) : this.currentSurah;

      const params: any = {
        mode: this.isMushafView ? 'mushaf' : 'translation',
        translation: this.selectedTranslation,
        reciter: this.selectedReciter?.id,
        surah: currentSurahForUrl // Use the determined Surah for the URL
      };

      // Conditionally add/remove verse and page
      if (!this.isMushafView) {
        if (this.currentVerse && this.currentVerse > 0) {
          params.verse = this.currentVerse;
        }
        delete params.page; // Ensure page is removed in translation mode
      } else {
        if (currentDisplayPage) {
          params.page = currentDisplayPage; // Use the determined display page
        }
        delete params.verse; // Ensure verse is removed in mushaf mode
      }

      // Use replaceUrl: true if explicitly requested OR for scroll updates
      const shouldReplaceUrl = replaceUrlOverride || true; // Modify this condition if scroll updates should NOT replace

      // //////console.log(`[updateUrlParams] Navigating. replaceUrl: ${shouldReplaceUrl}, Params:`, params); // Log before navigate

      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: params,
        queryParamsHandling: 'merge', // Keep merge for now, might need 'preserve' or null depending on exact desired behavior
        replaceUrl: shouldReplaceUrl
      });

      this.lastUrlUpdateTime = Date.now();
      this.urlUpdateTimeoutId = null;

      // ... update title/meta ...

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
    // ++ LOG ++ Check if this is being called unexpectedly
    // //////console.log(`[selectSurah ENTRY] Called with surahNumber: ${surahNumber}. Current state: this.currentSurah=${this.currentSurah}, this.selectedSurah=${this.selectedSurah}`);
    if (!surahNumber || surahNumber === this.currentSurah) return; // Don't reload if same surah

    // //////console.log(`[selectSurah] Changing to Surah ${surahNumber}`);

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
    // REMOVE: setTimeout(() => this.updateUrlParams(), 0);
    this.updateUrlParams(); // Call synchronously
    this.ignoreNextQueryParamChange = true; // Prevent immediate reaction from subscription
    // --- End URL Update ---

    // --- Load Content Based on View Mode ---
    if (this.isMushafView) {
      // //////console.log(`[selectSurah] Loading Mushaf view for Surah ${surahNumber}`);
      const surahStartPage = this.quranFlash.surahPageMap[surahNumber];
      if (surahStartPage) {
        this.currentPage = surahStartPage;
        this.displayPageNumberSubject.next(this.actualToDisplayPage(surahStartPage));
        // Load the mushaf page (this will also handle URL update for page number)
        this.loadMushafPage(this.currentPage);
        this.changeDetector.markForCheck(); // Mark for check after initiating load
      } else {
         console.warn(`[selectSurah] No page mapping found for Surah ${surahNumber}, defaulting.`);
         this.currentPage = this.FIRST_PAGE;
         this.displayPageNumberSubject.next(1);
         this.loadMushafPage(this.currentPage);
         this.changeDetector.markForCheck(); // Mark for check after initiating load
      }
    } else {
      // For translation view, load the verses
      // //////console.log(`[selectSurah] Loading Translation view for Surah ${surahNumber}`);
      this.loadSurah(surahNumber).subscribe({
          // Optional: Add next/error handlers if specific actions needed after load
          next: () => {
            // //////console.log(`[selectSurah] Translation view loaded for Surah ${surahNumber}`);
            this.changeDetector.markForCheck(); // Mark for check after async load completes
          },
          error: (err) => {
            console.error(`[selectSurah] Error loading translation view for Surah ${surahNumber}:`, err);
            this.changeDetector.markForCheck(); // Mark for check even on error to update UI state
          }
      });
    }
    
    // REMOVED: Trigger change detection after initiating load
    // this.changeDetector.markForCheck(); 
    // ++ LOG ++ Check state at the end of the synchronous part
    // //////console.log(`[selectSurah EXIT] State after sync updates: this.currentSurah=${this.currentSurah}, this.selectedSurah=${this.selectedSurah}`);
    // ++ ADD: Explicitly save history for verse 1 or current page ++
    if (this.isMushafView) {
      this.debouncedSaveHistory({ type: 'page', page: this.currentPage });
    } else {
      this.debouncedSaveHistory({ type: 'verse', surah: this.currentSurah, verse: 1 });
    }

    // ++ ADD: Automatically close controls ++
    if (!this.isMainControlsMinimized) {
      this.isMainControlsMinimized = true;
    }
    this.isPopupOpen = false; // Ensure popup is closed too
    this.changeDetector.markForCheck();
    // ++ END ADD ++
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
      // ++ ADD: Explicitly save history for the target verse ++
      this.debouncedSaveHistory({ type: 'verse', surah: targetSurah, verse: verseNumber }); 
    }
    this.showSuggestions = false; // Hide search suggestions if open
    this.changeDetector.markForCheck(); // Ensure UI updates
    // ++ ADD: Update lastTranslation state ++ 
    this.lastTranslationSurah = targetSurah;
    this.lastTranslationVerse = verseNumber;
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
        // // //////console.log(`[Handler for line 1656] Surah ${surahNumber} loaded successfully.`);
        this.updateUrlParams(); // Update URL after successful load
        // Ensure isLoading is handled within loadSurah itself
      },
      error: (err) => {
        // console.error(`[Handler for line 1656] Error loading surah ${surahNumber}:`, err);
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

    // ++ ADD: Close/Minimize Controls ++
    if (!this.isMobile) {
      this.isMainControlsMinimized = true; // Minimize on desktop
    }
    this.isPopupOpen = false; // Close popup if open on mobile/desktop
    this.changeDetector.markForCheck(); // Ensure UI reflects closed controls
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
      this.audioPlayer.play().catch(err => this.handleAudioError(err)); // Add catch
    } else {
      this.audioPlayer.pause();
    }
    // This method should NOT close the player
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
    // Prevent re-entry if already processing
    if (this.isTogglingView) {
      // //////console.log("[toggleView] Already toggling view.");
      return;
    }
    this.isTogglingView = true;
    // //////console.log(`[toggleView] Starting toggle. Current view: ${this.isMushafView ? 'Mushaf' : 'Translation'}`);

    const targetMushafView = !this.isMushafView;

    // Stop any audio playback
    this.stopAndCloseAudioPlayer(); // Assuming this method exists and works

    // --- Save current state BEFORE switching --- 
    if (this.isMushafView) {
        this.lastMushafPage = this.currentPage || this.FIRST_PAGE;
        // //////console.log(`[toggleView] Saved Mushaf state: Page ${this.lastMushafPage}`);
    } else {
        this.lastTranslationSurah = this.currentSurah || 1;
        this.lastTranslationVerse = this.currentVerse || 1;
        // //////console.log(`[toggleView] Saved Translation state: S${this.lastTranslationSurah} V${this.lastTranslationVerse}`);
    }

    // Prepare query parameters - Start building params object
    const params: any = {
      mode: targetMushafView ? 'mushaf' : 'translation',
      translation: this.selectedTranslation,
      reciter: this.selectedReciter?.id
    };

    let loadObservable: Observable<any>;

    if (targetMushafView) {
      // --- Switching TO Mushaf View --- 
      // Use selectedSurah as the source of truth for the last active surah
      // const surahToStore = this.selectedSurah || this.currentSurah || 1; 
      // If we just selected a surah, the relevant verse is likely 1
      // const verseToStore = this.currentVerse || 1; // Default to 1 if undefined

      // //////console.log(`[toggleView] Switching TO Mushaf. Storing state S:${surahToStore}, V:${verseToStore} (Derived from selectedSurah/currentVerse)`);
      // this.lastTranslationSurah = surahToStore;
      // this.lastTranslationVerse = verseToStore; 

      // Find the starting page for the surah we are storing
      // const surahStartPage = this.quranFlash.surahPageMap[surahToStore];
      // let pageToLoad: number;
      // if (surahStartPage) {
      //   pageToLoad = surahStartPage;
      // } else {
      //   pageToLoad = this.FIRST_PAGE;
      // }
      // -- Load the last known Mushaf page -- 
      let pageToLoad = this.lastMushafPage || this.FIRST_PAGE;
      // Ensure it's within valid range (e.g., if saved pref was bad)
      pageToLoad = Math.max(this.FIRST_PAGE, Math.min(pageToLoad, this.LAST_PAGE));
      // //////console.log(`[toggleView] Restoring Mushaf state: Loading Page ${pageToLoad}`);
      
      // Update component state for Mushaf view
      this.currentPage = pageToLoad;
      this.displayPageNumberSubject.next(this.actualToDisplayPage(pageToLoad));
      params.page = this.displayPageNumberSubject.value; // Add page to params
      // Set surah param based on the actual page's surah, not the stored one
      params.surah = this.currentSurah;     

      // ++ ADD: Automatically close controls when switching TO Mushaf ++
      if (!this.isMainControlsMinimized) {
        this.isMainControlsMinimized = true;
      }
      this.isPopupOpen = false; // Ensure popup is closed too
      this.changeDetector.markForCheck(); // Add check here too
      // ++ END ADD ++

      // Set up the loading operation
      loadObservable = from(this.loadMushafPage(this.currentPage, true)); 

    } else {
      // --- Switching TO Translation View ---
      // //////console.log(`[toggleView] Switching TO Translation. Restoring state S:${this.lastTranslationSurah}, V:${this.lastTranslationVerse}`);
      // Restore state from stored values
      const restoredSurah = this.lastTranslationSurah || 1;
      const restoredVerse = this.lastTranslationVerse || 1;
      // //////console.log(`[toggleView] Restoring Translation state: S${restoredSurah} V${restoredVerse}`);
      
      this.currentSurah = restoredSurah;
      this.selectedSurah = restoredSurah; // Sync dropdown
      this.currentVerse = restoredVerse;
      
      this.changeDetector.markForCheck(); // Ensure dropdown updates

      // Build params object specifically for this navigation
      params.surah = restoredSurah;
      params.verse = restoredVerse;
      delete params.page; // Explicitly remove page param for translation view

      // Set up the loading operation
      loadObservable = this.loadSurah(restoredSurah || 1).pipe(
        tap(() => {
          // Scroll after surah loads
          setTimeout(() => this.scrollToVerse(restoredVerse), 150); 
        })
      ); 
    }

    // --- Execute State Change and Loading --- 
    this.isMushafView = targetMushafView; // Update the view flag AFTER preparing the load
    this.changeDetector.markForCheck();

    loadObservable.pipe(
      finalize(() => {
        // //////console.log(`[toggleView] Load operation finalized. Re-enabling toggle.`);
        this.isTogglingView = false; // Re-enable toggling
        
        // ** Rebuild params just before navigating to ensure correct state **
        const finalParams: any = {
            mode: this.isMushafView ? 'mushaf' : 'translation',
            translation: this.selectedTranslation,
            reciter: this.selectedReciter?.id,
            surah: this.currentSurah // Use final component state
        };
        if (this.isMushafView) {
            finalParams.page = this.displayPageNumberSubject.value;
        } else {
            finalParams.verse = this.currentVerse; 
        }

        // ** DEBUG LOG **
        // //////console.log(`[toggleView finalize] Navigating with params:`, finalParams, `Component state: currentSurah=${this.currentSurah}, currentVerse=${this.currentVerse}, isMushafView=${this.isMushafView}`);

        // Signal to ngOnInit subscription to ignore the upcoming change caused by this navigation
        this.ignoreNextQueryParamChange = true;

        // Update URL after loading completes
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: finalParams, // Use freshly built params
          replaceUrl: true
        });
        this.changeDetector.markForCheck(); // Final check
        this.savePreferences(); // Save state after successful toggle and load
      })
    ).subscribe({
      next: () => {
        // //////console.log(`[toggleView] Content loaded successfully for ${this.isMushafView ? 'Mushaf' : 'Translation'} view.`);
      },
      error: (err) => {
        console.error(`[toggleView] Error loading content:`, err);
        this.isTogglingView = false; // Ensure flag is reset on error too
        // Maybe show a toast message
      }
    });

    // Remove the old setTimeout for URL update
    // setTimeout(() => { ... }, 0);
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
    if (this.displayPageNumberSubject.value < this.DISPLAY_TOTAL) {
      const newDisplayPage = this.displayPageNumberSubject.value + 1;
      this.displayPageNumberSubject.next(newDisplayPage); // Emit new display page
      this.loadMushafPage(this.displayToActualPage(newDisplayPage));
      this.updateUrlParams(); // <-- ADD THIS LINE
    } else {
    }
  }

  public previousPage(): void {
    if (this.displayPageNumberSubject.value > 1) {
      const newDisplayPage = this.displayPageNumberSubject.value - 1;
      this.displayPageNumberSubject.next(newDisplayPage); // Emit new display page
      this.loadMushafPage(this.displayToActualPage(newDisplayPage));
      this.updateUrlParams(); // <-- ADD THIS LINE
    } else {
    }
  }

  public goToPage(): void {
    const targetDisplayPage = Number(this.pageInput); 
    if (!isNaN(targetDisplayPage) && targetDisplayPage >= 1 && targetDisplayPage <= this.DISPLAY_TOTAL) {
      this.displayPageNumberSubject.next(targetDisplayPage); // Emit new display page
      this.loadMushafPage(this.displayToActualPage(targetDisplayPage));
      this.updateUrlParams(); // <-- ADD THIS LINE
    } else {
      this.toastService.showError(`Invalid page number. Please enter a number between 1 and ${this.DISPLAY_TOTAL}.`);
      this.pageInput = this.displayPageNumberSubject.value; // Reset input to current display page
    }
  }

  // View control methods
  public togglePageView(): void {
    // Prevent enabling double page view on mobile
    if (this.isMobile && !this.isDoublePageView) {
      this.toastService.showInfo("Double page view is not available on mobile devices.");
      return;
    }
    this.isDoublePageView = !this.isDoublePageView;
    // When switching back to single view, ensure the right page is loaded if needed
    if (!this.isDoublePageView) {
      this.loadMushafPage(this.currentPage, true); // Pass true when switching view
      this.changeDetector.markForCheck(); // <<< Add markForCheck here
    } else {
       // If switching TO double view, need to load potentially
       this.loadMushafPage(this.currentPage, true); // Pass true here too
       this.changeDetector.markForCheck(); // <<< Add markForCheck here too
    }
    // Save preference (optional)
    // this.debouncedSavePreferences(); 
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
    // // //////console.log('Translation changed:', event);
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
        // //////console.log(`[Handler for line 1656] Surah ${surahNumber} loaded successfully.`);
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
      // // //////console.log('Loading surah:', this.currentSurah);
    }
  }

  private setupKeyboardNavigation(): void {
    // Setup keyboard navigation handlers
    document.addEventListener('keydown', (event: KeyboardEvent) => {
      // Ignore keyboard events if an input element is focused
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
        return;
      }
      if (this.isMushafView) {
        // Mushaf View: Arrow keys change page
        if (event.key === 'ArrowRight') {
          this.nextPage();
        } else if (event.key === 'ArrowLeft') {
          this.previousPage();
        }
      } else {
        // Translation View: Arrow keys change verse
        if (event.key === 'ArrowRight') {
          this.navigateToNextVerse();
        } else if (event.key === 'ArrowLeft') {
          this.navigateToPreviousVerse();
        }
      }
    });
  }

  private navigateToNextVerse(): void {
    // Implementation for next verse navigation
    // // //////console.log('Navigate to next verse');
  }

  private navigateToPreviousVerse(): void {
    // Implementation for previous verse navigation
    // // //////console.log('Navigate to previous verse');
  }

  // Add this method to validate reciter ID
  private validateReciterId(reciterId: number): number {
    if (this.reciters.some(r => r.id === reciterId)) {
      return reciterId;
    }
    return this.reciters[0]?.id || 1;
  }

  private loadReadingHistory(): Promise<void> {
    // Check if user is logged in
    if (!this.user) {
      // Try loading from localStorage if not logged in
      try {
        const prefs = JSON.parse(localStorage.getItem('quran_reader_preferences') || '{}');
        this.readingHistory = Array.isArray(prefs.readingHistory) ? prefs.readingHistory : [];
      } catch (e) {
        this.readingHistory = [];
      }
      return Promise.resolve();
    }
    // Fetch from service if logged in
    return firstValueFrom(this.authService.getReadingHistory()).then((response: ReadingHistoryResponse) => {
      if (response.success && Array.isArray(response.history)) {
        this.readingHistory = response.history;
      } else {
        console.warn('Failed to load reading history from server:'); // Removed response.message
        // Optionally load from local storage as fallback even if logged in?
        try {
          const prefs = JSON.parse(localStorage.getItem('quran_reader_preferences') || '{}');
          this.readingHistory = Array.isArray(prefs.readingHistory) ? prefs.readingHistory : [];
        } catch (e) { 
          this.readingHistory = [];
        }
      }
    }).catch(error => {
      console.error('Error fetching reading history:', error);
      this.readingHistory = []; // Clear history on error
    });
  }

  // Add these methods for page number conversion
  private actualToDisplayPage(actualPage: number): number {
    // The display page (1-604) is the actual page (10-613) minus 9
    // However, ensure it doesn't go below 1
    return Math.max(1, actualPage - (this.FIRST_PAGE - 1)); 
  }

  private displayToActualPage(displayPage: number): number {
    // The actual page is the display page plus 9
    // Clamp the result between FIRST_PAGE and LAST_PAGE
    return Math.max(this.FIRST_PAGE, Math.min(this.LAST_PAGE, displayPage + (this.FIRST_PAGE - 1)));
  }

  private async loadMushafPage(actualPageNumber: number, isViewChange: boolean = false) {
    if (isNaN(actualPageNumber) || actualPageNumber < this.FIRST_PAGE || actualPageNumber > this.LAST_PAGE) {
        console.error(`[loadMushafPage ERROR] Invalid actual page number: ${actualPageNumber}. Defaulting to ${this.FIRST_PAGE}`); // Keep error log
        actualPageNumber = this.FIRST_PAGE;
        this.displayPageNumberSubject.next(this.actualToDisplayPage(actualPageNumber));
        this.currentPage = actualPageNumber;
    }
    this.isLoading = true;
    this.changeDetector.markForCheck();

    try {
        const pageData = await firstValueFrom(this.quranFlash.getMushafPage(actualPageNumber));
        this.mushafPage = pageData;
        // +++ ADD LOG BEFORE SETTING URL +++
        ////console.log(`%c[loadMushafPage] Getting Image URL for actual page: ${actualPageNumber}`, 'color: cyan');
        this.pageImageUrl = pageData.imageUrl;
        // +++ ADD LOG AFTER SETTING URL +++
        ////console.log(`%c[loadMushafPage] Set pageImageUrl: ${this.pageImageUrl}`, 'color: cyan');
        // +++ FORCE CHANGE DETECTION +++
        this.changeDetector.markForCheck();

        if (this.isDoublePageView) {
            const nextPageNumber = actualPageNumber + 1;
            if (nextPageNumber <= this.LAST_PAGE) {
                const nextPageData = await firstValueFrom(this.quranFlash.getMushafPage(nextPageNumber));
                this.secondPageImageUrl = nextPageData.imageUrl;
            } else {
                this.secondPageImageUrl = '';
            }
        } else {
            this.secondPageImageUrl = '';
        }

        this.currentPage = actualPageNumber;
        this.displayPageNumberSubject.next(this.actualToDisplayPage(actualPageNumber));
        this.pageInput = this.actualToDisplayPage(actualPageNumber);
        this.updateCurrentSurah(actualPageNumber);

        if (!isViewChange) {
           this.debouncedSaveHistory({ type: 'page', page: actualPageNumber });
        }
    } catch (error) {
        console.error(`[loadMushafPage ERROR] Failed to load actual page ${actualPageNumber}:`, error); // Keep error log
        this.pageImageUrl = 'assets/images/image-load-error.png';
        this.secondPageImageUrl = '';
    } finally {
        this.isLoading = false;
        this.changeDetector.markForCheck();
    }
  }

  private preloadImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = (errorEvent) => {
          // More detailed error logging
          // console.error(`Failed to load image. URL: ${url}. Error:`, errorEvent);
          reject(new Error(`Failed to load image: ${url}`));
      };
      img.src = url;
    });
  }

 private removeAudioEvents(): void {
    if (this.audioPlayer) {
      // Use the bound references if they exist, otherwise use inline functions
      this.audioPlayer.removeEventListener('timeupdate', this.onTimeUpdate);
      this.audioPlayer.removeEventListener('loadedmetadata', this.onLoadedMetadata);
      this.audioPlayer.removeEventListener('ended', this.onEnded);
      this.audioPlayer.removeEventListener('error', this.onError);
      this.audioPlayer.removeEventListener('pause', this.onPause);
      this.audioPlayer.removeEventListener('play', this.onPlay);
      // Need a way to remove the anonymous functions for loading states if added directly
      // If storing references isn't feasible, this part might not fully remove them
      // console.warn('Cannot guarantee removal of anonymous loading event listeners');
    }
  }

  // Renamed from attemptPlayback for clarity
  private startPlaybackWhenReady(): void {
    if (this.audioPlayer && !this.isPlaying && this.isAudioLoading) { // Only play if loading and not already playing
        // // //////console.log('Attempting to play audio now that it is ready...');
        this.audioPlayer.play()
            .then(() => {
                // // //////console.log('Audio play() promise resolved after ready.');
                // isPlaying and isAudioLoading state will be updated by 'play' and 'canplay' event handlers
            })
            .catch(err => {
                // console.error('Error starting playback after ready:', err);
                this.handleAudioError('Could not start audio playback.');
            });
    }
  }

  // --- Event Handlers ---

  private updateRecitingVerse(currentTime: number): void {
    if (!this.isPlayingFullSurah || !this.verseTimings || this.verseTimings.length === 0) {
      this.currentRecitingVerse = null; // Clear if not playing full surah or no timings
      return;
    }

    // Find the verse whose time range includes the current time
    // Add a small buffer (e.g., 0.2 seconds) to the end time for smoother transitions
    const buffer = 0.2;
    const currentVerseTiming = this.verseTimings.find(timing => 
      currentTime >= timing.timestamp_from && currentTime < (timing.timestamp_to + buffer)
    );

    const newRecitingVerse = currentVerseTiming ? currentVerseTiming.verse_number : null;

    if (this.currentRecitingVerse !== newRecitingVerse) {
      this.currentRecitingVerse = newRecitingVerse;
      // // //////console.log(`Highlighting verse: ${this.currentRecitingVerse}`); // Optional log
      // Maybe scroll to this verse if needed?
      // if(this.currentRecitingVerse) this.scrollToVerse(this.currentRecitingVerse);
      this.changeDetector.markForCheck(); // Update view for highlighting
    }
  }

  // Add the missing method definition here
  private loadVerseTimings(surahNumber: number): void {
    // Check cache first (assuming a cache mechanism exists)
    // if (this.timingCache.has(surahNumber)) { ... }

    this.quranService.getVerseTimings(surahNumber).subscribe({
      next: (timings) => {
        this.verseTimings = timings; // Store fetched timings
        // // //////console.log(`[loadVerseTimings] Loaded timings for Surah ${surahNumber}`, this.verseTimings);
        // Store in cache
        // this.timingCache.set(surahNumber, timings);
        this.changeDetector.markForCheck(); 
      },
      error: (err) => {
        console.error(`[loadVerseTimings] Error loading timings for Surah ${surahNumber}:`, err);
        this.verseTimings = []; // Clear timings on error
        this.changeDetector.markForCheck();
      }
    });
  }

  // --- End Event Handlers ---

  // Add this function back
  trackVerse(index: number, verse: QuranVerse): number {
    return verse.number; // Track by verse number
  }

  goToHistoryEntry(entry: ReadingHistory): void {
    // //////console.log('Navigating to history entry:', entry);
    this.ngZone.run(() => {
      if (entry.type === 'verse' && entry.surah && entry.verse) {
        // Navigate to Translation View
        this.router.navigate(['/quran'], {
          queryParams: {
            surah: entry.surah,
            verse: entry.verse,
            mode: 'translation' // Explicitly set mode
          },
          queryParamsHandling: 'merge' // Merge to keep other params like reciter?
        }).then(success => {
          if (success) {
            // //////console.log('Navigation successful to verse:', entry.surah, entry.verse);
            // Force re-render or data load if needed after navigation
            this.changeDetector.markForCheck();
          } else {
            console.error('Navigation failed to verse:', entry.surah, entry.verse);
          }
        });
      } else if (entry.type === 'page' && entry.page) {
        // Navigate to Mushaf View
        const displayPage = this.actualToDisplayPage(entry.page);
        this.router.navigate(['/quran'], {
          queryParams: {
            page: displayPage, // Navigate using display page number
            mode: 'mushaf' // Explicitly set mode
          },
           queryParamsHandling: 'merge'
        }).then(success => {
          if (success) {
            // //////console.log('Navigation successful to page:', displayPage);
            this.changeDetector.markForCheck();
          } else {
            console.error('Navigation failed to page:', displayPage);
          }
        });
      } else {
        console.warn('Unknown or incomplete history entry format:', entry);
        this.toastService.showError('Cannot navigate to this history entry.');
      }
    });
  }

  // +++ ADD Scroll Listener +++
  @HostListener('window:scroll', ['$event'])
  onWindowScroll(): void {
    // --- Handle Popup Closure and Control Minimization (Keep this logic) ---
    const st = window.scrollY || document.documentElement.scrollTop;
    const scrollDifference = st - this.lastScrollTop;

    // Close popup on scroll (Applies only on desktop due to *ngIf on popup)
    if (this.isPopupOpen) {
        if (Math.abs(scrollDifference) > 5) { // Close popup on any significant scroll
            this.ngZone.run(() => {
                this.isPopupOpen = false;
                this.changeDetector.markForCheck();
            });
        }
    // Minimize controls on scroll down (Only applies on DESKTOP)
    } else if (!this.isMobile && !this.isMushafView && Math.abs(scrollDifference) > this.scrollThreshold) {
      // Only minimize/handle verse tracking if NOT in Mushaf view and scroll is significant
      if (scrollDifference > 0 && !this.isMainControlsMinimized) {
          // Scrolling Down & Controls are Expanded In-Flow -> Minimize
          this.ngZone.run(() => {
              this.isMainControlsMinimized = true;
              this.changeDetector.markForCheck();
          });
      }
      // --- End Control Minimization ---
      
      // --- Debounced Verse Detection (Runs on both desktop/mobile if not mushaf) --- 
      clearTimeout(this.scrollDebounceTimer);
      this.scrollDebounceTimer = setTimeout(() => {
        this.detectAndUpdateCurrentVerse();
      }, this.SCROLL_DEBOUNCE_TIME);
      // --- End Debounced Verse Detection ---
    }

    this.lastScrollTop = Math.max(0, st); // Update last scroll position
  }

  // +++ NEW Method to Detect and Update Verse on Scroll +++
  private detectAndUpdateCurrentVerse(): void {
    if (this.isMushafView || this.isAudioLoading || !this.verses?.length) {
      return; // Don't detect verse if in mushaf view, loading, or no verses
    }

    // ++ Adjusted Offset: Trigger slightly *before* the top aligns with header bottom ++ 
    const viewportTopOffset = 500; // Adjust this offset. Should be slightly LESS than the header height
    let candidateVerseElement: HTMLElement | null = null;
    let bestCandidateTop = -Infinity; // Initialize to find the highest element below the offset

    // Iterate through verse elements to find the one whose top is closest to, but below or at, the offset
    const verseElements = document.querySelectorAll('.verse-card');
    verseElements.forEach(element => {
        const rect = element.getBoundingClientRect();
        // Check if the top of the element is at or below the offset
        if (rect.top <= viewportTopOffset) {
             // We want the element whose top is highest (closest to the offset from below)
            if (rect.top > bestCandidateTop) {
                bestCandidateTop = rect.top;
                candidateVerseElement = element as HTMLElement;
            }
        }
    });

    // If no element's top is at or below the offset, default to the first verse
    if (!candidateVerseElement && verseElements.length > 0) {
         candidateVerseElement = verseElements[0] as HTMLElement;
    }

    if (candidateVerseElement) {
      const verseId = candidateVerseElement.id;
      const verseNumberMatch = verseId.match(/verse-(\d+)/);
      if (verseNumberMatch && verseNumberMatch[1]) {
        const detectedVerseNumber = parseInt(verseNumberMatch[1], 10);

        // Update currentVerse and URL only if it has changed significantly
        if (this.currentVerse !== detectedVerseNumber) {
           // // //////console.log(`[Scroll Listener] Detected verse change: ${this.currentVerse} -> ${detectedVerseNumber}`);
           this.ngZone.run(() => { // Run updates within NgZone
               this.currentVerse = detectedVerseNumber;
               this.updateUrlParams(true); // Update URL, REPLACE entry for scroll updates
               // No need for markForCheck here usually, as updateUrlParams -> router handles it
           });
        }
      }
    }
  }

  // ++ NEW Method for Audio Player Toggle ++
  public toggleAudioPlayerView(): void {
    this.isAudioPlayerMinimized = !this.isAudioPlayerMinimized;
    this.changeDetector.markForCheck();
  }

  // ++ NEW Method to handle tapping on the Mushaf view (show controls) ++
  public toggleMushafControls(): void {
    this.isControlsMinimized = !this.isControlsMinimized;
    this.changeDetector.markForCheck();
  }

  // Need to add this helper function if it doesn't exist
  private getSurahFromPage(actualPage: number): number | null {
      let foundSurah: number | null = null;
      let latestStartPage = -1;
  
      // Use the mapping from QuranFlashService
      Object.entries(this.quranFlash.surahPageMap).forEach(([surahStr, startPage]) => {
        const surahNum = parseInt(surahStr);
        // Compare actual pages
        if (startPage <= actualPage && startPage > latestStartPage) {
          foundSurah = surahNum;
          latestStartPage = startPage;
        }
      });
      return foundSurah;
  }

  // --- NEW loadUserPreferences (with initialLoad flag) ---
  private async loadUserPreferences(initialLoad: boolean = false): Promise<any> { // Return prefs
    // //////console.log(`[loadUserPreferences] Called. initialLoad flag: ${initialLoad}`);
     try {
         // Initialize reciters first (redundant if called after loadRecitersData, but safe)
         if (!this.reciters || this.reciters.length === 0) {
              await this.loadRecitersData();
         }
         if (!this.reciters?.length) {
             console.error('No reciters available in loadUserPreferences');
             return {}; // Return empty object
         }

         let prefs: any = {}; // Initialize empty prefs

         // Try local storage first
         const localPrefs = localStorage.getItem('quran_reader_preferences');
         if (localPrefs) {
             try {
                 prefs = JSON.parse(localPrefs);
             } catch (error) {
                 console.warn('Error parsing local preferences:', error);
                 prefs = {}; // Reset on parse error
             }
         }

         // Try loading from server if user is authenticated
         const isLoggedIn = await this.authService.isAuthenticated();
         if (isLoggedIn) {
             try {
                 const serverPrefs = await this.authService.getUserPreferences();
                 if (serverPrefs) {
                     // Merge server prefs over local prefs (server is source of truth)
                     prefs = { ...prefs, ...serverPrefs };
                     // Ensure lastState isn't accidentally merged if we intend to ignore it
                     // REMOVED: Do not delete lastState during initial load, ngOnInit handles priority
                     // if (initialLoad) {
                     //    delete prefs.lastState;
                     // }
                     // //////console.log('[loadUserPreferences] Loaded preferences from server.');
                 }
             } catch (error) {
                 console.warn('Error loading server preferences:', error);
                 // Keep local prefs if server fails
             }
         }
                 // *** Assign the loaded/merged preferences to the component property ***
        this.preferences = prefs;

         // --- Log Loaded State ---
         if (prefs.lastState) {
             //////console.log(`%c[loadUserPreferences] Loaded lastState:`, 'color: blue;', prefs.lastState);
         } else {
             //////console.log(`%c[loadUserPreferences] No lastState found in preferences.`, 'color: blue;');
         }

         // --- Apply Preferences ---
         // //////console.log('[loadUserPreferences] Applying preferences:', prefs);

         // Apply Secondary Preferences (Reciter, Translation, FontSize)
         // These act as defaults *if* not overridden by URL params later
         if (prefs.selectedReciter) {
             const reciterId = parseInt(prefs.selectedReciter, 10);
             const foundReciter = this.reciters.find(r => r.id === reciterId);
             if (foundReciter) {
                 this.selectedReciter = foundReciter;
                 // //////console.log(`[loadUserPreferences] Applied reciter pref: ${foundReciter.name}`);
             }
         }
         if (prefs.selectedTranslation) {
             this.selectedTranslation = prefs.selectedTranslation;
             // //////console.log(`[loadUserPreferences] Applied translation pref: ${this.selectedTranslation}`);
         }
         if (prefs.fontSize) {
             this.fontSize = prefs.fontSize;
             // //////console.log(`[loadUserPreferences] Applied font size pref: ${this.fontSize}`);
         }

         // Apply isMainControlsMinimized state (regardless of initialLoad? Check logic)
         if (prefs.lastState && typeof prefs.lastState.isMainControlsMinimized === 'boolean') {
             this.isMainControlsMinimized = prefs.lastState.isMainControlsMinimized;
             // //////console.log(`[loadUserPreferences] Applied isMainControlsMinimized pref: ${this.isMainControlsMinimized}`);
         }

         // Don't Apply Primary State during initial load, ngOnInit handles it
         if (initialLoad) {
             // //////console.log('[loadUserPreferences] Skipping application of primary lastState during initial load.');
         }

         // Load last state values into component properties for later use (e.g., toggleView)
         if (prefs.lastState) {
            this.lastTranslationSurah = prefs.lastState.lastTranslationSurah || 1;
            this.lastTranslationVerse = prefs.lastState.lastTranslationVerse || 1;
            this.lastMushafPage = prefs.lastState.lastMushafPage || this.FIRST_PAGE; // Load actual page
            // Apply secondary state like controls minimized here.
            if (typeof prefs.lastState.isMainControlsMinimized === 'boolean') {
                 this.isMainControlsMinimized = prefs.lastState.isMainControlsMinimized;
                 // //////console.log(`[loadUserPreferences] Applied isMainControlsMinimized pref: ${this.isMainControlsMinimized}`);
            }
         }

         // Don't save merged preferences here, let savePreferences be called explicitly when needed.
         return prefs; // Return the loaded/merged prefs

     } catch (error) {
         console.warn('Error in loadUserPreferences:', error);
         return {}; // Return empty object on error
     }
  }
  // --- END NEW loadUserPreferences ---

  // --- Simplified subscribeToRouteParams (removing flag checks) ---
  private subscribeToRouteParams(): void {
    ////console.log('%c[QuranReader] subscribeToRouteParams called.', 'color: blueviolet');
    if (this.routeParamsSub) {
      this.routeParamsSub.unsubscribe(); // Unsubscribe from previous if any
    }

    this.routeParamsSub = this.route.queryParams.pipe(
      takeUntil(this.destroy$) // Auto-unsubscribe on destroy
      // distinctUntilChanged(), // Consider adding if needed, but check performance
    ).subscribe(async (params) => {
      ////console.log('%c[SubToRouteParams] Received query params:', 'color: blueviolet', params);

      // --- Prevent Overwrite on Default Navigation Back ---
      // If initial load is done and URL params are effectively empty/default, don't proceed.
      // This prevents resetting state set by ngOnInit based on saved preferences.
      const routePage = params['page'] ? parseInt(params['page'], 10) : null;
      const routeMode = params['mode'];
      const routeSurah = params['surah'] ? parseInt(params['surah'], 10) : null;
      const routeVerse = params['verse'] ? parseInt(params['verse'], 10) : null;
      const routeReciterId = params['reciter'] ? parseInt(params['reciter'], 10) : null;
      const routeTranslation = params['translation'];

      if (this.initialLoadComplete && !routeSurah && !routeVerse && !routePage && !routeMode) {
        ////console.log('%c[SubToRouteParams] Initial load complete and URL params are empty/default. Skipping update.', 'color: grey; font-style: italic;');
        return; // Exit early, keep state set by ngOnInit
      }

      // --- Proceed with URL parameter processing ---

      // Check 1: Exit early if initial load isn't done OR we are intentionally ignoring this change
      if (!this.initialLoadComplete || this.ignoreNextQueryParamChange) {
          if (this.ignoreNextQueryParamChange) {
              this.ignoreNextQueryParamChange = false; // Reset ignore flag after use
              //////console.log('%c[SubToRouteParams] Ignored emission due to ignoreNextQueryParamChange flag.', 'color: orange;');
          } else {
              //////console.log('%c[SubToRouteParams] Skipping emission before initial load complete.', 'color: purple; font-style: italic;');
          }
          return;
      }

      // Check 2: Exit early if URL params are effectively empty/default
      if (!routeSurah && !routeVerse && !routePage && !routeMode) {
          ////console.log('%c[SubToRouteParams] URL params are empty/default. Skipping update.', 'color: grey; font-style: italic;');
          return; // Exit early, keep state set by ngOnInit
      }

      // Check 3: Exit early if URL params are the same as current state
      if (this.isMushafView === (routeMode === 'mushaf') && 
          this.currentSurah === routeSurah && 
          this.currentVerse === routeVerse && 
          this.currentPage === routePage) { // Note: currentPage is actual page, routePage is display page. Revisit comparison if needed.
          ////console.log('%c[SubToRouteParams] URL params are the same as current state. No action needed.', 'color: green; font-style: italic;');
          return; // Exit early, no changes needed
      }

      // --- If state differs, update component from URL ---
      ////console.log('%c[SubToRouteParams] URL state differs from component. Updating component.', 'color: red; font-weight: bold;');

      let needsContentLoad = false; // Flag to reload content
      let needsSecondaryUpdate = false; // Flag for secondary changes

      // Update Primary State (View Mode, Surah, Verse/Page)
      // Compare primary navigation state
      const urlIsMushaf = routeMode === 'mushaf';
      const urlTargetDisplayPage = urlIsMushaf ? (routePage || 1) : (this.actualToDisplayPage(this.quranFlash.surahPageMap[routeSurah || 1] || this.FIRST_PAGE));
      const urlTargetActualPage = this.displayToActualPage(urlTargetDisplayPage);

      // Determine if primary state needs update
      const primaryStateDiffers = 
          this.isMushafView !== urlIsMushaf ||
          this.currentSurah !== (routeSurah || 1) || 
          (!urlIsMushaf && this.currentVerse !== (routeVerse || 1)) ||
          (urlIsMushaf && this.displayPageNumberSubject.value !== urlTargetDisplayPage);

      if (primaryStateDiffers) {
          ////console.log(`%c[SubToRouteParams] Updating PRIMARY state: Mode:${urlIsMushaf ? 'Mushaf' : 'Translation'}, S:${routeSurah || 1} V:${routeVerse || 1} DisplayP:${urlTargetDisplayPage} ActualP:${urlTargetActualPage}`, 'color: red;');
          this.isMushafView = urlIsMushaf;
          this.currentSurah = routeSurah || 1;
          this.selectedSurah = routeSurah || 1; // Keep dropdown synced
          this.currentVerse = routeVerse || 1;
          this.displayPageNumberSubject.next(urlTargetDisplayPage); // Sync display page
          this.pageInput = urlTargetDisplayPage; // Sync input field
          this.currentPage = urlTargetActualPage; // Update internal actual page
          this.updateTitleAndMeta(this.currentSurah); // Update title/meta
          needsContentLoad = true; // Primary navigation changed, need to reload
      }

      // Update Secondary State (Reciter/Translation)
      if (routeReciterId !== null && routeReciterId !== undefined && routeReciterId !== this.selectedReciter?.id) {
          const foundReciter = this.reciters.find(r => r.id === routeReciterId);
          if (foundReciter) {
              this.selectedReciter = foundReciter;
              needsSecondaryUpdate = true;
              ////console.log(`%c[SubToRouteParams] Updating Reciter to: ${foundReciter.name}`, 'color: red;');
          }
      }
      if (routeTranslation !== null && routeTranslation !== undefined && routeTranslation !== this.selectedTranslation) {
          this.selectedTranslation = routeTranslation;
          //////console.log(`%c[SubToRouteParams] Updating Translation to: ${routeTranslation}`, 'color: red;');
          needsSecondaryUpdate = true;
          needsContentLoad = true; // Translation change ALWAYS requires content reload
      }

      // Trigger Change Detection if any state updated
      if (primaryStateDiffers || needsSecondaryUpdate) { // Use the calculated flag
           this.changeDetector.markForCheck();
      }

      // Reload Content if Needed
      if (needsContentLoad) {
          ////console.log('%c[SubToRouteParams] Triggering content reload due to URL change.', 'color: red; font-weight:bold;');
          // Use the updated state derived from the URL
          // Pass the calculated target state variables
          this.loadInitialContent(this.currentSurah, this.currentVerse, this.isMushafView, this.displayPageNumberSubject.value);
      } else if (needsSecondaryUpdate) {
          // Only secondary changed, save preferences now
          this.debouncedSavePreferences();
      }
    });
  }
}

