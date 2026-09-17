import { Component, OnInit, OnDestroy, HostListener, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Observable, Subject, takeUntil, forkJoin, merge, fromEvent } from 'rxjs';

// Material imports
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSliderModule } from '@angular/material/slider';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

// Services
import { TafsirService } from '../../../services/tafsir.service';
import { QuranService, Surah } from '../../../services/quran.service';
import { ThemeService } from '../../../services/theme.service';
import { BookmarkService } from '../../../services/bookmark.service';
import { NoteService } from '../../../services/note.service';
import { HighlightService } from '../../../services/highlight.service';
import { FirebaseAuthService } from '../../../services/firebase-auth.service';

// Models
import { TafsirEdition, TafsirContent, UserPreferences, VerseGroupInfo } from '../../../models/tafsir.model';
import { QuranVerse } from '../../../services/quran.service';
import { Bookmark, Note, Highlight, BookmarkHelpers } from '../../../models/bookmark.model';

// Components
import { RichTextEditorComponent } from '../../shared/rich-text-editor/rich-text-editor.component';
import { TafsirChatBubbleComponent } from '../tafsir-chat-bubble/tafsir-chat-bubble.component';
import { PremiumPromptComponent } from '../../premium-prompt/premium-prompt.component';
import { TafsirShareCardComponent, ShareCardData } from '../tafsir-share-card/tafsir-share-card.component';

@Component({
  selector: 'app-tafsir-reader',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSliderModule,
    MatSelectModule,
    MatFormFieldModule,
    MatTooltipModule,
    MatMenuModule,
    MatSlideToggleModule,
    MatDividerModule,
    MatDialogModule,
    RichTextEditorComponent,
    TafsirChatBubbleComponent
  ],
  templateUrl: './tafsir-reader.component.html',
  styleUrls: ['./tafsir-reader.component.scss']
})
export class TafsirReaderComponent implements OnInit, OnDestroy {
  // Route parameters
  editionId: string = '';
  currentSurah: number = 1;
  currentVerse: number = 1;

  // Data
  edition: TafsirEdition | null = null;
  tafsirContent: TafsirContent | null = null;
  verseData: QuranVerse | null = null;
  surahs$: Observable<Surah[]>;

  // Loading states
  isLoading = false;
  isLoadingVerse = false;

  // UI State
  showArabicVerse = true;
  splitViewMode = false;
  showSidebar = false;
  focusMode = false;
  openChatOnLoad = false;

  // Premium status
  isPremium: boolean = false;

  /** Phone-sized layout: compact chrome, notes as a keyboard-safe sheet. */
  isCompactViewport = typeof window !== 'undefined' && window.innerWidth < 768;
  vvHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  vvOffset = 0;

  // Typography preferences
  preferences: UserPreferences = {
    userId: '',
    fontFamily: 'serif',
    fontSize: 18,
    lineHeight: 1.8,
    textAlign: 'left',
    maxWidth: 700,
    margin: 40,
    theme: 'light',
    viewMode: 'single',
    showArabicVerse: true,
    enableKeyboardShortcuts: true,
    autoBookmarkLastRead: true,
    syncWithQuranReader: false,
    offlineMode: false
  };

  // Verse Group Navigation (Feature 1)
  verseGroupStart: number = 0;
  verseGroupEnd: number = 0;
  verseGroup: number[] = [];
  groupVerseData: QuranVerse[] = [];
  currentPassageNumber: number = 0;
  totalPassages: number = 0;

  // Swipe Gestures & Page Transitions (Feature 2)
  isTransitioning = false;
  transitionDirection: 'left' | 'right' | 'enter-left' | 'enter-right' | null = null;
  private touchStartX = 0;
  private touchStartY = 0;
  private touchDeltaX = 0;
  private touchDeltaY = 0;
  private isSwiping = false;
  swipeIndicatorOpacity = 0;
  swipeIndicatorDirection: 'left' | 'right' | null = null;

  // Reading progress
  readingStartTime: number = 0;
  readingTime: number = 0;

  // Bookmarks & Notes
  isBookmarkedCurrent = false;
  currentBookmarks: Bookmark[] = [];
  currentNotes: Note[] = [];
  previousVerseNotes: Note[] = [];
  nextVerseNotes: Note[] = [];
  showNotesPanel = false;
  editingNoteId: string | null = null;
  currentNoteContent = '';

  @ViewChild('richEditor') richEditor!: RichTextEditorComponent;

  // Verse selection
  totalVersesInCurrentSurah = 0;
  previousSurahVerseCount = 0; // last verse number of previous surah (when at verse 1)
  verseNumbers: number[] = [];

  // Text Highlighting
  currentHighlights: Highlight[] = [];
  selectedHighlightColor: Highlight['color'] = 'yellow';
  showHighlightMenu = false;
  highlightMenuPosition = { x: 0, y: 0 };
  selectedText = '';
  selectedRange: { startOffset: number; endOffset: number } | null = null;
  clickedHighlightId: string | null = null; // Track clicked highlight for removal
  hoveredHighlightId: string | null = null; // Track hovered highlight
  showHighlightTooltip = false;
  highlightTooltipPosition = { x: 0, y: 0 };
  showColorPicker = false;
  private savedSelection: Range | null = null; // Preserve browser selection
  private isSelecting = false; // Track if user is actively selecting
  
  highlightColors: Array<{ value: Highlight['color']; label: string; hex: string; icon: string }> = [
    { value: 'yellow', label: 'Yellow', hex: '#fef3c7', icon: '🟡' },
    { value: 'green', label: 'Green', hex: '#d1fae5', icon: '🟢' },
    { value: 'blue', label: 'Blue', hex: '#dbeafe', icon: '🔵' },
    { value: 'pink', label: 'Pink', hex: '#fce7f3', icon: '🩷' },
    { value: 'orange', label: 'Orange', hex: '#fed7aa', icon: '🟠' }
  ];

  // Cleanup
  private destroy$ = new Subject<void>();
  private saveInterval: any; // Store interval reference for cleanup
  private lastSavedPosition = ''; // Track last saved position to avoid duplicates

  // Font options
  fontFamilies = [
    { value: 'serif', label: 'Serif (Georgia)' },
    { value: 'sans-serif', label: 'Sans-serif (Modern)' },
    { value: 'amiri', label: 'Amiri (Arabic)' },
    { value: 'traditional-arabic', label: 'Traditional Arabic' }
  ];

  themes = [
    { value: 'light', label: 'Light', icon: '☀️' },
    { value: 'dark', label: 'Dark', icon: '🌙' },
    { value: 'sepia', label: 'Sepia', icon: '📖' },
    { value: 'night', label: 'Night', icon: '🌃' }
  ];

