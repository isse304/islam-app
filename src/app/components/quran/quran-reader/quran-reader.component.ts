import { Component, OnInit, OnDestroy, HostListener, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { QuranService, QuranVerse, Reciter, Surah, Juz, WordDetails } from '../../../services/quran.service';
import { Observable, forkJoin, firstValueFrom, Subscription, map, from } from 'rxjs';
import { ClickOutsideDirective } from '../../../directives/click-outside.directive';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SttService } from '../../../services/stt.service';
import { QuranFlashService } from '../../../services/quran-flash.service';
import { Router } from '@angular/router';
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
  bookmarks: number[] = [];
  selectedReciter: Reciter;
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
  reciters: Reciter[];
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
  mushafZoom: number = 1;
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

  constructor(
    public quranService: QuranService,
    private sttService: SttService,
    private quranFlash: QuranFlashService,
    private router: Router,
    private sanitizer: DomSanitizer,
    private authService: AuthService,
    private toastService: ToastService
  ) {
    this.selectedReciter = this.quranService.reciters[0];
    this.reciters = this.quranService.reciters;
    this.totalPages = this.DISPLAY_TOTAL; // Update to show correct total pages to user
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

  ngOnInit() {
    // Initialize surahs and other data
    this.quranService.getSurahs().subscribe(surahs => {
      this.surahs = surahs;
      
      // Initialize with selected surah
      const initialSurah = this.selectedSurah || 1;
      this.currentSurah = initialSurah;
      this.selectedSurah = initialSurah;
      
      if (this.isMushafView) {
        this.quranFlash.getPageBySurah(initialSurah).subscribe(page => {
          if (page) {
            this.currentPage = page;
            this.loadMushafPage(page);
          }
        });
      } else {
        this.quranService.getSurah(initialSurah, this.selectedTranslation)
          .subscribe(verses => {
            this.verses = verses;
            const surahDetails = this.surahs.find(s => s.number === initialSurah);
            if (surahDetails) {
              this.currentSurahDetails = surahDetails;
              this.surahName = surahDetails.name;
            }
          });
      }
    });

    this.loadPreferences();
    this.checkDarkMode();

    this.quranService.getJuzList().subscribe({
      next: (juzs) => {
        this.juzList = juzs;
      },
      error: (error) => console.error('Error loading juz list:', error)
    });
  }

  // Add Input change detection
  ngOnChanges() {
    if (this.selectedSurah) {
      this.selectSurah(this.selectedSurah);
    }
  }

  loadSurah(surahNumber: number) {
    if (!surahNumber) return;
    this.isLoading = true;
    
    return this.quranService.getSurah(surahNumber, this.selectedTranslation)
      .subscribe({
        next: (verses) => {
          this.verses = verses;
          this.currentSurah = surahNumber;
          this.selectedSurah = surahNumber;
          this.surahSelectionChange.emit(surahNumber);
          
          const surahDetails = this.surahs.find(s => s.number === surahNumber);
          if (surahDetails) {
            this.currentSurahDetails = surahDetails;
            this.surahName = surahDetails.name;
          }
        },
        error: (error) => console.error('Error loading surah:', error),
        complete: () => this.isLoading = false
      });
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

  toggleBookmark(verseNumber: number) {
    try {
      const bookmark = { surah: this.currentSurah, verse: verseNumber };
      const bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '[]');
      
      if (bookmarks.some((b: any) => b.surah === bookmark.surah && b.verse === bookmark.verse)) {
        const index = bookmarks.findIndex((b: any) => 
          b.surah === bookmark.surah && b.verse === bookmark.verse
        );
        bookmarks.splice(index, 1);
      } else {
        bookmarks.push(bookmark);
      }
      
      localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
    } catch (err) {
      console.error('Error toggling bookmark:', err);
    }
  }

  private loadBookmarks() {
    const saved = localStorage.getItem('quran-bookmarks');
    if (saved) {
      this.bookmarks = JSON.parse(saved);
    }
  }

  private saveBookmarks() {
    localStorage.setItem('quran-bookmarks', JSON.stringify(this.bookmarks));
  }

  ngOnDestroy() {
    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer.src = '';
    }
    if (this.pageSubscription) {
      this.pageSubscription.unsubscribe();
    }
  }

  playFullSurah() {
    try {
      // Stop any currently playing audio first
      this.stopAndCloseAudioPlayer();
      
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

  selectSurah(surahNumber: number) {
    console.log('Selecting surah:', surahNumber);
    if (!surahNumber) return;
    
    this.selectedSurah = surahNumber;
    this.currentSurah = surahNumber;
    
    if (this.isMushafView) {
      this.quranFlash.getPageBySurah(surahNumber).subscribe(page => {
        if (page) {
          console.log('Received page from service:', page);
          // page is the actual file number (10-627)
          this.currentPage = page;
          // Convert to display number (1-604) for the controls
          this.displayPageNumber = this.quranFlash.actualToDisplayPage(page);
          console.log('Display page number:', this.displayPageNumber);
          this.loadMushafPage(page);
          
          // Update surah details
          const surahDetails = this.surahs.find(s => s.number === surahNumber);
          if (surahDetails) {
            this.currentSurahDetails = surahDetails;
            this.surahName = surahDetails.name;
          }
        }
      });
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
          },
          error: (error) => console.error('Error loading surah:', error),
          complete: () => this.isLoading = false
        });
    }
  }

  goToVerse(surahNumber: number, verseNumber: number) {
    this.currentSurah = surahNumber;
    this.loadSurah(this.currentSurah);
    // Wait for verses to load
    setTimeout(() => {
      const verseElement = document.querySelector(`#verse-${verseNumber}`);
      if (verseElement) {
        verseElement.scrollIntoView({ behavior: 'smooth' });
      }
    }, 1000);
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

  isBookmarked(verse: QuranVerse): boolean {
    try {
      const bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '[]');
      return bookmarks.some((b: any) => 
        b.surah === this.currentSurah && b.verse === verse.number
      );
    } catch (err) {
      console.error('Error checking bookmark:', err);
      return false;
    }
  }

  // Load user preferences
  private loadPreferences() {
    this.showingTranslation = localStorage.getItem('showTranslation') !== 'false';
    this.showWordByWord = localStorage.getItem('showWordByWord') === 'true';
    this.arabicFont = (localStorage.getItem('arabicFont') as 'uthmani' | 'naskh') || 'uthmani';
    this.fontSize = parseInt(localStorage.getItem('fontSize') || '24');
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
    const verseElement = document.getElementById(`verse-${verseNumber}`);
    if (verseElement) {
      verseElement.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center'
      });
    }
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
    
    if (this.isMushafView) {
      this.quranFlash.getPageBySurah(this.currentSurah || 1).subscribe(page => {
        if (page) {
          this.currentPage = page;
          this.displayPageNumber = this.quranFlash.actualToDisplayPage(page);
          this.loadMushafPage(page);
        }
      });
    } else {
      this.quranService.getSurah(this.currentSurah || 1, this.selectedTranslation)
        .subscribe(verses => {
          this.verses = verses;
          const surahDetails = this.surahs.find(s => s.number === this.currentSurah);
          if (surahDetails) {
            this.currentSurahDetails = surahDetails;
            this.surahName = surahDetails.name;
          }
        });
    }
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

  loadMushafPage(pageNumber: number) {
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
    this.selectedTranslation = translationId;
    this.loadSurah(this.selectedSurah);
  }

  selectReciter(reciter: Reciter) {
    this.selectedReciter = reciter;
    if (this.isPlayingFullSurah) {
      this.playFullSurah(); // Restart playback with new reciter
    }
  }

  selectTafsir(tafsirId: string) {
    this.selectedTafsir = tafsirId;
    if (this.selectedVerse) {
      this.showTafsir(this.selectedVerse);
    }
  }

  // Remove the local page conversion methods since we're using the service's methods
  private displayToActualPage(displayPage: number): number {
    return this.quranFlash.displayToActualPage(displayPage);
  }

  private actualToDisplayPage(actualPage: number): number {
    return this.quranFlash.actualToDisplayPage(actualPage);
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
} 