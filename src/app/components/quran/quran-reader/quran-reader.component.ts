import { Component, OnInit, OnDestroy, HostListener, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { QuranService, QuranVerse, Reciter, Surah, Juz, WordDetails } from '../../../services/quran.service';
import { Observable, forkJoin, firstValueFrom, Subscription, map, from, of, catchError } from 'rxjs';
import { ClickOutsideDirective } from '../../../directives/click-outside.directive';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SttService } from '../../../services/stt.service';
import { QuranFlashService } from '../../../services/quran-flash.service';
import { Router, ActivatedRoute, Params } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
//import { TextToSpeechService } from '../../services/text-to-speech.service';

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

  constructor(
    public quranService: QuranService,
    private sttService: SttService,
    private quranFlash: QuranFlashService,
    private router: Router,
    private sanitizer: DomSanitizer,
    private authService: AuthService,
    private toastService: ToastService,
    private route: ActivatedRoute
  ) {
    // Don't set reciters here, wait for ngOnInit
  }

  async ngOnInit() {
    try {
      console.log('Initializing Quran reader component...');
      // Load surah list regardless of authentication
      await this.loadSurahs();
      
      // Try to get authentication state but don't block initialization
      try {
        console.log('Checking authentication state...');
        const isAuthenticated = await this.authService.isAuthenticated();
        console.log('Authentication state:', isAuthenticated);
        
        // Subscribe to auth state changes
        this.authService.isLoggedIn$.subscribe(isLoggedIn => {
          console.log('Auth state changed:', isLoggedIn);
          if (isLoggedIn) {
            this.loadUserPreferences();
          }
        });
        
        // Load user preferences if authenticated
        if (isAuthenticated) {
          await this.loadUserPreferences();
        } else {
          console.log('User not authenticated, using default preferences');
        }
      } catch (authError) {
        console.warn('Auth error, continuing with default preferences:', authError);
        // Use default preferences
      }

      // Initialize the reader with current preferences
      await this.initializeReader();
      
      // Subscribe to route changes
      this.route.queryParams.subscribe((params: Params) => {
        this.processRouteParams(params);
      });
    } catch (error) {
      console.error('Error initializing Quran reader:', error);
      // Try with default values as fallback
      this.initializeWithDefaults();
    }
  }

  private processRouteParams(params: Params) {
    const mode = params['mode'];
    const surah = params['surah'];
    if (mode) {
      this.preferences.viewMode = mode;
    }
    if (surah) {
      this.preferences.lastState.lastSurah = parseInt(surah, 10);
    }
    this.setupViewMode();
  }

  private async initializeReader() {
    try {
      // Load fonts before rendering
      await this.loadFonts();
      
      // Initialize other reader components
      await this.loadQuranText();
      this.setupViewMode();
      
      // Setup audio events
      this.setupAudioEvents();
      
      console.log('Reader initialization completed successfully');
    } catch (error) {
      console.error('Error in reader initialization:', error);
      // Try with default values as fallback
      this.initializeWithDefaults();
    }
  }

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

  private async loadFonts() {
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
        
        console.log(`Preloaded Google font: ${fontName}`);
      });
      
      // Fall back to system fonts if specific fonts aren't available
      console.log('Successfully preloaded Arabic fonts from Google Fonts');
      return true;
    } catch (error) {
      console.warn('Font loading failed, falling back to system fonts:', error);
      return false;
    }
  }

  private async loadQuranText() {
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
      
      // Get URL parameters
      const queryParams = new URLSearchParams(window.location.search);
      const surahParam = queryParams.get('surah');
      
      // Determine which surah to load
      let surahToLoad = 1; // Default to first surah
      
      if (surahParam) {
        surahToLoad = parseInt(surahParam, 10);
      } else if (this.preferences?.lastState?.lastSurah) {
        surahToLoad = this.preferences.lastState.lastSurah;
      }
      
      // Set current surah
      this.currentSurah = surahToLoad;
      this.selectedSurah = surahToLoad;
      
      // Load the selected surah
      console.log('Loading surah', surahToLoad);
      await firstValueFrom(this.loadSurah(surahToLoad));
      
      return true;
    } catch (error) {
      console.error('Error loading Quran text:', error);
      return false;
    }
  }

  private setupViewMode() {
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

  private async loadSurahs(): Promise<void> {
    try {
      console.log('Loading surah list...');
      this.surahs = await firstValueFrom(this.quranService.getSurahList());
      console.log('Loaded surah list successfully', this.surahs.length);
      return Promise.resolve();
    } catch (error) {
      console.error('Error loading surah list:', error);
      return Promise.reject(error);
    }
  }

  private setupAudioEvents() {
    this.audioPlayer.addEventListener('timeupdate', () => {
      this.currentTime = this.formatTime(this.audioPlayer.currentTime);
      this.progress = (this.audioPlayer.currentTime / this.audioPlayer.duration) * 100 || 0;
    });

    this.audioPlayer.addEventListener('loadedmetadata', () => {
      this.duration = this.formatTime(this.audioPlayer.duration);
    });

    this.audioPlayer.addEventListener('ended', () => {
      if (this.isRepeatEnabled) {
        this.audioPlayer.currentTime = 0;
        this.audioPlayer.play();
      } else {
        this.stopAndCloseAudioPlayer();
      }
    });
  }

  private formatTime(time: number): string {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  loadSurah(surahNumber: number): Observable<void> {
    if (!surahNumber) return of(void 0);
    
    this.isLoading = true;
    
    // Ensure selectedReciter is initialized
    if (!this.selectedReciter && this.quranService.reciters && this.quranService.reciters.length > 0) {
      console.log('Initializing selectedReciter in loadSurah');
      this.selectedReciter = this.quranService.reciters[0];
    }
    
    return this.quranService.getSurah(surahNumber, this.selectedTranslation).pipe(
      map(verses => {
        // Update verses with correct audio URLs for current reciter
        // Only try to access selectedReciter.id if it exists
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

  showTafsir(verse: QuranVerse) {
    this.selectedVerse = verse;
    this.quranService.getTafsir(
      this.currentSurah || 1,  // Provide default value of 1
      verse.number, 
      this.selectedTafsir
    ).subscribe({
      next: (tafsir) => {
        this.tafsir = tafsir.text;
      },
      error: (error) => console.error('Error loading tafsir:', error)
    });
  }

  async playAudio(audioUrl: string, verseNumber?: number) {
    // Stop any currently playing audio first
    this.stopAndCloseAudioPlayer();
    
    try {
      this.audioPlayer.src = audioUrl;
      await this.audioPlayer.play();
      this.isPlaying = true;
      this.audioPaused = false;
      this.currentPlayingVerse = verseNumber || null;
      
      // Setup audio events if not already set up
      this.setupAudioEvents();
    } catch (error) {
      console.error('Error playing audio:', error);
      this.isPlaying = false;
      this.currentPlayingVerse = null;
    }

    // Add event listener for when audio finishes
    this.audioPlayer.onended = () => {
      this.isPlaying = false;
      this.currentPlayingVerse = null;
    };
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

  stopAndCloseAudioPlayer() {
    this.audioPlayer.pause();
    this.audioPlayer.currentTime = 0;
    this.isPlaying = false;
    this.isPlayingFullSurah = false;
    this.audioPaused = true;
    this.currentlyPlaying = '';
    this.currentVerseIndex = 0;
    this.currentRecitingVerse = null;
    this.currentPlayingVerse = null;
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

  playFullSurah() {
    try {
      // Stop any currently playing audio first
      this.stopAndCloseAudioPlayer();
      
      // Check if selectedReciter is defined, if not, initialize it
      if (!this.selectedReciter) {
        console.log('Selected reciter not initialized, using default reciter');
        if (this.quranService.reciters && this.quranService.reciters.length > 0) {
          this.selectedReciter = this.quranService.reciters[0];
        } else {
          throw new Error('No reciters available');
        }
      }
      
      const audioUrl = this.quranService.getSurahAudioUrl(
        this.currentSurah || 1,  // Add default value
        this.selectedReciter.id
      );
      
      this.audioPlayer.src = audioUrl;
      this.audioPlayer.play().catch(error => {
        console.error('Error playing audio:', error);
      });
      
      this.isPlayingFullSurah = true;
      this.isPlaying = true;
      this.audioPaused = false;
      this.currentlyPlaying = `Surah ${this.currentSurah}`;
      
      // Setup audio events
      this.setupAudioEvents();
    } catch (error) {
      console.error('Error setting up full surah audio:', error);
      this.stopAndCloseAudioPlayer();
    }
  }

  playNextVerse() {
    if (this.currentVerseIndex < this.verses.length) {
      const currentVerse = this.verses[this.currentVerseIndex];
      this.playAudio(currentVerse.audio, currentVerse.number);
      this.currentRecitingVerse = currentVerse.number;
      
      this.audioPlayer.onended = () => {
        if (this.isPlayingFullSurah) {
          this.currentVerseIndex++;
          this.playNextVerse();
        } else {
          this.isPlaying = false;
          this.currentPlayingVerse = null;
          this.currentRecitingVerse = null;
        }
      };
    } else {
      this.isPlayingFullSurah = false;
      this.currentVerseIndex = 0;
      this.currentPlayingVerse = null;
      this.currentRecitingVerse = null;
    }
  }

  stopFullSurah() {
    this.isPlayingFullSurah = false;
    this.audioPlayer.pause();
    this.audioPaused = true;
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

    // If we're in mushaf view, switch to translation view
    if (this.isMushafView) {
      this.isMushafView = false;
    }

    // Update current surah and verse
    this.currentSurah = surahNumber;
    this.currentRecitingVerse = verseNumber;

    // Load the surah if it's not already loaded
    if (this.selectedSurah !== surahNumber) {
      this.selectSurah(surahNumber).then(() => {
        setTimeout(() => {
          this.scrollToVerse(verseNumber);
          // Save reading history after scrolling
          this.saveState();
        }, 100);
      });
    } else {
      this.scrollToVerse(verseNumber);
      // Save reading history after scrolling
      this.saveState();
    }

    // Update URL parameters
    this.updateUrlParams();
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

  playVerse(verse: QuranVerse) {
    // Audio playback implementation will be added later
    console.log('Playing verse:', verse.number);
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

  skipBackward() {
    if (this.isPlayingFullSurah) {
      // Skip to previous verse in full surah mode
      if (this.currentVerseIndex > 0) {
        this.currentVerseIndex--;
        this.playAudio(this.verses[this.currentVerseIndex].audio);
      } else {
        // Skip 10 seconds backward in full surah mode
        this.audioPlayer.currentTime = Math.max(0, this.audioPlayer.currentTime - 10);
      }
    } else {
      // Skip 10 seconds backward in verse mode
      this.audioPlayer.currentTime = Math.max(0, this.audioPlayer.currentTime - 10);
    }
  }

  skipForward() {
    if (this.isPlayingFullSurah) {
      // Skip to next verse in full surah mode
      if (this.currentVerseIndex < this.verses.length - 1) {
        this.currentVerseIndex++;
        this.playAudio(this.verses[this.currentVerseIndex].audio);
      } else {
        // Skip 10 seconds forward in full surah mode
        this.audioPlayer.currentTime = Math.min(
          this.audioPlayer.duration,
          this.audioPlayer.currentTime + 10
        );
      }
    } else {
      // Skip 10 seconds forward in verse mode
      this.audioPlayer.currentTime = Math.min(
        this.audioPlayer.duration,
        this.audioPlayer.currentTime + 10
      );
    }
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

  private scrollToVerse(verseNumber: number) {
    const attemptScroll = (attempts = 0) => {
      const verseElement = document.getElementById(`verse-${verseNumber}`);
      if (verseElement) {
        // Remove any existing highlights first
        document.querySelectorAll('.highlight-verse').forEach(el => {
          el.classList.remove('highlight-verse');
        });

        // Calculate scroll position with header offset
        const headerOffset = 80;
        const elementPosition = verseElement.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.scrollY - headerOffset;
        
        // Scroll to verse
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
        
        // Add highlight class
        verseElement.classList.add('highlight-verse');
        
        // Remove highlight after animation
        setTimeout(() => {
          verseElement.classList.remove('highlight-verse');
        }, 2000);
      } else if (attempts < 5) {
        // Retry up to 5 times with increasing delays
        setTimeout(() => attemptScroll(attempts + 1), 500 * (attempts + 1));
      }
    };

    // Initial attempt after a short delay
    setTimeout(() => attemptScroll(), 100);
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
    
    if (this.isDoublePageView) {
      // In double view, ensure we start with even pages for right-to-left reading
      const startPage = pageNumber % 2 === 0 ? pageNumber : pageNumber - 1;
      console.log('Double view start page:', startPage);
      this.currentPage = startPage;
      this.displayPageNumber = this.quranFlash.actualToDisplayPage(startPage);
      console.log('Double view display page:', this.displayPageNumber);
      
      // Load current and next page
      this.mushafImageUrl = this.quranFlash.getPageImageUrl(startPage);
      if (startPage < this.LAST_PAGE) {
        this.secondPageImageUrl = this.quranFlash.getPageImageUrl(startPage + 1);
      } else {
        this.secondPageImageUrl = '';
      }
    } else {
      this.currentPage = pageNumber;
      this.displayPageNumber = this.quranFlash.actualToDisplayPage(pageNumber);
      console.log('Single view display page:', this.displayPageNumber);
      this.mushafImageUrl = this.quranFlash.getPageImageUrl(pageNumber);
      this.secondPageImageUrl = '';
    }
    
    this.updateCurrentSurah(pageNumber);
    this.isLoading = false;
    this.updateUrlParams();
    this.saveState();
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
    if (!this.currentSurah) return;
    
    this.selectedTranslation = translationId;
    this.isLoading = true;

    // Load surah with new translation
    this.loadSurah(this.currentSurah).subscribe({
      next: () => {
        this.isLoading = false;
        this.updateUrlParams();
        this.saveState();
      },
      error: (error) => {
        console.error('Error loading translation:', error);
        this.isLoading = false;
        this.toastService.show('Error loading translation');
      }
    });
  }

  selectReciter(reciter: Reciter) {
    this.selectedReciter = reciter;
    // Stop any current playback
    this.stopAndCloseAudioPlayer();
    
    // Update audio URLs for all verses if they exist
    if (this.verses && this.verses.length > 0) {
      this.verses = this.verses.map(verse => ({
        ...verse,
        audio: this.quranService.getVerseAudioUrl(reciter.id, `${this.currentSurah || 1}:${verse.number}`)
      }));
    }
    
    if (this.isPlayingFullSurah) {
      this.playFullSurah(); // Restart playback with new reciter
    }

    // Update URL and save state
    this.updateUrlParams();
    this.saveState();
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
        lastPage: this.displayPageNumber,
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

  // Update save state method
  private updateUrlParams() {
    // Get current state
    const params: any = {};
    
    // Always include mode parameter
    params.mode = this.isMushafView ? 'mushaf' : 'translation';
    
    if (this.isMushafView) {
        // In mushaf mode, only use surah
        if (this.currentSurah) {
            params.surah = this.currentSurah;
        }
    } else {
        // In translation mode, use surah and verse
        if (this.currentSurah) {
            params.surah = this.currentSurah;
        }
        if (this.currentRecitingVerse) {
            params.ayah = this.currentRecitingVerse;
        }
    }
    
    // Update URL without reloading the page
    this.router.navigate([], {
        relativeTo: this.router.routerState.root,
        queryParams: params,
        replaceUrl: true
    });
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

  private async loadUserPreferences() {
    try {
      console.log('Loading user preferences...');
      const userPrefs = await this.authService.getUserSettings();
      if (userPrefs) {
        console.log('Loaded user preferences:', userPrefs);
        this.preferences = { ...this.preferences, ...userPrefs };
      }
    } catch (prefsError) {
      console.warn('Error loading user preferences, using defaults:', prefsError);
    }
  }
} 