  constructor(
    private route: ActivatedRoute,
    public router: Router, // Public for template access
    private tafsirService: TafsirService,
    private quranService: QuranService,
    private themeService: ThemeService,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer,
    public bookmarkService: BookmarkService, // Public for template access
    public noteService: NoteService, // Public for template access
    public highlightService: HighlightService, // Public for template access
    private dialog: MatDialog,
    private authService: FirebaseAuthService
  ) {
    // Initialize surahs observable
    this.surahs$ = this.quranService.surahs$;
  }

  ngOnInit(): void {
    // Initialize loading states
    this.isLoading = false;
    this.isLoadingVerse = true;
    
    // Load user preferences from localStorage
    this.loadPreferences();

    // Check premium status (non-blocking)
    this.authService.isPremiumUser().then(premium => {
      this.isPremium = premium;
      this.cdr.detectChanges();
    });

    // Ensure surahs are loaded
    this.quranService.getSurahList().pipe(takeUntil(this.destroy$)).subscribe();

    // Check for openChat query param (from conversations page)
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(qp => {
      this.openChatOnLoad = qp['openChat'] === 'true';
    });

    // Get route parameters
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.editionId = params['editionId'];
      this.currentSurah = +params['surah'] || 1;
      this.currentVerse = +params['verse'] || 1;

      // Load last position if no verse specified
      if (!params['verse']) {
        this.loadLastPosition();
      }

      this.loadEdition();
      this.loadTafsir();
      this.loadBookmarksAndNotes();
      this.loadVerseCount();
    });

    this.bindVisualViewport();

    // Start reading timer
    this.readingStartTime = Date.now();

    // Apply theme
    this.applyTheme();

    // Auto-save progress every 30 seconds (with cleanup)
    this.saveInterval = setInterval(() => {
      if (this.editionId && this.currentSurah && this.currentVerse) {
        this.saveReadingProgress();
      }
    }, 30000);
  }

  ngOnDestroy(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }

    this.destroy$.next();
    this.destroy$.complete();
    this.saveReadingProgress();
    document.body.style.overflow = '';
  }

  /**
   * Keep the notes sheet inside the visible viewport when the mobile keyboard opens.
   * iOS/Android shrink visualViewport instead of the layout viewport.
   */
  private bindVisualViewport(): void {
    this.syncVisualViewport();
    const streams = [fromEvent(window, 'resize')];
    const vv = window.visualViewport;
    if (vv) {
      streams.push(fromEvent(vv, 'resize'), fromEvent(vv, 'scroll'));
    }
    merge(...streams).pipe(takeUntil(this.destroy$)).subscribe(() => this.syncVisualViewport());
  }

  private syncVisualViewport(): void {
    const vv = window.visualViewport;
    this.vvHeight = Math.round(vv?.height ?? window.innerHeight);
    this.vvOffset = Math.round(vv?.offsetTop ?? 0);
    this.isCompactViewport = window.innerWidth < 768;
    if (this.isCompactViewport && this.showNotesPanel) {
      this.syncNotesPanelViewport();
    }
    this.cdr.markForCheck();
  }

  private syncNotesPanelViewport(): void {
    const vv = window.visualViewport;
    if (!vv) return;
    const panel = document.querySelector('.notes-panel.open') as HTMLElement;
    if (!panel) return;
    panel.style.height = `${vv.height}px`;
    panel.style.top = `${vv.offsetTop}px`;
  }

  private clearNotesPanelViewport(): void {
    const panel = document.querySelector('.notes-panel.open') as HTMLElement;
    if (!panel) return;
    panel.style.height = '';
    panel.style.top = '';
  }

  /**
   * Load edition details
   */
  loadEdition(): void {
    this.tafsirService.getEdition(this.editionId).subscribe({
      next: (edition) => {
        this.edition = edition;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading edition:', error);
        this.isLoading = false;
        this.isLoadingVerse = false;
        this.cdr.detectChanges();
        // Redirect to library if edition not found
        this.router.navigate(['/tafsir/browse']);
      }
    });
  }

  /**
   * Load tafsir content for current verse
   */
  loadTafsir(): void {
    this.isLoadingVerse = true;
    this.isLoading = false; // Ensure main loading is off
    
    // Clear previous data immediately to show loading state
    this.verseData = null;
    this.tafsirContent = null;
    this.cdr.detectChanges();

    let verseLoaded = false;
    let tafsirLoaded = false;

    const checkComplete = () => {
      if (verseLoaded && tafsirLoaded) {
        this.isLoadingVerse = false;
        this.isLoading = false;
        this.cdr.detectChanges();
        // Save position after successful load
        this.saveReadingProgress();
      }
    };

    // Load verse data and tafsir together
    const verse$ = this.quranService.getVerse(this.currentSurah, this.currentVerse);
    const tafsir$ = this.tafsirService.getTafsirForVerse(this.editionId, this.currentSurah, this.currentVerse);

    // Load verse data first (it's usually faster)
    verse$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (verse) => {
        this.verseData = verse;
        verseLoaded = true;
        this.cdr.detectChanges(); // Force update immediately
        checkComplete();
      },
      error: (error) => {
        console.error('Error loading verse:', error);
        verseLoaded = true;
        checkComplete();
      }
    });

    // Load tafsir
    tafsir$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (content) => {
        this.tafsirContent = content;
        tafsirLoaded = true;
        this.cdr.detectChanges(); // Force update immediately

        // Detect verse group for this tafsir passage
        this.detectVerseGroup();

        // Prefetch next verses
        this.prefetchNextVerses();

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Load bookmarks and notes for this verse
        this.loadBookmarksAndNotes();
        
        checkComplete();
      },
      error: (error) => {
        console.error('Error loading tafsir:', error);
        tafsirLoaded = true;
        checkComplete();
      }
    });
  }

  /**
   * Load Quran verse data (Arabic text and translation)
   */
  loadVerseData(): void {
    // Load immediately if needed
    if (this.showArabicVerse || this.splitViewMode) {
      this.quranService
        .getVerse(this.currentSurah, this.currentVerse)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (verse) => {
            this.verseData = verse;
            this.cdr.detectChanges(); // Force immediate update
          },
          error: (error) => {
            console.error('Error loading verse:', error);
          }
        });
    }
  }

  /**
   * Handle surah change from selector
   */
  onSurahChange(): void {
    this.currentVerse = 1;
    this.loadVerseCount();
    this.updateRoute();
    this.loadTafsir();
  }

  /**
   * Handle verse change from selector
   */
  onVerseChange(): void {
    this.updateRoute();
    this.loadTafsir();
  }

  /**
   * Load total verse count for current surah (and previous surah when at verse 1, for notes panel)
   */
  loadVerseCount(): void {
    this.quranService.getVerseCount(this.currentSurah).subscribe(data => {
      this.totalVersesInCurrentSurah = data.numberOfAyahs;
      this.verseNumbers = Array.from({ length: this.totalVersesInCurrentSurah }, (_, i) => i + 1);
      this.cdr.detectChanges();
    });
    if (this.currentVerse === 1 && this.currentSurah > 1) {
      this.quranService.getVerseCount(this.currentSurah - 1).subscribe(data => {
        this.previousSurahVerseCount = data.numberOfAyahs;
        this.cdr.detectChanges();
      });
    } else {
      this.previousSurahVerseCount = 0;
    }
  }

  /**
   * Get verse numbers for current surah
   */
  getVerseNumbers(): number[] {
    return this.verseNumbers;
  }

  /**
   * Detect the verse group sharing the same tafsir passage as the current verse
   */
  detectVerseGroup(): void {
    this.tafsirService.getVerseGroupForTafsir(this.editionId, this.currentSurah, this.currentVerse)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (group: VerseGroupInfo) => {
          this.verseGroupStart = group.startVerse;
          this.verseGroupEnd = group.endVerse;
          this.verseGroup = group.verses;
          this.totalPassages = this.tafsirService.getPassageCountForSurah(this.editionId, this.currentSurah);

          // Load Arabic verses for all verses in the group when showing Arabic
          if (this.showArabicVerse && group.verses.length > 1) {
            this.loadGroupVerseData(group.verses);
          }

          this.cdr.detectChanges();
        },
        error: () => {
          this.verseGroupStart = this.currentVerse;
          this.verseGroupEnd = this.currentVerse;
          this.verseGroup = [this.currentVerse];
        }
      });
  }

  /**
   * Load Arabic verse data for all verses in a group
   */
  loadGroupVerseData(verses: number[]): void {
    const verseFetches = verses.map(v => this.quranService.getVerse(this.currentSurah, v));
    forkJoin(verseFetches).pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.groupVerseData = data;
        this.cdr.detectChanges();
      },
      error: () => {
        this.groupVerseData = [];
      }
    });
  }

  /**
   * Check if current tafsir covers a multi-verse group
   */
  isMultiVerseGroup(): boolean {
    return this.verseGroup.length > 1;
  }

  /**
   * Get verse group label for display
   */
  getVerseGroupLabel(): string {
    if (this.verseGroup.length <= 1) {
      return `Verse ${this.currentVerse}`;
    }
    return `Verses ${this.verseGroupStart}–${this.verseGroupEnd}`;
  }

  /**
   * Navigate to next verse. If at the end of a group, skip to next group.
   * Otherwise, step through individual verses within the group.
   */
  nextVerse(): void {
    if (this.isTransitioning) return;

    this.quranService.getVerseCount(this.currentSurah).subscribe(data => {
      if (this.currentVerse < data.numberOfAyahs) {
        // If at the end of a group, skip to start of next group
        if (this.verseGroupEnd > 0 && this.currentVerse >= this.verseGroupEnd) {
          this.currentVerse = this.verseGroupEnd + 1;
        } else {
          this.currentVerse++;
        }
      } else {
        // Move to next surah
        if (this.currentSurah < 114) {
          this.currentSurah++;
          this.currentVerse = 1;
        }
      }
      this.updateRoute();
      this.loadTafsir();
    });
  }

  /**
   * Navigate to previous verse. Skips back to start of previous group.
   */
  previousVerse(): void {
    if (this.isTransitioning) return;

    if (this.currentVerse > 1) {
      // If at the start of a group, go to start of previous group
      if (this.verseGroupStart > 0 && this.currentVerse <= this.verseGroupStart && this.verseGroupStart > 1) {
        // Need to find the previous group's start verse
        const targetVerse = this.verseGroupStart - 1;
        this.currentVerse = targetVerse;
        this.updateRoute();
        this.loadTafsir();
        return;
      }
      this.currentVerse--;
    } else {
      // Move to previous surah
      if (this.currentSurah > 1) {
        this.currentSurah--;
        this.quranService.getVerseCount(this.currentSurah).subscribe(data => {
          this.currentVerse = data.numberOfAyahs;
          this.updateRoute();
          this.loadTafsir();
        });
        return;
      }
    }
    this.updateRoute();
    this.loadTafsir();
  }

  /**
   * Skip to next distinct tafsir passage (always jumps past the current group)
   */
  nextPassage(): void {
    if (this.isTransitioning) return;

    this.quranService.getVerseCount(this.currentSurah).subscribe(data => {
      const nextStart = this.verseGroupEnd > 0 ? this.verseGroupEnd + 1 : this.currentVerse + 1;
      if (nextStart <= data.numberOfAyahs) {
        this.currentVerse = nextStart;
      } else if (this.currentSurah < 114) {
        this.currentSurah++;
        this.currentVerse = 1;
      }
      this.updateRoute();
      this.loadTafsir();
    });
  }

  /**
   * Skip to previous distinct tafsir passage (jumps to start of previous group)
   */
  previousPassage(): void {
    if (this.isTransitioning) return;

    if (this.verseGroupStart > 1) {
      this.currentVerse = this.verseGroupStart - 1;
      this.updateRoute();
      this.loadTafsir();
    } else if (this.currentSurah > 1) {
      this.currentSurah--;
      this.quranService.getVerseCount(this.currentSurah).subscribe(data => {
        this.currentVerse = data.numberOfAyahs;
        this.updateRoute();
        this.loadTafsir();
      });
    }
  }

  /**
   * Update route with current verse
   */
  updateRoute(): void {
    this.router.navigate(
      [`/tafsir/read/${this.editionId}/${this.currentSurah}/${this.currentVerse}`],
      { replaceUrl: true }
    );
  }

  /**
   * Prefetch next verses for smooth navigation
   */
  prefetchNextVerses(): void {
    this.tafsirService.prefetchNextVerses(
      this.editionId,
      this.currentSurah,
      this.currentVerse,
      3
    );
  }

  /**
   * Check if user has premium access; if not, show the upgrade dialog.
   * Returns true when the user IS premium, false otherwise.
   */
  requirePremium(featureName: string): boolean {
    if (this.isPremium) {
      return true;
    }
    this.dialog.open(PremiumPromptComponent, {
      data: {
        feature: featureName,
        benefits: [
          'Notes & Annotations on every verse',
          'Text highlighting with multiple colors',
          'Split View reading mode',
          'Focus Mode for distraction-free study',
          'AI-powered Tafsir Chat'
        ]
      },
      panelClass: 'premium-dialog',
      maxWidth: '500px'
    });
    return false;
  }

  /**
   * Toggle split view mode
   */
  toggleSplitView(): void {
    if (!this.requirePremium('Split View Reading')) return;
    this.splitViewMode = !this.splitViewMode;
    this.preferences.viewMode = this.splitViewMode ? 'split' : 'single';
    this.savePreferences();
    
    if (this.splitViewMode && !this.verseData) {
      this.loadVerseData();
    }
    
    this.cdr.detectChanges(); // Force UI update
  }

  /**
   * Toggle Arabic verse display
   */
  toggleArabicVerse(): void {
    this.showArabicVerse = !this.showArabicVerse;
    this.preferences.showArabicVerse = this.showArabicVerse;
    this.savePreferences();
    
    if (this.showArabicVerse && !this.verseData) {
      this.loadVerseData();
    }
  }

  /**
   * Toggle focus mode (hide all controls)
   */
  toggleFocusMode(): void {
    if (!this.requirePremium('Focus Mode')) return;
    this.focusMode = !this.focusMode;
  }

  /**
   * Toggle sidebar
   */
  toggleSidebar(): void {
    this.showSidebar = !this.showSidebar;
  }

  /**
   * Open in Quran Reader
   */
  openInQuranReader(): void {
    const url = `/quran?surah=${this.currentSurah}&verse=${this.currentVerse}`;
    window.open(url, '_blank');
  }

  /**
   * Go back to library
   */
  goToLibrary(): void {
    // Save current position before leaving
    this.saveReadingProgress();
    this.router.navigate(['/tafsir/browse']);
  }

  /**
   * Change font family
   */
  changeFontFamily(family: string): void {
    this.preferences.fontFamily = family as any;
    this.savePreferences();
    this.applyTypography();
  }

  /**
   * Change font size
   */
  changeFontSize(size: number): void {
    this.preferences.fontSize = size;
    this.savePreferences();
    this.applyTypography();
  }

  /**
   * Change line height
   */
  changeLineHeight(height: number): void {
    this.preferences.lineHeight = height;
    this.savePreferences();
    this.applyTypography();
  }

  /**
   * Change theme
   */
  changeTheme(theme: string): void {
    this.preferences.theme = theme as any;
    this.savePreferences();
    this.applyTheme();
  }

  /**
   * Change page width
   */
  changeMaxWidth(width: number): void {
    this.preferences.maxWidth = width;
    this.savePreferences();
    this.applyTypography();
  }

  /**
   * Apply typography preferences
   */
  applyTypography(): void {
    const root = document.documentElement;
    root.style.setProperty('--user-font-family', this.getFontFamily());
    root.style.setProperty('--user-font-size', `${this.preferences.fontSize}px`);
    root.style.setProperty('--user-line-height', `${this.preferences.lineHeight}`);
    root.style.setProperty('--user-max-width', `${this.preferences.maxWidth}px`);
    root.style.setProperty('--user-margin', `${this.preferences.margin}px`);
  }

  /**
   * Apply theme
   */
  applyTheme(): void {
    document.body.className = `theme-${this.preferences.theme}`;
  }

  /**
   * Get font family CSS value
   */
  getFontFamily(): string {
    const fontMap: { [key: string]: string } = {
      'serif': 'Georgia, "Times New Roman", serif',
      'sans-serif': '"Segoe UI", Roboto, "Helvetica Neue", sans-serif',
      'amiri': '"Amiri", serif',
      'traditional-arabic': '"Traditional Arabic", "Arabic Typesetting", serif'
    };
    return fontMap[this.preferences.fontFamily] || fontMap['serif'];
  }

  /**
   * Get surah name
   */
  getSurahName(): string {
    // Wait for surahs to load, return fallback in the meantime
    const surahs = this.quranService.surahs;
    if (!surahs || surahs.length === 0) {
      return `Surah ${this.currentSurah}`;
    }
    return this.quranService.getSurahName(this.currentSurah);
  }

  /**
   * Get progress percentage based on current verse position in the surah
   */
  getProgressPercentage(): number {
    if (this.totalVersesInCurrentSurah <= 0) return 0;
    return Math.round((this.currentVerse / this.totalVersesInCurrentSurah) * 100);
  }

  /**
   * Save preferences to localStorage
   */
  savePreferences(): void {
    localStorage.setItem('tafsir_preferences', JSON.stringify(this.preferences));
  }

  /**
   * Load preferences from localStorage
   */
  loadPreferences(): void {
    const saved = localStorage.getItem('tafsir_preferences');
    if (saved) {
      try {
        this.preferences = { ...this.preferences, ...JSON.parse(saved) };
        this.applyTypography();
      } catch (error) {
        console.error('Error loading preferences:', error);
      }
    }
  }

  /**
   * Save reading progress to localStorage
   */
  saveReadingProgress(): void {
    this.readingTime = Math.floor((Date.now() - this.readingStartTime) / 1000);
    
    // Create position key to track duplicates
    const positionKey = `${this.editionId}:${this.currentSurah}:${this.currentVerse}`;
    
    // Only save if position has changed
    if (positionKey === this.lastSavedPosition) {
      return;
    }
    
    // Save to localStorage
    const progress = {
      editionId: this.editionId,
      surah: this.currentSurah,
      verse: this.currentVerse,
      lastReadAt: new Date().toISOString(),
      totalReadTime: this.readingTime
    };
    
    localStorage.setItem(`tafsir_progress_${this.editionId}`, JSON.stringify(progress));
    this.lastSavedPosition = positionKey;
    // Removed console.log to reduce spam
  }

  /**
   * Load last reading position
   */
  loadLastPosition(): void {
    try {
      const saved = localStorage.getItem(`tafsir_progress_${this.editionId}`);
      if (saved) {
        const progress = JSON.parse(saved);
        // If no specific verse in URL, use last position
        if (!this.route.snapshot.params['verse']) {
          this.currentSurah = progress.surah;
          this.currentVerse = progress.verse;
          console.log('Resumed from last position:', progress);
        }
      }
    } catch (error) {
      console.error('Error loading last position:', error);
    }
  }

  /**
   * Keyboard shortcuts
   */
  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (!this.preferences.enableKeyboardShortcuts) return;

    // Don't trigger if user is typing in an input, textarea, or contenteditable
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.getAttribute('contenteditable') === 'true') {
      return;
    }

    switch (event.key) {
      case 'ArrowRight':
        this.nextVerse();
        event.preventDefault();
        break;
      case 'ArrowLeft':
        this.previousVerse();
        event.preventDefault();
        break;
      case 'v':
        this.toggleArabicVerse();
        event.preventDefault();
        break;
      case 's':
        if (!this.requirePremium('Split View Reading')) { event.preventDefault(); break; }
        this.toggleSplitView();
        event.preventDefault();
        break;
      case 'f':
        if (!this.requirePremium('Focus Mode')) { event.preventDefault(); break; }
        this.toggleFocusMode();
        event.preventDefault();
        break;
      case 'q':
        this.openInQuranReader();
        event.preventDefault();
        break;
      case 'd':
        // Cycle through themes
        const themes: ('light' | 'dark' | 'sepia' | 'night')[] = ['light', 'dark', 'sepia', 'night'];
        const currentIndex = themes.indexOf(this.preferences.theme);
        const nextIndex = (currentIndex + 1) % themes.length;
        this.changeTheme(themes[nextIndex]);
        event.preventDefault();
        break;
      case 'b':
        // Toggle bookmark for current verse
        this.toggleBookmarkCurrent();
        event.preventDefault();
        break;
      case 'n':
        // Open notes panel
        if (!this.requirePremium('Notes & Annotations')) { event.preventDefault(); break; }
        this.toggleNotesPanel();
        event.preventDefault();
        break;
    }
  }

  // ==================== BOOKMARKS & NOTES ====================

  /**
   * Load bookmarks, notes, and highlights for current verse (and adjacent verses for notes panel)
   */
  loadBookmarksAndNotes(): void {
    // Load bookmarks for current verse
    this.bookmarkService
      .getBookmarksForVerse(this.editionId, this.currentSurah, this.currentVerse)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (bookmarks) => {
          this.currentBookmarks = bookmarks;
          this.isBookmarkedCurrent = bookmarks.length > 0;
          this.cdr.detectChanges();
        },
        error: (error) => console.error('Error loading bookmarks:', error)
      });

    // Load notes for current verse
    this.noteService
      .getNotesForVerse(this.editionId, this.currentSurah, this.currentVerse)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (notes) => {
          this.currentNotes = notes;
          // When notes panel is open and we navigated, ensure draft is for current verse
          if (this.showNotesPanel) {
            this.noteService.createDraft(this.editionId, this.currentSurah, this.currentVerse);
          }
          this.cdr.detectChanges();
        },
        error: (error) => console.error('Error loading notes:', error)
      });

    // Load notes for previous verse (for list in notes panel)
    if (this.currentSurah === 1 && this.currentVerse === 1) {
      this.previousVerseNotes = [];
    } else if (this.currentVerse > 1) {
      this.noteService
        .getNotesForVerse(this.editionId, this.currentSurah, this.currentVerse - 1)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (notes) => {
            this.previousVerseNotes = notes;
            this.cdr.detectChanges();
          },
          error: () => { this.previousVerseNotes = []; }
        });
    } else {
      // At verse 1 of surah > 1: previous verse is last verse of previous surah
      this.quranService.getVerseCount(this.currentSurah - 1).pipe(takeUntil(this.destroy$)).subscribe({
        next: (data) => {
          this.noteService
            .getNotesForVerse(this.editionId, this.currentSurah - 1, data.numberOfAyahs)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (notes) => {
                this.previousVerseNotes = notes;
                this.cdr.detectChanges();
              },
              error: () => { this.previousVerseNotes = []; }
            });
        },
        error: () => { this.previousVerseNotes = []; }
      });
    }

    // Load notes for next verse (for list in notes panel)
    const nextRef = this.getNextVerseRef();
    if (nextRef) {
      this.noteService
        .getNotesForVerse(this.editionId, nextRef.surah, nextRef.verse)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (notes) => {
            this.nextVerseNotes = notes;
            this.cdr.detectChanges();
          },
          error: () => { this.nextVerseNotes = []; }
        });
    } else {
      this.nextVerseNotes = [];
    }

    // Load highlights for current verse
    this.loadHighlights();
  }

  /** Reference to previous verse (surah, verse) or null if at 1:1 or ref not yet known */
  getPreviousVerseRef(): { surah: number; verse: number } | null {
    if (this.currentSurah === 1 && this.currentVerse === 1) return null;
    if (this.currentVerse > 1) {
      return { surah: this.currentSurah, verse: this.currentVerse - 1 };
    }
    if (this.currentSurah > 1 && this.previousSurahVerseCount > 0) {
      return { surah: this.currentSurah - 1, verse: this.previousSurahVerseCount };
    }
    return null;
  }

  /** Reference to next verse (surah, verse) or null if at 114:6 */
  getNextVerseRef(): { surah: number; verse: number } | null {
    if (this.currentSurah === 114 && this.currentVerse === 6) return null;
    if (this.currentVerse < this.totalVersesInCurrentSurah) {
      return { surah: this.currentSurah, verse: this.currentVerse + 1 };
    }
    return { surah: this.currentSurah + 1, verse: 1 };
  }

  /** Navigate to a specific verse (e.g. from notes panel); keeps notes panel open */
  goToVerse(surah: number, verse: number): void {
    this.currentSurah = surah;
    this.currentVerse = verse;
    this.updateRoute();
    // Route params subscription will call loadTafsir() and loadBookmarksAndNotes()
    this.loadVerseCount();
    this.loadTafsir();
  }

  /**
   * Toggle bookmark for current verse
   */
  toggleBookmarkCurrent(): void {
    if (!this.verseData || !this.tafsirContent) return;

    const verseText = this.verseData.text || '';
    const tafsirExcerpt = this.tafsirContent.text?.substring(0, 100) || '';

    this.bookmarkService
      .toggleBookmark(
        this.editionId,
        this.currentSurah,
        this.currentVerse,
        verseText,
        tafsirExcerpt
      )
      .subscribe({
        next: (action) => {
          this.isBookmarkedCurrent = action === 'added';
          const message = action === 'added' ? '✅ Bookmark added!' : '❌ Bookmark removed';
          console.log(message);
          this.loadBookmarksAndNotes();
        },
        error: (error) => {
          console.error('Error toggling bookmark:', error);
        }
      });
  }

  /**
   * Check if current verse is bookmarked
   */
  isCurrentVerseBookmarked(): boolean {
    return this.isBookmarkedCurrent;
  }

  /**
   * Get bookmark count for current verse
   */
  getBookmarkCount(): number {
    return this.currentBookmarks.length;
  }

  /**
   * Get note count for current verse
   */
  getNoteCount(): number {
    return this.currentNotes.length;
  }

  /**
   * Toggle notes panel
   */
  toggleNotesPanel(): void {
    if (!this.requirePremium('Notes & Annotations')) return;
    this.showNotesPanel = !this.showNotesPanel;

    if (this.showNotesPanel) {
      const existingDraft = this.noteService.getCurrentDraft();
      if (!existingDraft) {
        this.noteService.createDraft(this.editionId, this.currentSurah, this.currentVerse);
      }
      if (this.isCompactViewport) {
        document.body.style.overflow = 'hidden';
        this.syncNotesPanelViewport();
      }
    } else {
      if (this.isCompactViewport) {
        document.body.style.overflow = '';
        this.clearNotesPanelViewport();
      }
    }
  }

  /**
   * View bookmarks page
   */
  viewBookmarks(): void {
    this.router.navigate(['/tafsir/bookmarks']);
  }

  /**
   * View notes page
   */
  viewNotes(): void {
    this.router.navigate(['/tafsir/notes']);
  }

  /**
   * Navigate to specific bookmarked verse
   */
  goToBookmark(bookmark: Bookmark): void {
    this.currentSurah = bookmark.surah;
    this.currentVerse = bookmark.verse;
    this.updateRoute();
    this.loadTafsir();
    this.loadBookmarksAndNotes();
  }

  // ==================== NOTE EDITOR ====================

  /**
   * Handle note content change
   */
  onNoteContentChange(content: string): void {
    this.currentNoteContent = content;
  }

  /**
   * Save current note
   */
  saveCurrentNote(): void {
    if (!this.currentNoteContent || !this.currentNoteContent.trim()) {
      alert('Please write something in your note before saving!');
      return;
    }

    const noteData: Partial<Note> = {
      editionId: this.editionId,
      surah: this.currentSurah,
      verse: this.currentVerse,
      content: this.currentNoteContent,
      plainText: BookmarkHelpers.stripHtml(this.currentNoteContent),
      tags: [],
      isPrivate: true
    };

    // If editing existing note
    if (this.editingNoteId) {
      noteData.id = this.editingNoteId;
    }

    this.noteService.saveNote(noteData).subscribe({
      next: (savedNote) => {
        console.log('✅ Note saved!');
        this.loadBookmarksAndNotes();
        this.clearNoteEditor();
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error saving note:', error);
        alert('Error saving note. Please try again.');
      }
    });
  }

  /**
   * Edit an existing note
   */
  editNote(note: Note): void {
    this.editingNoteId = note.id;
    this.currentNoteContent = note.content;
    
    // Set content in editor
    if (this.richEditor) {
      this.richEditor.setContent(note.content);
    }
    
    this.cdr.detectChanges();
  }

  /**
   * Cancel note editing
   */
  cancelNoteEdit(): void {
    this.editingNoteId = null;
    this.clearNoteEditor();
  }

  /**
   * Clear note editor
   */
  clearNoteEditor(): void {
    this.editingNoteId = null;
    this.currentNoteContent = '';
    
    if (this.richEditor) {
      this.richEditor.clear();
    }
    
    this.cdr.detectChanges();
  }

  /**
   * Delete a note
   */
  deleteNote(noteId: string): void {
    if (confirm('Delete this note?')) {
      this.noteService.deleteNote(noteId).subscribe({
        next: () => {
          console.log('✅ Note deleted');
          this.loadBookmarksAndNotes();
          
          // If we were editing this note, clear the editor
          if (this.editingNoteId === noteId) {
            this.clearNoteEditor();
          }
        },
        error: (error) => {
          console.error('Error deleting note:', error);
        }
      });
    }
  }

  // ==================== TEXT HIGHLIGHTING ====================

  /**
   * Load highlights for current verse
   */
  loadHighlights(): void {
    this.currentHighlights = this.highlightService.getHighlightsForVerse(
      this.currentSurah,
      this.currentVerse,
      this.editionId
    );
    this.cdr.detectChanges();
  }

  /**
   * Handle mousedown to track selection start
   */
  onMouseDown(event: MouseEvent): void {
    this.isSelecting = true;
    this.hideHighlightMenu();
  }
  
  /**
   * Handle text selection in the tafsir content
   */
  handleTextSelection(event: MouseEvent): void {
    if (!this.isPremium) return;
    this.isSelecting = false;
    
    // Don't process if clicking on menu buttons
    if ((event.target as HTMLElement).closest('.highlight-context-menu')) {
      return;
    }
    
    // Check if clicking on an existing highlight - show edit menu
    const target = event.target as HTMLElement;
    
    if (target.classList.contains('highlight') || target.closest('.highlight')) {
      const highlightElement = target.classList.contains('highlight') ? target : target.closest('.highlight') as HTMLElement;
      const highlightId = highlightElement?.getAttribute('data-highlight-id');
      
      if (highlightId) {
        // Show menu in "remove/edit mode"
        this.clickedHighlightId = highlightId;
        this.hoveredHighlightId = highlightId;
        this.selectedText = '';
        this.selectedRange = null;
        this.showHighlightMenuAt(event.clientX, event.clientY);
        
        // Also show the color picker menu
        this.showHighlightTooltip = true;
        this.highlightTooltipPosition = { x: event.clientX, y: event.clientY };
        this.cdr.detectChanges();
      }
      return;
    }

    // IMMEDIATELY save selection synchronously (no delay)
    const selection = window.getSelection();
    
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      return;
    }

    const selectedText = selection.toString().trim();
    
    if (!selectedText || selectedText.length < 3) {
      return;
    }
    
    // Save the range immediately - this must happen synchronously
    const range = selection.getRangeAt(0);
    this.savedSelection = range.cloneRange();
    
    // Process selection immediately (no delay)
    this.processTextSelection(event);
  }
  
  /**
   * Process text selection after delay
   */
  private processTextSelection(event: MouseEvent): void {
    // Use saved selection
    if (!this.savedSelection) {
      return;
    }
    
    const container = (event.target as HTMLElement).closest('.tafsir-text');
    if (!container) {
      this.hideHighlightMenu();
      return;
    }

    const selectedText = this.savedSelection.toString().trim();
    if (!selectedText || selectedText.length < 3) {
      return;
    }

    // Get plain text content (without HTML tags)
    const plainText = container.textContent || '';
    
    // Calculate offsets in the plain text
    const preRange = this.savedSelection.cloneRange();
    preRange.selectNodeContents(container);
    preRange.setEnd(this.savedSelection.startContainer, this.savedSelection.startOffset);
    const preText = preRange.toString();
    
    // Find the position of selected text in plain text
    const startOffset = preText.length;
    const endOffset = startOffset + selectedText.length;
    
    // Verify the selection matches
    const textAtOffset = plainText.substring(startOffset, endOffset);
    if (textAtOffset !== selectedText) {
      console.warn('Selected text does not match calculated offsets:', {
        selected: selectedText,
        calculated: textAtOffset
      });
      this.hideHighlightMenu();
      return;
    }

    // Store selection data
    this.selectedText = selectedText;
    this.selectedRange = { startOffset, endOffset };
    this.clickedHighlightId = null; // Clear clicked highlight when selecting new text
    
    // DON'T call showHighlightMenuAt yet - it will trigger change detection
    // Instead, set the values directly without triggering CD
    this.highlightMenuPosition = { x: event.clientX, y: event.clientY };
    this.showHighlightMenu = true;
    
    // Let Angular naturally detect the change on next cycle
    // Meanwhile, keep re-applying the selection
    this.keepSelectionAlive();
  }
  
  /**
   * Recreate selection from text offsets (works even after DOM changes)
   */
  private keepSelectionAlive(): void {
    if (!this.selectedText || !this.selectedRange) {
      return;
    }
    
    const recreateSelection = () => {
      try {
        // Find the tafsir-text container
        const container = document.querySelector('.tafsir-text');
        if (!container) {
          return;
        }
        
        // Create a new range using a tree walker to find text nodes
        const range = document.createRange();
        const walker = document.createTreeWalker(
          container,
          NodeFilter.SHOW_TEXT,
          null
        );
        
        let currentOffset = 0;
        let startNode: Node | null = null;
        let startNodeOffset = 0;
        let endNode: Node | null = null;
        let endNodeOffset = 0;
        
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const textNode = node as Text;
          const nodeLength = textNode.length;
          
          // Find start node
          if (!startNode && currentOffset + nodeLength >= this.selectedRange!.startOffset) {
            startNode = textNode;
            startNodeOffset = this.selectedRange!.startOffset - currentOffset;
          }
          
          // Find end node
          if (!endNode && currentOffset + nodeLength >= this.selectedRange!.endOffset) {
            endNode = textNode;
            endNodeOffset = this.selectedRange!.endOffset - currentOffset;
            break;
          }
          
          currentOffset += nodeLength;
        }
        
        if (startNode && endNode) {
          range.setStart(startNode, startNodeOffset);
          range.setEnd(endNode, endNodeOffset);
          
          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      } catch (e) {
        // Silently fail - selection restoration is best-effort
      }
    };
    
    // Multiple attempts to recreate selection
    requestAnimationFrame(() => {
      recreateSelection();
      setTimeout(recreateSelection, 10);
      setTimeout(recreateSelection, 50);
      setTimeout(recreateSelection, 100);
    });
  }

  /**
   * Show highlight menu at specific position
   */
  showHighlightMenuAt(x: number, y: number): void {
    this.highlightMenuPosition = { x, y };
    this.showHighlightMenu = true;
    // DON'T call detectChanges here - it invalidates the saved selection
    // Angular will detect the change automatically
  }

  /**
   * Hide highlight menu
   */
  hideHighlightMenu(): void {
    this.showHighlightMenu = false;
    this.selectedText = '';
    this.selectedRange = null;
    this.clickedHighlightId = null;
    this.showHighlightTooltip = false;
    this.hoveredHighlightId = null;
    this.showColorPicker = false;
    this.savedSelection = null;
    
    // Clear browser selection
    window.getSelection()?.removeAllRanges();
  }
  
  /**
   * Check if we're in remove highlight mode (clicked on existing highlight)
   */
  isRemoveMode(): boolean {
    return this.clickedHighlightId !== null;
  }
  
  /**
   * Remove the clicked highlight
   */
  removeClickedHighlight(): void {
    if (this.clickedHighlightId) {
      this.removeHighlight(this.clickedHighlightId);
      this.hideHighlightMenu();
    }
  }

  /**
   * Apply highlight with selected color
   */
  applyHighlight(color?: Highlight['color']): void {
    if (!this.selectedText || !this.selectedRange) return;

    const highlightColor = color || this.selectedHighlightColor;

    const highlightData: Omit<Highlight, 'id' | 'createdAt' | 'syncStatus'> = {
      userId: '', // Will be set by service
      editionId: this.editionId,
      surah: this.currentSurah,
      verse: this.currentVerse,
      text: this.selectedText,
      startOffset: this.selectedRange.startOffset,
      endOffset: this.selectedRange.endOffset,
      color: highlightColor,
      updatedAt: new Date().toISOString()
    };

    this.highlightService.addHighlight(highlightData).subscribe({
      next: () => {
        console.log('✅ Highlight added!');
        this.loadHighlights();
        this.hideHighlightMenu();
        
        // Clear text selection
        window.getSelection()?.removeAllRanges();
      },
      error: (error) => {
        console.error('Error adding highlight:', error);
        alert('Error adding highlight. Please try again.');
      }
    });
  }

  /**
   * Remove a specific highlight
   */
  removeHighlight(highlightId: string): void {
    this.highlightService.deleteHighlight(highlightId).subscribe({
      next: () => {
        console.log('✅ Highlight removed');
        this.loadHighlights();
      },
      error: (error) => {
        console.error('Error removing highlight:', error);
      }
    });
  }

  /**
   * Get color hex value for a highlight color
   */
  getHighlightColorHex(color: Highlight['color']): string {
    const colorObj = this.highlightColors.find(c => c.value === color);
    return colorObj?.hex || '#fef3c7';
  }

  /**
   * Apply highlights to text content (for rendering)
   */
  getHighlightedText(text: string): string {
    if (!this.currentHighlights.length) return text;

    // Sort highlights by start offset (descending) to apply from end to start
    const sortedHighlights = [...this.currentHighlights].sort((a, b) => b.startOffset - a.startOffset);

    let highlightedText = text;
    
    for (const highlight of sortedHighlights) {
      const before = highlightedText.substring(0, highlight.startOffset);
      const highlighted = highlightedText.substring(highlight.startOffset, highlight.endOffset);
      const after = highlightedText.substring(highlight.endOffset);
      
      const colorHex = this.getHighlightColorHex(highlight.color);
      highlightedText = `${before}<mark data-highlight-id="${highlight.id}" style="background-color: ${colorHex}; padding: 2px 0; border-radius: 2px; cursor: pointer;" title="Click to remove">${highlighted}</mark>${after}`;
    }

    return highlightedText;
  }

  /**
   * Handle mouseenter on highlighted text (show tooltip)
   */
  handleHighlightHover(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    
    // Check if element is a highlight
    if (target.classList.contains('highlight')) {
      const highlightId = target.getAttribute('data-highlight-id');
      if (highlightId) {
        this.hoveredHighlightId = highlightId;
        this.showHighlightTooltipAt(event.clientX, event.clientY);
      }
    }
  }
  
  /**
   * Handle mouseleave on highlighted text (hide tooltip after delay)
   */
  handleHighlightLeave(event: MouseEvent): void {
    // Don't hide if moving to tooltip
    const relatedTarget = event.relatedTarget as HTMLElement;
    if (relatedTarget?.closest('.highlight-tooltip')) {
      return;
    }
    
    setTimeout(() => {
      this.hideHighlightTooltip();
    }, 200);
  }
  
  /**
   * Show highlight tooltip at position
   */
  showHighlightTooltipAt(x: number, y: number): void {
    this.highlightTooltipPosition = { x, y: y - 60 }; // Position above cursor
    this.showHighlightTooltip = true;
    this.cdr.detectChanges();
  }
  
  /**
   * Hide highlight tooltip
   */
  hideHighlightTooltip(): void {
    if (!this.showColorPicker) {
      this.showHighlightTooltip = false;
      this.hoveredHighlightId = null;
      this.showColorPicker = false;
      this.cdr.detectChanges();
    }
  }
  
  /**
   * Toggle color picker
   */
  toggleColorPicker(): void {
    this.showColorPicker = !this.showColorPicker;
    this.cdr.detectChanges();
  }
  
  /**
   * Change highlight color
   */
  changeHighlightColor(color: Highlight['color']): void {
    if (this.hoveredHighlightId) {
      const highlight = this.currentHighlights.find(h => h.id === this.hoveredHighlightId);
      if (highlight) {
        this.highlightService.updateHighlight(this.hoveredHighlightId, {
          color: color,
          updatedAt: new Date().toISOString()
        }).subscribe({
          next: () => {
            console.log('✅ Highlight color changed!');
            this.loadHighlights();
            this.hideHighlightTooltip();
          },
          error: (error) => {
            console.error('Error changing highlight color:', error);
            alert('Error changing color. Please try again.');
          }
        });
      }
    }
  }
  
  /**
   * Remove hovered highlight
   */
  removeHoveredHighlight(): void {
    if (this.hoveredHighlightId) {
      this.removeHighlight(this.hoveredHighlightId);
      this.hideHighlightTooltip();
    }
  }

  /**
   * Get highlight count for current verse
   */
  getHighlightCount(): number {
    return this.currentHighlights.length;
  }

  /**
   * Change selected highlight color
   */
  selectHighlightColor(color: Highlight['color']): void {
    this.selectedHighlightColor = color;
    this.cdr.detectChanges();
  }

  /**
   * Render highlights in text content
   */
  renderHighlights(text: string): SafeHtml {
    if (!this.currentHighlights.length || !text) {
      return this.sanitizer.bypassSecurityTrustHtml(text);
    }

    // Sort highlights by start offset (descending) to apply from end to start
    const sortedHighlights = [...this.currentHighlights].sort((a, b) => b.startOffset - a.startOffset);

    let highlightedText = text;
    
    // Apply each highlight
    for (const highlight of sortedHighlights) {
      const before = highlightedText.substring(0, highlight.startOffset);
      const highlightedPart = highlightedText.substring(highlight.startOffset, highlight.endOffset);
      const after = highlightedText.substring(highlight.endOffset);
      
      highlightedText = 
        before +
        `<span class="highlight highlight-${highlight.color}" data-highlight-id="${highlight.id}">${highlightedPart}</span>` +
        after;
    }
    
    // Bypass sanitization to preserve data-highlight-id attribute
    return this.sanitizer.bypassSecurityTrustHtml(highlightedText);
  }

  /**
   * Navigate to highlights page
   */
  viewHighlights(): void {
    this.router.navigate(['/tafsir/highlights']);
  }

  // ==================== SWIPE GESTURES & PAGE TRANSITIONS ====================

  /**
   * Handle touch start event for swipe detection
   */
  onTouchStart(event: TouchEvent): void {
    if (this.isTransitioning) return;
    const touch = event.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchDeltaX = 0;
    this.touchDeltaY = 0;
    this.isSwiping = false;
    this.swipeIndicatorOpacity = 0;
    this.swipeIndicatorDirection = null;
  }

  /**
   * Handle touch move event for swipe detection and visual indicator
   */
  onTouchMove(event: TouchEvent): void {
    if (this.isTransitioning) return;
    const touch = event.touches[0];
    this.touchDeltaX = touch.clientX - this.touchStartX;
    this.touchDeltaY = touch.clientY - this.touchStartY;

    // Only consider horizontal swipes (vertical movement under threshold)
    if (Math.abs(this.touchDeltaY) > 100) {
      this.swipeIndicatorOpacity = 0;
      this.swipeIndicatorDirection = null;
      return;
    }

    const absDeltaX = Math.abs(this.touchDeltaX);
    if (absDeltaX > 20) {
      this.isSwiping = true;
      this.swipeIndicatorDirection = this.touchDeltaX < 0 ? 'left' : 'right';
      this.swipeIndicatorOpacity = Math.min(absDeltaX / 100, 1);
      this.cdr.detectChanges();
    }
  }

  /**
   * Handle touch end event — trigger navigation if swipe threshold met
   */
  onTouchEnd(event: TouchEvent): void {
    if (this.isTransitioning) return;
    this.swipeIndicatorOpacity = 0;
    this.swipeIndicatorDirection = null;

    if (!this.isSwiping) return;
    this.isSwiping = false;

    const absDeltaX = Math.abs(this.touchDeltaX);
    const absDeltaY = Math.abs(this.touchDeltaY);

    // Minimum horizontal distance 50px, max vertical 100px
    if (absDeltaX >= 50 && absDeltaY <= 100) {
      if (this.touchDeltaX < 0) {
        // Swipe left → next
        this.animateTransition('left', () => this.nextVerse());
      } else {
        // Swipe right → previous
        this.animateTransition('right', () => this.previousVerse());
      }
    }

    this.cdr.detectChanges();
  }

  /**
   * Play slide-out / slide-in animation, then call the navigation callback
   */
  animateTransition(direction: 'left' | 'right', navigationFn: () => void): void {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    this.transitionDirection = direction;
    this.cdr.detectChanges();

    // After slide-out animation completes, navigate and slide-in
    setTimeout(() => {
      this.transitionDirection = null;
      navigationFn();

      // After navigation loads, play slide-in
      setTimeout(() => {
        this.transitionDirection = direction === 'left' ? 'enter-left' : 'enter-right';
        this.cdr.detectChanges();

      setTimeout(() => {
        this.transitionDirection = null;
          this.isTransitioning = false;
          this.cdr.detectChanges();
        }, 300);
      }, 50);
    }, 300);
  }

  // ==================== SHARE ====================

  /**
   * Open the share card dialog with current verse data
   */
  shareVerse(): void {
    if (!this.verseData || !this.tafsirContent) return;

    const data: ShareCardData = {
      surah: this.currentSurah,
      verse: this.currentVerse,
      surahName: this.getSurahName(),
      arabicText: this.verseData.text || '',
      translation: this.verseData.translation || '',
      tafsirExcerpt: this.tafsirContent.text || '',
      editionName: this.edition?.name || ''
    };

    this.dialog.open(TafsirShareCardComponent, {
      data,
      panelClass: 'share-card-dialog',
      maxWidth: '520px',
      width: '95vw',
      autoFocus: false
    });
  }
}
