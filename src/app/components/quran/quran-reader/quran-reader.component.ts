export {};

import { Component, OnInit, OnDestroy, HostListener, Input, Output, EventEmitter, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QuranService, QuranVerse, Reciter, Surah, Juz, WordDetails } from '../../../services/quran.service';
import { Observable, forkJoin, firstValueFrom, Subscription, map, from, of, catchError } from 'rxjs';
import { ClickOutsideDirective } from '../../../directives/click-outside.directive';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SttService } from '../../../services/stt.service';
import { QuranFlashService } from '../../../services/quran-flash.service';
import { Router, ActivatedRoute, Params, RouterModule } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FirebaseAuthService } from '../../../services/firebase-auth.service';
import { ToastService } from '../../../services/toast.service';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';

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

@Component({
    selector: 'app-quran-reader',
    templateUrl: './quran-reader.component.html',
    styleUrls: ['./quran-reader.component.scss'],
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        RouterModule,
        MatTooltipModule,
        MatProgressSpinnerModule,
        MatButtonModule,
        MatIconModule,
        MatSliderModule,
        MatSelectModule,
        MatInputModule,
        MatFormFieldModule,
        MatMenuModule,
        MatProgressBarModule,
        ClickOutsideDirective
    ],
    host: {
        '[class.mat-app-background]': 'true'
    }
})
export class QuranReaderComponent implements OnInit, OnDestroy {
  @Input() selectedSurah: number = 1;
  @Output() surahSelectionChange = new EventEmitter<number>();
  surahs: Surah[] = [];
  currentSurah: number | undefined = 1;
  verses: QuranVerse[] = [];
  selectedVerse?: QuranVerse;
  tafsir: string = '';
  bookmarks: string[] = [];
  selectedReciter!: Reciter;
  reciters: Reciter[] = [];
  audioPlayer: HTMLAudioElement = new Audio();
  isLoading: boolean = false;
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
  mushafImageUrl: string = '';
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
  currentPreferences: any = { reciterId: 7 };
  navigationTimeout: any;

  constructor(
    public quranService: QuranService,
    private sttService: SttService,
    private quranFlash: QuranFlashService,
    private router: Router,
    private sanitizer: DomSanitizer,
    private authService: FirebaseAuthService,
    private toastService: ToastService,
    private route: ActivatedRoute,
    private changeDetector: ChangeDetectorRef
  ) {
    // Don't set reciters here, wait for ngOnInit
  }

  async ngOnInit() {
    try {
      console.log('Initializing Quran reader component...');
      
      // Show loading UI immediately with default values
      this.showLoadingUI();
      
      // Check for verse navigation from state
      const navigation = this.router.getCurrentNavigation();
      const state = navigation?.extras?.state as {
        surah: number;
        verse: number;
        scrollToVerse: boolean;
      };

      if (state?.scrollToVerse) {
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          this.navigateToVerse(state.surah, state.verse);
        });
      }
      
      // Start loading data in the background
      await this.initializeInBackground();
      
      // If we have a verse to scroll to, do it after initialization
      if (state?.scrollToVerse) {
        setTimeout(() => {
          console.log(`Scrolling to verse ${state.verse}`);
          this.scrollToVerse(state.verse);
        }, 1000);
      }
    } catch (error) {
      console.error('Error initializing Quran reader:', error);
      // Try with default values as fallback
      this.initializeWithDefaults();
    }
  }

  /**
   * Show initial UI with loading indicators to improve perceived performance
   */
  private showLoadingUI() {
    // Set default values for immediate display
    this.isLoading = true;
    this.currentSurah = 1;
    this.selectedSurah = 1;
    this.verses = Array(7).fill({}).map((_, i) => ({ 
      number: i + 1, 
      surahNumber: 1,
      text: 'Loading...', 
      translation: 'Loading...',
      transliteration: '',
      audio: '',
      words: []
    } as QuranVerse));
    
    this.currentSurahDetails = {
      number: 1,
      name: 'Al-Fatiha',
      englishName: 'Al-Fatiha',
      englishNameTranslation: 'The Opening',
      revelationType: 'Meccan',
      numberOfAyahs: 7
    } as Surah;
    
    this.showingTranslation = true;
  }

  /**
   * Asynchronously initializes background data loading without blocking UI
   */
  private async initializeInBackground() {
    try {
      console.log('Initializing Quran reader in background...');
      
      // Essential loading tasks
      const essentialLoadingTasks = [
        this.loadSurahs(),
        this.loadRecitersData(),
        this.loadTranslationsData()
      ];
      
      // Flag to track if we've already done an auth check in this session
      const authCheckedOnce = localStorage.getItem('auth_checked_on_init') === 'true';
      
      // Initialize with default values
      if (!this.preferences) {
        this.preferences = {
          selectedReciter: 7, // Default to Mishary Rashid Alafasy
          selectedTranslation: '131', // Default to Sahih International
          fontSize: 24,
          showWordByWord: false,
          darkMode: false,
          arabicFont: 'uthmani',
          lastState: {
            isMushafView: false,
            lastSurah: 1,
            lastPage: 1
          }
        };
      }
      
      // Try to preload user preferences
      let userPreferences: any = null;
      
      if (!authCheckedOnce) {
        try {
          // Check authentication status with a short timeout
          const isAuthenticated = await Promise.race([
            this.authService.isAuthenticated(),
            new Promise(resolve => setTimeout(() => resolve(false), 1000))
          ]);
          
          if (isAuthenticated) {
            // Get user preferences just once during initialization
            userPreferences = await this.authService.getUserSettings();
            this.preferences = {
              ...this.preferences,
              ...userPreferences
            };
          }
          
          // Mark that we've done the auth check
          localStorage.setItem('auth_checked_on_init', 'true');
        } catch (error) {
          console.warn('Auth check error, using default preferences:', error);
        }
      } else {
        // Use cached preferences from localStorage if available
        try {
          const cachedPrefs = localStorage.getItem('quranReaderPreferences');
          if (cachedPrefs) {
            this.preferences = {
              ...this.preferences,
              ...JSON.parse(cachedPrefs)
            };
          }
        } catch (error) {
          console.warn('Error loading cached preferences:', error);
        }
      }
      
      // Start essential tasks with a timeout
      await Promise.race([
        Promise.all(essentialLoadingTasks),
        new Promise(resolve => setTimeout(resolve, 2000)) // 2 second timeout
      ]);
      
      // Parse URL parameters to determine what to load
      const queryParams = new URLSearchParams(window.location.search);
      const surahParam = queryParams.get('surah');
      const verseParam = queryParams.get('ayah');
      const pageParam = queryParams.get('page');
      const modeParam = queryParams.get('mode');
      const reciterParam = queryParams.get('reciter');
      const translationParam = queryParams.get('translation');
      
      // Handle reciter from URL
      if (reciterParam) {
        const reciterId = parseInt(reciterParam, 10);
        const reciter = this.reciters.find(r => r.id === reciterId);
        if (reciter) {
          this.selectedReciter = reciter;
        }
      } else if (this.preferences?.reciterId) {
        // Use reciter from preferences
        const reciter = this.reciters.find(r => r.id === this.preferences.reciterId);
        if (reciter) {
          this.selectedReciter = reciter;
        }
      } else {
        // Default to first reciter
        this.selectedReciter = this.reciters[0];
      }
      
      // Handle translation from URL
      if (translationParam) {
        this.selectedTranslation = translationParam;
      } else if (this.preferences?.translationId) {
        // Use translation from preferences
        this.selectedTranslation = this.preferences.translationId;
      }
      
      // Set view mode based on URL or preferences
      if (modeParam === 'mushaf') {
        this.isMushafView = true;
      } else if (modeParam === 'translation') {
        this.isMushafView = false;
      } else {
        // If no URL parameter, use preference or default to translation view
        this.isMushafView = this.preferences?.viewMode === 'mushaf';
      }
      
      // If we're in the mushaf view and have a page parameter
      if (this.isMushafView && pageParam) {
        const pageNumber = parseInt(pageParam, 10);
        await this.loadMushafPage(this.displayToActualPage(pageNumber));
      } 
      // If we have a surah parameter, load that surah
      else if (surahParam) {
        const surahNumber = parseInt(surahParam, 10);
        this.currentSurah = surahNumber;
        this.selectedSurah = surahNumber;
        
        await firstValueFrom(this.loadSurah(surahNumber));
        
        // If verse parameter exists, scroll to that verse
        if (verseParam) {
          setTimeout(() => {
            this.scrollToVerse(parseInt(verseParam, 10));
          }, 500);
        }
      }
      // Otherwise, load from user preferences
      else {
        // Skip redundant preference loading since we already loaded them
        await this.initializeWithUserPreferences();
      }

      // Cache loaded data for faster future loads
      if (this.verses?.length > 0 && this.currentSurah) {
        try {
          localStorage.setItem(`quran_surah_${this.currentSurah}`, JSON.stringify(this.verses));
        } catch (error) {
          // Ignore storage errors
        }
      }
      
      // Make sure loading indicator is removed
      this.isLoading = false;
      
      // Load fonts and setup audio in the background (non-blocking)
      this.loadFonts().catch(err => console.warn('Error loading fonts:', err));
      this.setupAudioEvents();
      
    } catch (error) {
      console.error('Error initializing Quran reader:', error);
      // Try to recover with defaults
      this.initializeWithDefaults();
    }
  }

  /**
   * Load cached data from localStorage if available for immediate display
   */
  private loadCachedDataIfAvailable() {
    try {
      // Try to load cached state
      const lastState = localStorage.getItem('quran_reader_state');
      if (lastState) {
        const state = JSON.parse(lastState);
        
        // Set view mode based on cached preference
        if (state.isMushafView !== undefined) {
          this.isMushafView = state.isMushafView;
        }
        
        // Load surah or page based on view mode
        if (this.isMushafView && state.lastPage) {
          // In mushaf view, set page number
          const displayPage = state.lastPage;
          this.displayPageNumber = displayPage;
          this.currentPage = this.displayToActualPage(displayPage);
          
          // Try to load cached mushaf image
          const cachedImageUrl = localStorage.getItem(`mushaf_page_${this.currentPage}`);
          if (cachedImageUrl) {
            this.mushafImageUrl = cachedImageUrl;
            this.isLoading = false;
          }
        } else if (state.lastSurah) {
          // In translation view, set surah
          this.currentSurah = state.lastSurah;
          this.selectedSurah = state.lastSurah;
          
          // Try to load cached surah data
          const cachedSurah = localStorage.getItem(`quran_surah_${this.currentSurah}`);
          if (cachedSurah) {
            try {
              this.verses = JSON.parse(cachedSurah);
              
              // Find surah details if available
              const cachedSurahs = localStorage.getItem('quran_surahs');
              if (cachedSurahs) {
                this.surahs = JSON.parse(cachedSurahs);
                this.currentSurahDetails = this.surahs.find(s => s.number === this.currentSurah);
              }
              
              // Show content with cache data while loading fresh data
              setTimeout(() => {
                this.isLoading = false;
              }, 100);
            } catch (parseError) {
              console.warn('Error parsing cached surah:', parseError);
            }
          }
        }
      }
      
      // Load preferences
      const cachedPrefs = localStorage.getItem('quranReaderPreferences');
      if (cachedPrefs) {
        try {
          const prefs = JSON.parse(cachedPrefs);
          // Apply basic preferences
          if (prefs.fontSize) this.fontSize = prefs.fontSize;
          if (prefs.selectedTranslation) this.selectedTranslation = prefs.selectedTranslation;
          if (prefs.selectedTafsir) this.selectedTafsir = prefs.selectedTafsir;
          if (prefs.bookmarks) this.bookmarks = prefs.bookmarks;
        } catch (parseError) {
          console.warn('Error parsing cached preferences:', parseError);
        }
      }
    } catch (error) {
      console.warn('Error loading cached data:', error);
    }
  }

  private async loadSurahs(): Promise<void> {
    try {
      // First try to load from cache
      const cachedSurahs = localStorage.getItem('quran_surahs');
      if (cachedSurahs) {
        try {
          this.surahs = JSON.parse(cachedSurahs);
          console.log('Loaded surah list from cache');
          if (this.surahs.length > 0) {
            return Promise.resolve();
          }
        } catch (parseError) {
          console.warn('Error parsing cached surahs:', parseError);
        }
      }
      
      // If no cache or cache is invalid, load from API
      console.log('Loading surah list from API...');
      
      // Create a promise that will reject after 5 seconds
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout loading surah list')), 5000);
      });
      
      // Race between the actual data fetch and the timeout
      this.surahs = await Promise.race([
        firstValueFrom(this.quranService.getSurahList()),
        timeoutPromise
      ]) as Surah[];
      
      // Cache the result
      try {
        localStorage.setItem('quran_surahs', JSON.stringify(this.surahs));
      } catch (cacheError) {
        console.warn('Error caching surahs:', cacheError);
      }
      
      console.log('Loaded surah list successfully', this.surahs.length);
      return Promise.resolve();
    } catch (error) {
      console.error('Error loading surah list:', error);
      
      // Provide fallback data if loading fails
      if (this.surahs.length === 0) {
        console.log('Using fallback surah list');
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

  loadSurah(surahNumber: number): Observable<void> {
    if (!surahNumber) return of(void 0);
    
    this.isLoading = true;
    
    // Ensure selectedReciter is initialized
    if (!this.selectedReciter && this.quranService.reciters && this.quranService.reciters.length > 0) {
      console.log('Initializing selectedReciter in loadSurah');
      this.selectedReciter = this.quranService.reciters[0];
    }
    
    // Try to load from cache first for immediate display
    const cachedSurah = localStorage.getItem(`quran_surah_${surahNumber}`);
    if (cachedSurah) {
      try {
        this.verses = JSON.parse(cachedSurah);
        
        // Add audio URLs to cached verses
        if (this.selectedReciter) {
          this.verses = this.verses.map(verse => ({
            ...verse,
            audio: this.quranService.getVerseAudioUrl(
              this.selectedReciter.id, 
              `${surahNumber}:${verse.number}`
            )
          }));
        }
        
        this.currentSurah = surahNumber;
        this.selectedSurah = surahNumber;
        
        // Set surah details
        const surahDetails = this.surahs.find(s => s.number === surahNumber);
        if (surahDetails) {
          this.currentSurahDetails = surahDetails;
          this.surahName = surahDetails.name;
        }
        
        // Hide loading after a short delay
        setTimeout(() => {
          this.isLoading = false;
        }, 100);
        
        // Still load fresh data in the background
      } catch (parseError) {
        console.warn('Error parsing cached surah:', parseError);
      }
    }
    
    // Load fresh data from API
    return this.quranService.getSurah(surahNumber, this.selectedTranslation).pipe(
      map(verses => {
        // Update verses with correct audio URLs for current reciter
        this.verses = verses.map(verse => ({
          ...verse,
          audio: this.selectedReciter
            ? this.quranService.getVerseAudioUrl(this.selectedReciter.id, `${surahNumber}:${verse.number}`)
            : '' // Provide empty string as fallback
        }));
        
        this.currentSurah = surahNumber;
        this.selectedSurah = surahNumber;
        this.surahSelectionChange.emit(surahNumber);
        
        const surahDetails = this.surahs.find(s => s.number === surahNumber);
        if (surahDetails) {
          this.currentSurahDetails = surahDetails;
          this.surahName = surahDetails.name;
        }
        
        // Cache the loaded surah
        try {
          localStorage.setItem(`quran_surah_${surahNumber}`, JSON.stringify(verses));
        } catch (cacheError) {
          console.warn('Error caching surah:', cacheError);
        }
        
        this.isLoading = false;
      }),
      catchError(error => {
        console.error('Error loading surah:', error);
        this.isLoading = false;
        this.toastService.show('Error loading surah');
        return of(void 0);
      })
    );
  }

  async playAudio(audioUrl: string, verseNumber?: number) {
    // Stop any currently playing audio first
    await this.stopAndCloseAudioPlayer();
    
    try {
      // Validate audio URL
      if (!audioUrl || audioUrl === '') {
        console.error('Empty audio URL provided');
        return;
      }
      
      // If the audioUrl is in the format of surah:verse, convert it to an actual URL
      if (audioUrl.includes(':')) {
        const [surah, verse] = audioUrl.split(':');
        const reciterId = this.selectedReciter?.id || 7;
        audioUrl = this.quranService.getVerseAudioUrl(reciterId, `${surah}:${verse}`);
      }
      
      // Ensure we have a valid URL
      if (!audioUrl.startsWith('http://') && !audioUrl.startsWith('https://')) {
        console.error('Invalid audio URL:', audioUrl);
        return;
      }
      
      // Create new audio instance
      this.audioPlayer = new Audio(audioUrl);
      
      // Set up event listeners
      this.setupAudioEvents();
      
      // Set current verse
      this.currentPlayingVerse = verseNumber || null;
      this.isPlaying = true;
      this.audioPaused = false;
      
      // Load and play
      await this.audioPlayer.load();
      await this.audioPlayer.play();
      
      // Auto-scroll to verse if provided
      if (verseNumber) {
        this.scrollToVerse(verseNumber);
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      this.stopAndCloseAudioPlayer();
    }
  }

  async stopAndCloseAudioPlayer() {
    try {
      if (this.audioPlayer) {
        // Remove all event listeners
        const events = ['timeupdate', 'loadedmetadata', 'ended', 'error', 'play', 'pause'];
        events.forEach(event => {
          this.audioPlayer.removeEventListener(event, () => {});
        });
        
        // Stop playback
        await this.audioPlayer.pause();
        this.audioPlayer.currentTime = 0;
        this.audioPlayer.src = '';
        
        // Reset state
        this.isPlaying = false;
        this.audioPaused = true;
        this.isPlayingFullSurah = false;
        this.currentPlayingVerse = null;
        this.currentlyPlaying = '';
        this.progress = 0;
        this.currentTime = '0:00';
        this.duration = '0:00';
        
        // Create new audio instance
        this.audioPlayer = new Audio();
        this.setupAudioEvents();
        
        // Force change detection
        this.changeDetector.detectChanges();
      }
    } catch (error) {
      console.error('Error stopping audio player:', error);
    }
  }

  private setupAudioEvents() {
    if (!this.audioPlayer) return;

    // Clear any existing listeners
    const events = ['timeupdate', 'loadedmetadata', 'ended', 'error', 'play', 'pause'];
    events.forEach(event => {
      this.audioPlayer.removeEventListener(event, () => {});
    });

    // Time update event
    this.audioPlayer.addEventListener('timeupdate', () => {
      if (this.audioPlayer.duration) {
        this.currentTime = this.formatTime(this.audioPlayer.currentTime);
        this.progress = (this.audioPlayer.currentTime / this.audioPlayer.duration) * 100;
        this.changeDetector.detectChanges();
      }
    });

    // Metadata loaded event
    this.audioPlayer.addEventListener('loadedmetadata', () => {
      if (!isNaN(this.audioPlayer.duration)) {
        this.duration = this.formatTime(this.audioPlayer.duration);
        this.changeDetector.detectChanges();
      }
    });

    // Playback ended event
    this.audioPlayer.addEventListener('ended', () => {
      if (this.isRepeatEnabled) {
        this.audioPlayer.currentTime = 0;
        this.audioPlayer.play();
      } else {
        this.stopAndCloseAudioPlayer();
      }
    });

    // Error event
    this.audioPlayer.addEventListener('error', (e) => {
      console.error('Audio playback error:', e);
      this.stopAndCloseAudioPlayer();
    });
  }

  skipBackward() {
    if (!this.audioPlayer || !this.audioPlayer.duration) return;
    
    const newTime = Math.max(0, this.audioPlayer.currentTime - 10);
    this.audioPlayer.currentTime = newTime;
    this.progress = (newTime / this.audioPlayer.duration) * 100;
    this.currentTime = this.formatTime(newTime);
    this.changeDetector.detectChanges();
  }

  skipForward() {
    if (!this.audioPlayer || !this.audioPlayer.duration) return;
    
    const newTime = Math.min(this.audioPlayer.duration, this.audioPlayer.currentTime + 10);
    this.audioPlayer.currentTime = newTime;
    this.progress = (newTime / this.audioPlayer.duration) * 100;
    this.currentTime = this.formatTime(newTime);
    this.changeDetector.detectChanges();
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

  playVerse(verse: QuranVerse) {
    if (!verse) {
      console.warn('Cannot play verse - missing verse');
      return;
    }
    
    // Ensure verse key is available, or construct it
    const verseKey = verse.audio || `${this.currentSurah}:${verse.number}`;
    
    // Get audio URL using the currently selected reciter
    const audioUrl = this.quranService.getVerseAudioUrl(
      this.selectedReciter?.id || 7, 
      verseKey
    );
    
    if (!audioUrl) {
      console.warn('Cannot play verse - unable to generate audio URL');
      return;
    }
    
    console.log(`Playing verse ${verse.number} with reciter ${this.selectedReciter?.id || 7} (${this.selectedReciter?.name}). URL: ${audioUrl}`);
    this.playAudio(audioUrl, verse.number);
  }

  togglePlay() {
    if (this.audioPlayer.paused) {
      this.audioPlayer.play();
      this.audioPaused = false;
    } else {
      this.audioPlayer.pause();
      this.audioPaused = true;
    }
  }

  seekAudio(event: Event) {
    const input = event.target as HTMLInputElement;
    const time = (Number(input.value) / 100) * this.audioPlayer.duration;
    this.audioPlayer.currentTime = time;
  }

  loadVerses() {
    this.loadSurah(this.currentSurah || 1);
  }

  isBookmarked(verseNumber: number): boolean {
    if (!this.currentSurah) return false;
    const verseKey = `${this.currentSurah}:${verseNumber}`;
    return this.bookmarks.includes(verseKey);
  }

  async toggleBookmark(verseNumber: number) {
    if (!this.currentSurah) return;
    
    try {
      const verseKey = `${this.currentSurah}:${verseNumber}`;
      
      if (this.isBookmarked(verseNumber)) {
        // Remove bookmark
        await this.authService.removeBookmark(verseKey);
        this.bookmarks = this.bookmarks.filter(b => b !== verseKey);
        this.toastService.show('Bookmark removed');
      } else {
        // Add bookmark
        const updatedBookmarks = [...this.bookmarks, verseKey];
        const currentPrefs = await this.authService.getUserSettings() || {
          selectedReciter: this.selectedReciter?.id,
          selectedTranslation: this.selectedTranslation,
          fontSize: this.fontSize,
          bookmarks: []
        };
        
        await this.authService.saveUserPreferences({
          ...currentPrefs,
          bookmarks: updatedBookmarks
        });
        
        this.bookmarks = updatedBookmarks;
        this.toastService.show('Bookmark added');
      }
      
      // Save state after bookmark update
      await this.saveState();
    } catch (error) {
      console.error('Error toggling bookmark:', error);
      this.toastService.show('Error updating bookmark');
    }
  }

  ngOnDestroy() {
    // Save state and reading history when leaving the component
    this.saveState();
    if (this.currentSurah && this.currentRecitingVerse) {
      this.authService.saveQuranReaderState({
        surah: this.currentSurah,
        verse: this.currentRecitingVerse,
        position: window.scrollY,
        lastRead: new Date()
      });
    }
    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer = new Audio();
    }
    if (this.verseCheckInterval) {
      clearInterval(this.verseCheckInterval);
    }
  }

  // Play the full surah audio
  playFullSurah(): void {
    // Get the surah number from the current surah
    let surahNumber: number;
    if (typeof this.currentSurah === 'object' && this.currentSurah && 'number' in this.currentSurah) {
      surahNumber = this.surahNumber;
    } else {
      surahNumber = Number(this.currentSurah);
    }
    
    if (!surahNumber) {
      this.toastService.show('Unable to play: Invalid surah selected');
      return;
    }

    // If already playing full surah, stop it
    if (this.isPlayingFullSurah) {
      this.stopFullSurah();
      return;
    }

    // Use the selected reciter ID instead of default preferences
    const reciterId = this.selectedReciter?.id || 7;
    
    // Get the full surah audio URL using the QuranService
    let audioUrl = this.quranService.getSurahAudioUrl(surahNumber, reciterId);
    
    if (!audioUrl) {
      this.toastService.show('Audio URL not available. Trying fallback...');
      // Try fallback to default reciter
      audioUrl = this.quranService.getSurahAudioUrl(surahNumber, 7);
      if (!audioUrl) {
        this.toastService.show('Unable to play surah audio');
        return;
      }
    }
    
    // Play the audio
    this.audioElement = new Audio(audioUrl);
    
    // Set up event listeners
    this.audioElement.addEventListener('ended', () => {
      this.isPlayingFullSurah = false;
      this.changeDetector.detectChanges();
    });

    this.audioElement.addEventListener('error', (e: Event) => {
      const mediaError = this.audioElement?.error;
      const errorMessage = mediaError ? `Error code: ${mediaError.code}` : 'Unknown error';
      
      // Try an alternative URL format as fallback
      const formattedSurah = surahNumber.toString().padStart(3, '0');
      const fallbackUrl = `https://server8.mp3quran.net/afs/${formattedSurah}.mp3`;
      
      this.toastService.show('Error playing audio. Trying alternative source...');
      
      // Try with fallback URL
      this.audioElement = new Audio(fallbackUrl);
      this.audioElement.addEventListener('ended', () => {
        this.isPlayingFullSurah = false;
        this.changeDetector.detectChanges();
      });
      
      this.audioElement.addEventListener('error', () => {
        this.toastService.show('Could not play surah audio from any source');
        this.isPlayingFullSurah = false;
        this.changeDetector.detectChanges();
      });
      
      this.audioElement.play()
        .then(() => {
          this.isPlayingFullSurah = true;
          this.changeDetector.detectChanges();
        })
        .catch(() => {
          this.toastService.show('Unable to play surah audio');
          this.isPlayingFullSurah = false;
          this.changeDetector.detectChanges();
        });
    });

    this.audioElement.play()
      .then(() => {
        this.isPlayingFullSurah = true;
        this.changeDetector.detectChanges();
      })
      .catch((error: Error) => {
        this.toastService.show('Failed to play audio. Trying alternative source...');
        
        // Try an alternative URL format as fallback
        const formattedSurah = surahNumber.toString().padStart(3, '0');
        const fallbackUrl = `https://server8.mp3quran.net/afs/${formattedSurah}.mp3`;
        
        this.audioElement = new Audio(fallbackUrl);
        this.audioElement.play()
          .then(() => {
            this.isPlayingFullSurah = true;
            this.changeDetector.detectChanges();
          })
          .catch(() => {
            this.toastService.show('Unable to play surah audio from any source');
            this.isPlayingFullSurah = false;
            this.changeDetector.detectChanges();
          });
      });
  }

  // Stop the currently playing audio
  stopAudio(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.isPlayingFullSurah = false;
      this.currentPlayingVerse = null;
      this.changeDetector.detectChanges();
    }
  }

  // Alias for stopAudio to maintain compatibility with existing code
  stopFullSurah(): void {
    this.stopAudio();
  }

  highlightText(text: string | undefined): string {
    if (!this.searchQuery || !text) return text || '';
    const regex = new RegExp(`(${this.searchQuery})`, 'gi');
    return text.replace(regex, '<mark class="bg-yellow-200">$1</mark>');
  }

  onSearchInput() {
    const query = this.searchQuery.trim();
    
    // Check for surah:verse format (e.g., 2:255)
    const verseRegex = /^(\d+):(\d+)$/;
    const match = query.match(verseRegex);
    
    if (match) {
      const [_, surahNumber, verseNumber] = match;
      this.goToVerse(parseInt(surahNumber), parseInt(verseNumber));
      return;
    }

    // Continue with existing search logic
    if (query.length > 2) {
      this.isSearching = true;
      this.showSuggestions = true;
      
      this.quranService.searchQuran(query).subscribe({
        next: (response) => {
          this.searchSuggestions = response.suggestions;
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

  async selectSurah(surahNumber: number) {
    console.log('Selecting surah:', surahNumber);
    if (!surahNumber) return;
    
    // Reset verse tracking when switching surahs
    if (this.currentSurah !== surahNumber) {
      this.currentRecitingVerse = null;
      this.currentVerseIndex = 0;
      this.currentPlayingVerse = null;
    }
    
    this.selectedSurah = surahNumber;
    this.currentSurah = surahNumber;
    
    if (this.isMushafView) {
      // Get the correct page for this surah
      const page = this.quranFlash.surahPageMap[surahNumber];
      if (page) {
        console.log('Loading page for surah:', page);
        // page is already the actual file number (10-627)
        this.currentPage = page;
        // Convert to display number (1-604) for the controls
        this.displayPageNumber = this.quranFlash.actualToDisplayPage(page);
        console.log('Display page number:', this.displayPageNumber);
        await this.loadMushafPage(page);
        
        // Update surah details
        const surahDetails = this.surahs.find(s => s.number === surahNumber);
        if (surahDetails) {
          this.currentSurahDetails = surahDetails;
          this.surahName = surahDetails.name;
        }
        
        // Update URL parameters
        this.updateUrlParams();
      }
    } else {
      this.quranService.getSurah(surahNumber, this.selectedTranslation)
        .subscribe({
          next: (verses) => {
            this.verses = verses;
            const surahDetails = this.surahs.find(s => s.number === surahNumber);
            if (surahDetails) {
              this.currentSurahDetails = surahDetails;
              this.surahName = surahDetails.name;
            }
            this.surahSelectionChange.emit(surahNumber);
            // Update URL parameters
            this.updateUrlParams();
          },
          error: (error) => console.error('Error loading surah:', error),
          complete: () => this.isLoading = false
        });
    }
    await this.saveState();
  }

  goToVerse(surahNumber: number, verseNumber: number) {
    if (!surahNumber || !verseNumber) return;

    // Debounce the navigation to prevent multiple rapid calls
    if (this.navigationTimeout) {
      clearTimeout(this.navigationTimeout);
    }

    this.navigationTimeout = setTimeout(() => {
      // If we're in mushaf view, switch to translation view
      if (this.isMushafView) {
        this.isMushafView = false;
      }

      // Update current surah
      this.currentSurah = surahNumber;
      
      // If the surah isn't already loaded, load it first
      if (this.selectedSurah !== surahNumber) {
        this.isLoading = true;
        this.selectSurah(surahNumber).then(() => {
          // After surah loads, scroll to verse
          requestAnimationFrame(() => {
            this.scrollToVerse(verseNumber);
            this.isLoading = false;
            // Save to reading history but don't update URL
            this.saveState();
          });
        });
      } else {
        // Surah already loaded, just scroll to verse
        requestAnimationFrame(() => {
          this.scrollToVerse(verseNumber);
          this.saveState();
        });
      }
    }, 300); // Add a small delay to prevent rapid consecutive calls
  }

  private scrollToVerse(verseNumber: number) {
    if (!verseNumber) return;

    // Try to find the verse element
    const attemptScroll = (attempts = 0) => {
      const verseElement = document.getElementById(`verse-${verseNumber}`);
      if (verseElement) {
        // Remove any existing highlights
        document.querySelectorAll('.highlighted-verse').forEach(el => {
          el.classList.remove('highlighted-verse');
        });
        
        // Add highlight to current verse
        verseElement.classList.add('highlighted-verse');
        
        // Scroll to verse with smooth animation
        verseElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
        
        // Set as current verse
        this.currentRecitingVerse = verseNumber;
        
        // Remove highlight after animation
        setTimeout(() => {
          verseElement.classList.remove('highlighted-verse');
        }, 3000);
        
        // Update URL params
        this.updateUrlParams();
      } else if (attempts < 10) {
        // Retry with increasing delay
        setTimeout(() => attemptScroll(attempts + 1), 200 * (attempts + 1));
      } else {
        console.warn(`Failed to find verse element for verse ${verseNumber}`);
      }
    };
    
    // Start scroll attempt
    attemptScroll();
  }

  showWordDetails(wordId: number) {
    this.quranService.getWordDetails(wordId).subscribe(details => {
      this.selectedWordDetails = details;
    });
  }

  loadJuz(juzNumber: number | undefined) {
    if (!juzNumber) return; // Add early return if juzNumber is undefined
    
    this.isLoading = true;
    this.quranService.getJuzVerses(juzNumber).subscribe({
      next: (verses) => {
        this.verses = verses;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading juz:', error);
        this.isLoading = false;
      }
    });
  }

  playWord(word: any) {
    if (this.currentWord?.audioUrl === word.audioUrl && this.isPlayingWord) {
      this.audioPlayer.pause();
      this.isPlayingWord = false;
    } else {
      this.currentWord = word;
      this.audioPlayer.src = word.audioUrl;
      this.audioPlayer.play();
      this.isPlayingWord = true;
    }
  }

  toggleFullSurahPlay() {
    if (this.audioPlayer.paused) {
      this.audioPlayer.play();
      this.audioPaused = false;
    } else {
      this.audioPlayer.pause();
      this.audioPaused = true;
    }
  }

  toggleDarkMode() {
    this.isDarkMode = !this.isDarkMode;
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('darkMode', this.isDarkMode.toString());
  }

  private checkDarkMode() {
    const savedMode = localStorage.getItem('darkMode');
    if (savedMode === 'true') {
      this.isDarkMode = true;
      document.documentElement.classList.add('dark');
    }
  }

  toggleArabicFont() {
    this.arabicFont = this.arabicFont === 'uthmani' ? 'naskh' : 'uthmani';
    localStorage.setItem('arabicFont', this.arabicFont);
  }

  toggleWordByWord() {
    this.showWordByWord = !this.showWordByWord;
    localStorage.setItem('showWordByWord', this.showWordByWord.toString());
  }

  async copyVerse(verse: QuranVerse) {
    try {
      const text = `${verse.text}\n${verse.translation}`;
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy verse:', err);
    }
  }

  selectWord(word: { text: string, translation: string }) {
    this.selectedWord = word;
    if (window.innerWidth <= 768) { // Show popup on mobile
      // Mobile handling logic here
    }
  }

  toggleTranslation() {
    this.showingTranslation = !this.showingTranslation;
    localStorage.setItem('showTranslation', this.showingTranslation.toString());
  }

  adjustPlaybackRate(change: number) {
    const newRate = Math.max(0.25, Math.min(2, this.audioPlayer.playbackRate + change));
    this.audioPlayer.playbackRate = newRate;
  }

  toggleRepeat() {
    this.isRepeatEnabled = !this.isRepeatEnabled;
    this.audioPlayer.loop = this.isRepeatEnabled;
  }

  showWordTranslation(word: { text: string, translation: string }, event: MouseEvent) {
    event.stopPropagation(); // Stop event bubbling
    if (word && word.translation) {
      this.selectedWord = word;
    }
  }

  hideWordTranslation(event: MouseEvent) {
    event.stopPropagation(); // Stop event bubbling
    this.selectedWord = null;
  }

  private checkCurrentVerse() {
    const currentTime = this.audioPlayer.currentTime;
    for (let i = 0; i < this.verses.length; i++) {
      const verse = this.verses[i];
      const nextVerse = this.verses[i + 1];
      const verseStart = this.verseTimestamps[verse.number] || (i * 8); // Approximate 8 seconds per verse
      const verseEnd = nextVerse ? (this.verseTimestamps[nextVerse.number] || ((i + 1) * 8)) : this.audioPlayer.duration;
      
      if (currentTime >= verseStart && currentTime < verseEnd) {
        if (this.currentRecitingVerse !== verse.number) {
          this.currentRecitingVerse = verse.number;
          this.scrollToVerse(verse.number);
        }
        break;
      }
    }
  }

  private setupVerseTracking() {
    this.audioPlayer.ontimeupdate = () => {
      if (!this.isPlayingFullSurah || !this.verseTimings.length) return;
      
      const currentTime = this.audioPlayer.currentTime;
      const now = Date.now();
      
      // Find the current verse using API timing data with buffer
      const currentVerseTiming = this.verseTimings.find(timing => 
        currentTime >= (timing.timestamp_from - this.verseBuffer) && 
        currentTime <= (timing.timestamp_to + this.verseBuffer)
      );

      if (currentVerseTiming && 
          this.currentRecitingVerse !== currentVerseTiming.verse_number && 
          now - this.lastScrollTime > this.scrollBuffer) {
        
        this.currentRecitingVerse = currentVerseTiming.verse_number;
        this.lastScrollTime = now;
        
        // Predict next verse timing for smoother transitions
        const nextVerseTiming = this.verseTimings.find(timing => 
          timing.verse_number === currentVerseTiming.verse_number + 1
        );

        if (nextVerseTiming) {
          const timeUntilNextVerse = nextVerseTiming.timestamp_from - currentTime;
          if (timeUntilNextVerse > 0 && timeUntilNextVerse < 1) {
            // Pre-scroll slightly before next verse starts
            setTimeout(() => {
              this.scrollToVerse(nextVerseTiming.verse_number);
            }, (timeUntilNextVerse * 1000) - 200);
          }
        }

        this.scrollToVerse(currentVerseTiming.verse_number);
        
        // Update progress tracking
        this.currentVerseIndex = this.verses.findIndex(
          v => v.number === currentVerseTiming.verse_number
        );
      }
    };
  }

  toggleView() {
    this.isMushafView = !this.isMushafView;
    
    // Prepare query parameters based on view mode
    let queryParams: any = {};
    
    if (this.isMushafView) {
        // When switching to mushaf mode, get the page for current surah
        const page = this.quranFlash.surahPageMap[this.currentSurah || 1];
        if (page) {
            this.currentPage = page;
            this.displayPageNumber = this.quranFlash.actualToDisplayPage(page);
            this.loadMushafPage(page);
        }
        queryParams = {
            mode: 'mushaf',
            surah: this.currentSurah
        };
    } else {
        // When switching to translation mode, load the current surah
        queryParams = {
            mode: 'translation',
            surah: this.currentSurah
        };
        // Force reload the surah content
        if (this.currentSurah) {
            this.loadSurah(this.currentSurah).subscribe();
        }
    }

    // Update URL with appropriate parameters
    this.router.navigate([], {
        relativeTo: this.router.routerState.root,
        queryParams,
        // Don't merge with existing parameters to ensure clean state
        queryParamsHandling: undefined
    });
    
    this.saveState();
  }

  @HostListener('window:keyup', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (!this.isMushafView) return;
    
    if (event.key === 'ArrowRight') {
      this.previousPage();
    } else if (event.key === 'ArrowLeft') {
      this.nextPage();
    }
  }

  async nextPage() {
    if (this.currentPage < this.LAST_PAGE) {
      const nextPage = this.isDoublePageView ? 
        this.currentPage + 2 : 
        this.currentPage + 1;
      
      if (nextPage <= this.LAST_PAGE) {
        this.currentPage = nextPage;
        this.displayPageNumber = this.quranFlash.actualToDisplayPage(nextPage);
        await this.loadMushafPage(nextPage);
        this.updateSelectedSurah(nextPage);
      }
    }
  }

  async previousPage() {
    if (this.currentPage > this.FIRST_PAGE) {
      const prevPage = this.isDoublePageView ? 
        this.currentPage - 2 : 
        this.currentPage - 1;
      
      if (prevPage >= this.FIRST_PAGE) {
        this.currentPage = prevPage;
        this.displayPageNumber = this.quranFlash.actualToDisplayPage(prevPage);
        await this.loadMushafPage(prevPage);
        this.updateSelectedSurah(prevPage);
      }
    }
  }

  preloadPages() {
    if (this.currentPage < this.LAST_PAGE) {
      const nextImg = new Image();
      nextImg.src = `/quran-pages/quran_Page_${(this.currentPage + 1).toString().padStart(3, '0')}.png`;
    }
    if (this.currentPage > this.FIRST_PAGE) {
      const prevImg = new Image();
      prevImg.src = `/quran-pages/quran_Page_${(this.currentPage - 1).toString().padStart(3, '0')}.png`;
    }
  }

  goToPage() {
    if (this.displayPageNumber >= 1 && this.displayPageNumber <= this.DISPLAY_TOTAL) {
      const actualPage = this.displayToActualPage(this.displayPageNumber);
      this.currentPage = actualPage;
      this.loadMushafPage(actualPage);
      this.updateSelectedSurah(actualPage);
    }
  }

  async loadMushafPage(pageNumber: number) {
    console.log('Loading mushaf page:', pageNumber);
    this.isLoading = true;
    
    try {
      // Check if page number is valid
      if (pageNumber < this.FIRST_PAGE || pageNumber > this.LAST_PAGE) {
        console.error(`Invalid page number: ${pageNumber}. Using first page.`);
        pageNumber = this.FIRST_PAGE;
      }
      
      if (this.isDoublePageView) {
        // In double view, ensure we start with even pages for right-to-left reading
        const startPage = pageNumber % 2 === 0 ? pageNumber : pageNumber + 1;
        console.log('Double view start page:', startPage);
        this.currentPage = startPage;
        this.displayPageNumber = this.actualToDisplayPage(startPage);
        console.log('Double view display page:', this.displayPageNumber);
        
        // Load current and next page
        this.mushafImageUrl = this.quranFlash.getPageImageUrl(startPage);
        console.log('First page image URL:', this.mushafImageUrl);
        
        // Preload first image to check if it exists
        await this.preloadImage(this.mushafImageUrl);
        
        if (startPage < this.LAST_PAGE) {
          this.secondPageImageUrl = this.quranFlash.getPageImageUrl(startPage + 1);
          console.log('Second page image URL:', this.secondPageImageUrl);
          
          // Preload second image
          await this.preloadImage(this.secondPageImageUrl);
        } else {
          this.secondPageImageUrl = '';
        }
      } else {
        this.currentPage = pageNumber;
        this.displayPageNumber = this.actualToDisplayPage(pageNumber);
        console.log('Single view display page:', this.displayPageNumber);
        this.mushafImageUrl = this.quranFlash.getPageImageUrl(pageNumber);
        console.log('Page image URL:', this.mushafImageUrl);
        
        // Preload image to check if it exists
        await this.preloadImage(this.mushafImageUrl);
        
        this.secondPageImageUrl = '';
      }
      
      // Save the surah info for display purposes, but don't include in URL
      this.updateCurrentSurah(pageNumber);
      
      // Update URL with page parameter instead of surah
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {
          mode: 'mushaf',
          page: this.displayPageNumber
        },
        replaceUrl: true
      });
      
      // Save state to localStorage and backend
      this.saveCurrentState();
    } catch (error) {
      console.error('Error loading mushaf page:', error);
      // Show a toast or message to the user
      this.toastService.show('Error loading Quran page');
    } finally {
      this.isLoading = false;
    }
  }
  
  // Helper method to preload an image and verify it exists
  private preloadImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        console.log(`Image loaded successfully: ${url}`);
        resolve();
      };
      
      img.onerror = () => {
        console.error(`Error loading image: ${url}`);
        reject(new Error(`Failed to load image: ${url}`));
      };
      
      img.src = url;
    });
  }
  
  private updateCurrentSurah(pageNumber: number) {
    // Convert actual page number to display page number for comparison
    const displayPage = this.quranFlash.actualToDisplayPage(pageNumber);
    
    // Find the surah that starts on or before this page
    let foundSurah: number | null = null;
    let latestStartPage = -1;

    Object.entries(this.quranFlash.surahPageMap).forEach(([surahStr, startPage]) => {
      const surahNum = parseInt(surahStr);
      const surahStartPage = this.quranFlash.actualToDisplayPage(startPage);
      
      // If this surah starts on or before our current page and it's the latest we've found
      if (surahStartPage <= displayPage && surahStartPage > latestStartPage) {
        foundSurah = surahNum;
        latestStartPage = surahStartPage;
      }
    });

    // If we found a matching surah, update the current surah (but not selected surah)
    if (foundSurah) {
      this.currentSurah = foundSurah;
      
      // Update surah details
      const surahDetails = this.surahs.find(s => s.number === foundSurah);
      if (surahDetails) {
        this.currentSurahDetails = surahDetails;
        this.surahName = surahDetails.name;
      }
    }
  }

  getVerseNumber(line: string): string {
    const match = line.match(/۝\s*(\d+)/);
    if (!match) return '';
    // Convert to Eastern Arabic numerals (١٢٣٤٥٦٧٨٩٠)
    return match[1].trim().replace(/[0-9]/g, d => 
      String.fromCharCode(0x0660 + parseInt(d))
    );
  }

  getPageNumberArabic(num: number): string {
    // Convert to Eastern Arabic numerals (١٢٣٤٥٦٧٨٩٠)
    return num.toString().replace(/[0-9]/g, d => 
      String.fromCharCode(0x0660 + parseInt(d))
    );
  }

  toggleMushafMode() {
    this.isMushafView = !this.isMushafView;
    
    if (this.isMushafView) {
        this.quranFlash.getPageBySurah(this.selectedSurah || 1).subscribe(page => {
            if (page) {
                this.currentPage = page;
                this.loadMushafPage(page);
            }
        });
    } else {
        this.quranService.getSurah(this.selectedSurah || 1, this.selectedTranslation)
            .subscribe(verses => {
                this.verses = verses;
                const surahDetails = this.surahs.find(s => s.number === this.selectedSurah);
                if (surahDetails) {
                    this.currentSurahDetails = surahDetails;
                    this.surahName = surahDetails.name;
                }
            });
    }
  }

  zoomMushaf(delta: number) {
    const newZoom = this.mushafZoom + delta;
    if (newZoom >= 0.5 && newZoom <= 2) {
      this.mushafZoom = newZoom;
    }
  }

  togglePageView() {
    this.isDoublePageView = !this.isDoublePageView;
    // When switching to double view, ensure we're on an odd page
    // and handle special case for first page
    if (this.isDoublePageView) {
      if (this.currentPage <= this.FIRST_PAGE) {
        this.currentPage = this.FIRST_PAGE;
        this.displayPageNumber = 1;
      } else if (this.currentPage % 2 === 0) {
        this.currentPage--;
        this.displayPageNumber = this.quranFlash.actualToDisplayPage(this.currentPage);
      }
    }
    this.loadMushafPage(this.currentPage);
  }

  startReading() {
    this.isMushafView = false;  // Ensure translation view
    this.router.navigate(['/quran']).then(() => {
      if (this.currentSurah) {
        this.loadSurah(this.currentSurah);
      } else {
        this.loadSurah(1);
      }
    });
  }

  playCurrentSurah() {
    if (this.isPlayingFullSurah) {
      this.stopFullSurah();
    } else {
      this.playFullSurah();
    }
  }

  // Add method for mobile translation click
  toggleVerseTranslation(event: Event, verseNumber: number) {
    if (window.innerWidth <= 768) {
      event.preventDefault();
      const translationElement = (event.target as HTMLElement).closest('.verse')?.querySelector('.translation');
      if (translationElement) {
        translationElement.classList.toggle('show');
      }
    }
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent) {
    if (this.searchContainer?.nativeElement && 
        !this.searchContainer.nativeElement.contains(event.target)) {
      this.showSuggestions = false;
    }
  }

  clearSearch() {
    this.searchResults = [];
    this.showSuggestions = false;
    this.searchQuery = '';
  }

  selectSearchResult(result: any) {
    this.selectedSurah = result.surah;
    this.currentSurah = result.surah;
    
    this.quranService.getSurah(result.surah, this.selectedTranslation)
      .subscribe({
        next: (verses) => {
          this.verses = verses;
          setTimeout(() => {
            const verseElement = document.getElementById(`verse-${result.verse}`);
            if (verseElement) {
              verseElement.scrollIntoView({ behavior: 'smooth' });
              
              const verseText = verseElement.querySelector('.verse-text');
              if (verseText && this.searchQuery) {
                const html = verseText.innerHTML;
                const highlightedHtml = html.replace(
                  new RegExp(this.searchQuery, 'gi'),
                  '<mark class="bg-yellow-200">$1</mark>'
                );
                verseText.innerHTML = highlightedHtml;
              }
            }
          }, 100);
        }
      });

    this.clearSearch();
  }

  renderVerseText(verse: QuranVerse): SafeHtml {
    if (!verse.words) return verse.text;
    
    const html = verse.words.map(word => 
      `<span class="word-tooltip-trigger" data-tooltip="${word.translation}">${word.text}</span>`
    ).join(' ');
    
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  @HostListener('window:resize')
  onResize() {
    this.isMobile = window.innerWidth < 768;
  }

  showTranslation(word: any) {
    this.activeWord = word;
  }

  hideTranslation() {
    if (!this.isMobile) {
      this.activeWord = null;
    }
  }

  handleTouch(event: TouchEvent, word: any) {
    event.preventDefault();
    if (this.activeWord === word) {
      this.activeWord = null;
    } else {
      this.activeWord = word;
    }
  }

  selectTranslation(translationId: string) {
    if (this.selectedTranslation === translationId) {
      return; // No change
    }
    
    console.log(`Changing translation from ${this.selectedTranslation} to ${translationId}`);
    this.selectedTranslation = translationId;
    this.isLoading = true;
    
    if (this.currentSurah) {
      this.loadSurah(this.currentSurah).subscribe({
        next: () => {
          this.isLoading = false;
          // Save to preferences
          this.saveUserPreferencesDebounced();
          // Update URL params
          this.updateUrlParams();
        },
        error: (error) => {
          console.error('Error reloading with new translation:', error);
          this.isLoading = false;
        }
      });
    } else {
      // No surah loaded yet, just update prefs
      this.saveUserPreferencesDebounced();
      this.isLoading = false;
      // Update URL params
      this.updateUrlParams();
    }
  }

  selectReciter(reciter: Reciter) {
    if (this.selectedReciter?.id === reciter.id) {
      return; // No change
    }
    
    console.log(`Changing reciter from ${this.selectedReciter?.name} to ${reciter.name}`);
    this.selectedReciter = reciter;
    
    // Save to preferences
    this.saveUserPreferencesDebounced();
    
    // Update URL params
    this.updateUrlParams();
    
    // No need to reload content as reciter only affects audio
  }

  selectTafsir(tafsirId: string) {
    this.selectedTafsir = tafsirId;
    if (this.selectedVerse) {
      this.showTafsir(this.selectedVerse);
    }
    this.updateUrlParams();
  }

  // Helper method to convert actual page number to display page number
  private actualToDisplayPage(actualPage: number): number {
    // In the Quran reader, the actual file numbers start at 10 (for display page 1)
    return actualPage - 9;
  }

  private displayToActualPage(displayPage: number): number {
    return this.quranFlash.displayToActualPage(displayPage);
  }

  private updateSelectedSurah(pageNumber: number) {
    // Find the surah that starts on or before this page
    let foundSurah: number | null = null;
    let latestStartPage = -1;

    Object.entries(this.quranFlash.surahPageMap).forEach(([surahStr, startPage]) => {
      const surahNum = parseInt(surahStr);
      if (startPage <= pageNumber && startPage > latestStartPage) {
        foundSurah = surahNum;
        latestStartPage = startPage;
      }
    });

    if (foundSurah && foundSurah !== this.selectedSurah) {
      this.selectedSurah = foundSurah;
      this.currentSurah = foundSurah;
      
      // Update surah details
      const surahDetails = this.surahs.find(s => s.number === foundSurah);
      if (surahDetails) {
        this.currentSurahDetails = surahDetails;
        this.surahName = surahDetails.name;
      }
    }
  }

  // Update save state method
  private updateUrlParams() {
    // Get current state
    const params: any = {};
    
    // Always include mode parameter
    params.mode = this.isMushafView ? 'mushaf' : 'translation';
    
    if (this.isMushafView) {
      // In mushaf mode, use page number instead of surah
      if (this.currentPage) {
        // Convert to display page number
        params.page = this.actualToDisplayPage(this.currentPage);
      }
    } else {
      // In translation mode, use surah and verse
      if (this.currentSurah) {
        params.surah = this.currentSurah;
      }
    }
    
    // Add reciter and translation parameters
    if (this.selectedReciter) {
      params.reciter = this.selectedReciter.id;
    }
    
    if (this.selectedTranslation) {
      params.translation = this.selectedTranslation;
    }
    
    // Update URL without reloading the page
    this.router.navigate([], {
      relativeTo: this.router.routerState.root,
      queryParams: params,
      replaceUrl: true
    });
  }

  // Update save state method - full state saving to backend
  private async saveState() {
    try {
      const user = await firstValueFrom(this.authService.user$);
      if (!user) return;

      // Save reading history first if we have a current verse
      if (this.currentSurah && this.currentRecitingVerse) {
        await this.authService.saveQuranReaderState({
          surah: this.currentSurah,
          verse: this.currentRecitingVerse,
          position: window.scrollY,
          lastRead: new Date()
        });
      }

      // Get current state
      const currentState = {
        isMushafView: this.isMushafView,
        lastSurah: this.currentSurah,
        lastVerse: this.currentRecitingVerse,
        lastPage: this.isMushafView ? this.actualToDisplayPage(this.currentPage) : undefined,
        isDoublePageView: this.isDoublePageView,
        showWordByWord: this.showWordByWord,
        showingTranslation: this.showingTranslation,
        arabicFont: this.arabicFont,
        arabicFontSize: this.arabicFontSize,
        mushafZoom: this.mushafZoom
      };

      // Create updated preferences object with all current values
      const updatedPrefs = {
        selectedReciter: this.selectedReciter?.id,
        selectedTranslation: this.selectedTranslation,
        selectedTafsir: this.selectedTafsir,
        fontSize: this.fontSize,
        bookmarks: this.bookmarks || [],
        lastState: currentState,
        isDarkMode: this.isDarkMode
      };

      // Save to backend
      await this.authService.saveUserPreferences(updatedPrefs);
    } catch (error) {
      console.error('Error saving state:', error);
    }
  }

  // Helper method to get surah number from page number
  private getSurahFromPage(page: number): number | null {
    // Convert actual page number to display page number
    const displayPage = this.quranFlash.actualToDisplayPage(page);
    
    // Find the surah that starts on or before this page
    const surahs = Object.entries(this.quranFlash.surahPageMap);
    for (let i = surahs.length - 1; i >= 0; i--) {
      const [surahNum, startPage] = surahs[i];
      if (startPage <= page) {
        return Number(surahNum);
      }
    }
    
    return null;
  }

  private async initializeReciter(reciterParam: string | null, prefs: any): Promise<Reciter> {
    if (reciterParam) {
      const reciterId = parseInt(reciterParam);
      const reciter = this.quranService.reciters.find(r => r.id === reciterId);
      if (reciter) return reciter;
    }
    
    if (prefs?.selectedReciter) {
      const reciter = this.quranService.reciters.find(r => r.id === prefs.selectedReciter);
      if (reciter) return reciter;
    }
    
    return this.quranService.reciters[0];
  }

  private getPageImageUrl(pageNumber: number): string {
    // Use the quranFlash service to get the image URL
    return this.quranFlash.getPageImageUrl(pageNumber);
  }

  /**
   * Initialize with default values when preferences can't be loaded
   */
  private async initializeWithDefaults() {
    console.log('Initializing with default values');
    try {
      // Ensure we have surahs
      if (this.surahs.length === 0) {
        this.surahs = await firstValueFrom(this.quranService.getSurahList());
      }
      
      // Set default values
      this.selectedReciter = this.quranService.reciters[0];
      this.selectedTranslation = '131';
      this.currentSurah = 1;
      this.selectedSurah = 1;
      
      // Load first surah
      await firstValueFrom(this.loadSurah(1));
      
      console.log('Default initialization completed');
    } catch (finalError) {
      console.error('Fatal error initializing reader:', finalError);
      // At this point, we need to show an error to the user
      this.isLoading = false;
    }
  }

  /**
   * Load translations data
   */
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

  /**
   * Load reciters data
   */
  private async loadRecitersData(): Promise<Reciter[]> {
    if (this.reciters.length === 0 && this.quranService.reciters?.length > 0) {
      this.reciters = this.quranService.reciters;
      if (this.reciters.length > 0 && !this.selectedReciter) {
        this.selectedReciter = this.reciters[0];
      }
    }
    return this.reciters;
  }

  /**
   * Load user preferences from service and apply them
   */
  private async loadUserPreferences() {
    try {
      // Check if auth service is available and user is logged in
      const isLoggedIn = await this.authService.isAuthenticated();
      
      if (isLoggedIn) {
        // Try to load user preferences
        const prefs = await this.authService.getUserSettings();
        if (prefs?.quranReader) {
          this.preferences = {
            ...this.preferences,
            ...prefs.quranReader
          };
          
          // Apply loaded preferences
          if (prefs.quranReader.selectedTranslation) {
            this.selectedTranslation = prefs.quranReader.selectedTranslation;
          }
          if (prefs.quranReader.selectedTafsir) {
            this.selectedTafsir = prefs.quranReader.selectedTafsir;
          }
          if (prefs.quranReader.fontSize) {
            this.fontSize = prefs.quranReader.fontSize;
          }
          if (prefs.quranReader.bookmarks) {
            this.bookmarks = prefs.quranReader.bookmarks;
          }
          if (prefs.quranReader.lastState?.lastSurah) {
            const surahNum = prefs.quranReader.lastState.lastSurah;
            this.currentSurah = typeof surahNum === 'number' ? surahNum : 1;
            this.selectedSurah = this.currentSurah;
          }
        }
      } else {
        // Not logged in, try to load from localStorage
        const storedPrefs = localStorage.getItem('quranReaderPreferences');
        if (storedPrefs) {
          try {
            const savedPrefs = JSON.parse(storedPrefs);
            this.preferences = {
              ...this.preferences,
              ...savedPrefs
            };
            
            // Apply loaded preferences
            if (savedPrefs.selectedTranslation) {
              this.selectedTranslation = savedPrefs.selectedTranslation;
            }
            if (savedPrefs.selectedTafsir) {
              this.selectedTafsir = savedPrefs.selectedTafsir;
            }
            if (savedPrefs.fontSize) {
              this.fontSize = savedPrefs.fontSize;
            }
            if (savedPrefs.bookmarks) {
              this.bookmarks = savedPrefs.bookmarks;
            }
            if (savedPrefs.lastState?.lastSurah) {
              const surahNum = savedPrefs.lastState.lastSurah;
              this.currentSurah = typeof surahNum === 'number' ? surahNum : 1;
              this.selectedSurah = this.currentSurah;
            }
          } catch (error) {
            console.warn('Error parsing stored preferences:', error);
          }
        }
      }
      return this.preferences;
    } catch (error) {
      console.warn('Error loading user preferences:', error);
      return this.preferences; // Return default preferences
    }
  }

  /**
   * Initialize with user preferences
   */
  private async initializeWithUserPreferences() {
    // Load the fonts (which are needed regardless of preferences)
    await this.loadFonts();
    
    // Load the actual content using the user's preferences
    await this.loadQuranText();
    
    // Setup the appropriate view mode
    this.setupViewMode();
    
    // Setup audio events
    this.setupAudioEvents();
    
    // Remove loading state
    this.isLoading = false;
    
    console.log('Reader initialization completed with user preferences');
  }

  /**
   * Load Arabic fonts
   */
  private async loadFonts(): Promise<boolean> {
    try {
      // Use more reliable fonts that are already approved in the CSP
      // First, try Google fonts that are already included in your app
      const googleFonts = [
        'Scheherazade New',
        'Noto Naskh Arabic',
        'Amiri'
      ];
      
      // For each Google font, create a DOM element to force load it
      googleFonts.forEach(fontName => {
        const element = document.createElement('span');
        element.style.fontFamily = fontName;
        element.style.visibility = 'hidden';
        element.textContent = 'ﷺ'; // Arabic character to ensure the font loads properly
        document.body.appendChild(element);
        
        // Remove after a short delay
        setTimeout(() => {
          document.body.removeChild(element);
        }, 1000);
      });
      
      // Fall back to system fonts if specific fonts aren't available
      return true;
    } catch (error) {
      console.warn('Font loading failed, falling back to system fonts:', error);
      return false;
    }
  }


  // Remove the second setupAudioEvents function that appears later in the file
  private formatTime(time: number): string {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Setup the view mode based on preferences or URL
   */
  private setupViewMode(): void {
    // Get mode from URL if present
    const queryParams = new URLSearchParams(window.location.search);
    const modeParam = queryParams.get('mode');
    
    // Set view mode based on URL parameter or preference
    if (modeParam === 'mushaf') {
      this.isMushafView = true;
    } else if (modeParam === 'translation') {
      this.isMushafView = false;
    } else {
      // If no URL parameter, use preference or default to translation view
      this.isMushafView = this.preferences?.viewMode === 'mushaf';
    }
    
    console.log('View mode set to:', this.isMushafView ? 'Mushaf' : 'Translation');
    
    // If in mushaf view, load the appropriate page
    if (this.isMushafView) {
      // Get surah number
      const surahParam = queryParams.get('surah');
      const surahNumber = surahParam ? parseInt(surahParam, 10) : (this.preferences?.lastState?.lastSurah || 1);
      
      this.currentSurah = surahNumber;
      this.selectedSurah = surahNumber;
      
      // Get the page for this surah
      if (this.quranFlash.surahPageMap && this.quranFlash.surahPageMap[surahNumber]) {
        const page = this.quranFlash.surahPageMap[surahNumber];
        this.currentPage = page;
        this.displayPageNumber = this.actualToDisplayPage(page);
        this.loadMushafPage(page);
      }
    }
  }

  /**
   * Load the Quran text based on URL parameters or user preferences
   */
  private async loadQuranText(): Promise<boolean> {
    try {
      console.log('Loading Quran text...');
      
      // Make sure we have a surah list
      if (this.surahs.length === 0) {
        await this.loadSurahs();
      }
      
      // Ensure selectedReciter is initialized
      if (!this.selectedReciter && this.quranService.reciters && this.quranService.reciters.length > 0) {
        console.log('Initializing selectedReciter in loadQuranText');
        this.selectedReciter = this.quranService.reciters[0];
      }
      
      // Check URL parameters first (highest priority)
      const queryParams = new URLSearchParams(window.location.search);
      const surahParam = queryParams.get('surah');
      const pageParam = queryParams.get('page');
      const modeParam = queryParams.get('mode');
      const reciterParam = queryParams.get('reciter');
      const translationParam = queryParams.get('translation');
      
      // Handle reciter from URL
      if (reciterParam) {
        const reciterId = parseInt(reciterParam, 10);
        const reciter = this.reciters.find(r => r.id === reciterId);
        if (reciter) {
          console.log(`Setting reciter from URL: ${reciter.name} (ID: ${reciter.id})`);
          this.selectedReciter = reciter;
        }
      }
      
      // Handle translation from URL
      if (translationParam) {
        console.log(`Setting translation from URL: ${translationParam}`);
        this.selectedTranslation = translationParam;
      }
      
      // Determine if we should be in mushaf view
      if (modeParam === 'mushaf') {
        this.isMushafView = true;
      }
      
      // Determine which content to load
      let contentToLoad = false;
      
      if (this.isMushafView && pageParam) {
        // Load specific page in mushaf view
        const pageNumber = parseInt(pageParam, 10);
        await this.loadMushafPage(this.displayToActualPage(pageNumber));
        contentToLoad = true;
      } else if (surahParam) {
        // Load specific surah
        const surahToLoad = parseInt(surahParam, 10);
        this.currentSurah = surahToLoad;
        this.selectedSurah = surahToLoad;
        
        await firstValueFrom(this.loadSurah(surahToLoad));
        contentToLoad = true;
      }
      
      // If no content specified by URL, use user preferences
      if (!contentToLoad) {
        // Check user preferences (saved state)
        if (this.preferences?.lastState) {
          const lastState = this.preferences.lastState;
          
          if (lastState.isMushafView) {
            // Use mushaf view with saved page
            this.isMushafView = true;
            if (lastState.lastPage) {
              await this.loadMushafPage(this.displayToActualPage(lastState.lastPage));
            } else {
              // Default to first page if no page specified
              await this.loadMushafPage(this.FIRST_PAGE);
            }
          } else {
            // Use translation view with saved surah
            this.isMushafView = false;
            const surahToLoad = lastState.lastSurah || 1;
            this.currentSurah = surahToLoad;
            this.selectedSurah = surahToLoad;
            
            await firstValueFrom(this.loadSurah(surahToLoad));
          }
        } else {
          // No saved state, load surah 1 as default
          this.currentSurah = 1;
          this.selectedSurah = 1;
          await firstValueFrom(this.loadSurah(1));
        }
      }
      
      // Update URL parameters to reflect the current state
      this.updateUrlParams();
      
      return true;
    } catch (error) {
      console.error('Error loading Quran text:', error);
      return false;
    }
  }

  // Debounce the save preferences call to avoid too many API calls
  private savePreferencesTimeout: any;
  private lastSaveTime: number = 0;
  
  private saveUserPreferencesDebounced() {
    // Check if we've saved too recently (within 3 seconds)
    const now = Date.now();
    if (now - this.lastSaveTime < 3000) {
      // Clear any existing timeout
      clearTimeout(this.savePreferencesTimeout);
      
      // Set a longer timeout for frequent save requests
      this.savePreferencesTimeout = setTimeout(() => {
        this.lastSaveTime = Date.now();
        this.doSaveUserPreferences();
      }, 5000); // Use a longer 5 second debounce when changes are frequent
      
      return;
    }
    
    // Normal debounce for less frequent changes
    clearTimeout(this.savePreferencesTimeout);
    this.savePreferencesTimeout = setTimeout(() => {
      this.lastSaveTime = Date.now();
      this.doSaveUserPreferences();
    }, 3000); // 3 second debounce for normal operation
  }
  
  // The actual save operation
  private doSaveUserPreferences() {
    // Create preferences object
    const preferences = {
      reciterId: this.selectedReciter?.id || 7,
      translationId: this.selectedTranslation || '131',
      fontSize: this.fontSize || 24, 
      showWordByWord: this.showWordByWord || false,
      darkMode: this.isDarkMode || false,
      arabicFont: this.arabicFont || 'uthmani',
      lastState: {
        isMushafView: this.isMushafView,
        lastSurah: this.currentSurah || 1,
        lastPage: this.isMushafView ? this.displayPageNumber : undefined,
      }
    };

    // Save to localStorage
    localStorage.setItem('quranReaderPreferences', JSON.stringify(preferences));

    // Try to save to server only if authenticated
    this.authService.isAuthenticated().then(isAuthenticated => {
      if (isAuthenticated) {
        this.authService.saveUserPreferences(preferences).catch(error => {
          // Only show warning for non-rate-limit errors
          if (error.status !== 429) {
            console.warn('Error saving preferences to server:', error);
          }
          // Already saved to localStorage as backup
        });
      }
    }).catch(error => {
      console.warn('Error checking authentication status:', error);
    });
  }

  /**
   * Save the current state to localStorage for faster loading
   */
  private saveCurrentState() {
    try {
      const state: any = {
        lastSurah: this.currentSurah,
        lastVerse: this.currentRecitingVerse || (this.verses && this.verses.length > 0 ? this.verses[0].number : 1),
        isMushafView: this.isMushafView
      };
      
      // Add page number if in mushaf view
      if (this.isMushafView && this.currentPage) {
        state.lastPage = this.actualToDisplayPage(this.currentPage);
      }
      
      localStorage.setItem('quran_reader_state', JSON.stringify(state));
      
      // Update preferences object
      this.preferences = {
        ...this.preferences,
        lastState: state,
        selectedReciter: this.selectedReciter?.id,
        selectedTranslation: this.selectedTranslation,
        fontSize: this.fontSize,
        bookmarks: this.bookmarks,
        selectedTafsir: this.selectedTafsir,
        isDarkMode: this.isDarkMode,
        arabicFont: this.arabicFont,
        showWordByWord: this.showWordByWord
      };
      
      // If user is logged in, also save to backend
      this.saveUserPreferencesDebounced();
      
      // Update URL parameters to match current state
      this.updateUrlParams();
    } catch (error) {
      console.warn('Error saving reader state:', error);
    }
  }

  /**
   * Navigate to a specific verse without adding it to URL parameters
   * This is used when coming from bookmarks or history
   */
  navigateToVerse(surahNumber: number, verseNumber: number) {
    if (!surahNumber || !verseNumber) return;

    // Debounce the navigation to prevent multiple rapid calls
    if (this.navigationTimeout) {
      clearTimeout(this.navigationTimeout);
    }

    this.navigationTimeout = setTimeout(() => {
      // If we're in mushaf view, switch to translation view
      if (this.isMushafView) {
        this.isMushafView = false;
      }

      // Update current surah
      this.currentSurah = surahNumber;
      
      // If the surah isn't already loaded, load it first
      if (this.selectedSurah !== surahNumber) {
        this.isLoading = true;
        this.selectSurah(surahNumber).then(() => {
          // After surah loads, scroll to verse
          requestAnimationFrame(() => {
            this.scrollToVerse(verseNumber);
            this.isLoading = false;
            // Save to reading history but don't update URL
            this.saveState();
          });
        });
      } else {
        // Surah already loaded, just scroll to verse
        requestAnimationFrame(() => {
          this.scrollToVerse(verseNumber);
          this.saveState();
        });
      }
    }, 300); // Add a small delay to prevent rapid consecutive calls
  }
} 