import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { FirebaseAuthService, AppUser } from '../../services/firebase-auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription, forkJoin, of, take, timeout, catchError, finalize, retry, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { QuranService } from '../../services/quran.service';
import { ReadingHistory, ReadingHistoryResponse } from '../../interfaces/reading-history.interface';
import { UsageComponent } from '../../components/usage/usage.component';

interface Translation {
  id: string;
  name: string;
}

// Create UserPreferences interface if it doesn't exist
interface UserPreferences {
  selectedReciter: string | number;
  selectedTranslation: string;
  bookmarks?: string[];
  lastState?: any;
}

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatCardModule,
    MatDividerModule,
    MatListModule,
    MatSlideToggleModule,
    MatSliderModule,
    MatSelectModule,
    MatTabsModule,
    MatTooltipModule,
    UsageComponent
  ]
})
export class ProfileComponent implements OnInit, OnDestroy {
  profileForm!: FormGroup;
  passwordForm!: FormGroup;
  preferencesForm!: FormGroup;
  user: AppUser | null = null;
  isLoading = true;
  isChangingPassword = false;
  isSavingPrefs = false;
  hideCurrentPassword = true;
  hideNewPassword = true;
  hideConfirmPassword = true;
  
  // Quran preferences
  reciters: any[] = [];
  translations: Translation[] = [];
  bookmarks: string[] = [];
  readingHistory: ReadingHistory[] = [];
  
  // Cache flags to prevent redundant API calls
  private preferencesLoaded = false;
  private historyLoaded = false;
  private bookmarksLoaded = false;
  private recitersLoaded = false;
  private translationsLoaded = false;
  
  private subscriptions: Subscription[] = [];
  private lastSaveTime: number = 0;

  // Add preferences property in class
  private preferences: UserPreferences | null = null;

  constructor(
    private fb: FormBuilder,
    private authService: FirebaseAuthService,
    private quranService: QuranService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    // Initialize forms with default values first
    this.initializeForms(null, null, 24);
    
    // Load reciters and translations synchronously since they're in memory
    this.reciters = this.quranService.reciters;
    this.translations = this.quranService.translations.map(t => ({
      id: t.id.toString(),
      name: t.name
    }));
  }

  private clearMockData() {
    // Clear all mock data from localStorage and sessionStorage
    const keysToRemove = [
      'bookmarks',
      'quran_bookmarks',
      'reading_history',
      'history_cache',
      'quranPreferences',
      'quran_selected_translation',
      'quran_selected_reciter',
      'quran_font_size',
      'quran_reader_state',
      'quran_last_read',
      'quran_history',
      'quran_user_bookmarks',
      'quran_mock_data',
      'quran_cache',
      'user_preferences',
      'user_bookmarks',
      'user_history',
      'last_read_verse',
      'last_read_surah'
    ];

    // Clear all mock data
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });

    // Also clear any keys that start with these prefixes
    const prefixesToClear = ['quran_', 'user_', 'reading_', 'bookmark_', 'history_'];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && prefixesToClear.some(prefix => key.startsWith(prefix))) {
        localStorage.removeItem(key);
      }
    }
  }

  private loadCachedPreferences() {
    try {
      const cachedPrefs = localStorage.getItem('quranReaderPreferences');
      let reciterId = null;
      let translationId = null;
      let fontSize = 24;

      if (cachedPrefs) {
        const prefs = JSON.parse(cachedPrefs);
        console.log('Found cached preferences:', prefs);
        
        if (prefs.reciterId && this.quranService.reciters.some(r => r.id === prefs.reciterId)) {
          reciterId = prefs.reciterId;
        }
        if (prefs.translationId) {
          translationId = prefs.translationId;
        }
        if (prefs.fontSize) {
          fontSize = prefs.fontSize;
        }
      }

      // Initialize forms with loaded preferences
      this.initializeForms(reciterId, translationId, fontSize);
      
    } catch (error) {
      console.warn('Error loading cached preferences:', error);
      // Initialize forms with default values if there's an error
      this.initializeForms(null, null, 24);
    }
  }

  private initializeForms(reciterId: number | null, translationId: string | null, fontSize: number) {
    // Initialize profile and password forms
    this.profileForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]]
    });

    this.passwordForm = this.fb.group({
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    }, { validator: this.checkPasswords });

    // If no reciter is set, use the first available reciter
    if (!reciterId && this.reciters.length > 0) {
      reciterId = this.reciters[0].id;
    }

    // If no translation is set, use the first available translation
    if (!translationId && this.translations.length > 0) {
      translationId = this.translations[0].id;
    }

    // Create preferences form with loaded or default values
    this.preferencesForm = this.fb.group({
      selectedReciter: [reciterId, [Validators.required, Validators.min(1), Validators.max(3)]],
      selectedTranslation: [translationId, Validators.required],
      fontSize: [fontSize, [Validators.required, Validators.min(14), Validators.max(36)]]
    });

    console.log('Forms initialized with values:', {
      reciter: reciterId,
      translation: translationId,
      fontSize: fontSize
    });
  }

  ngOnInit(): void {
    // Initialize forms with default/cached values immediately
    this.initializeWithCachedData();
    
    // Then load from server in background
    const userSub = this.authService.user$.pipe(
      take(1)
    ).subscribe(user => {
      if (!user) {
        this.router.navigate(['/login']);
        return;
      }

      this.user = user;
      // Load all data in parallel in background
      this.loadServerDataInBackground();
    });

    this.subscriptions.push(userSub);
  }

  private initializeWithCachedData() {
    try {
      // Get cached preferences
      const cachedPrefs = localStorage.getItem('quran_reader_preferences');
      const prefs = cachedPrefs ? JSON.parse(cachedPrefs) : {};
      
      // Initialize forms with cached or default values
      this.initializeForms(
        prefs.selectedReciter || 1,
        prefs.selectedTranslation || '131',
        prefs.fontSize || 24
      );

      // Set cached bookmarks and history
      this.bookmarks = prefs.bookmarks || [];
      this.readingHistory = prefs.readingHistory || [];
      
      // Mark as loaded to prevent loading indicators
      this.bookmarksLoaded = true;
      this.historyLoaded = true;
      this.preferencesLoaded = true;
      this.isLoading = false;

    } catch (error) {
      console.warn('Error loading cached data:', error);
      // Initialize with defaults if cache fails
      this.initializeForms(1, '131', 24);
      this.isLoading = false;
    }
  }

  private loadServerDataInBackground() {
    // Load all data in parallel
    forkJoin({
      preferences: from(this.authService.getUserPreferences()).pipe(
        catchError(error => {
          console.warn('Error loading preferences:', error);
          return of(null);
        })
      ),
      bookmarks: this.authService.getBookmarks().pipe(
        catchError(error => {
          console.warn('Error loading bookmarks:', error);
          return of([]);
        })
      ),
      history: this.authService.getReadingHistory().pipe(
        catchError(error => {
          console.warn('Error loading history:', error);
          return of({ success: false, history: [] });
        })
      )
    }).subscribe({
      next: ({ preferences, bookmarks, history }) => {
        // Update preferences if received
        if (preferences) {
          this.initializeForms(
            preferences.selectedReciter || this.preferencesForm.get('selectedReciter')?.value,
            preferences.selectedTranslation || this.preferencesForm.get('selectedTranslation')?.value,
            preferences.fontSize || this.preferencesForm.get('fontSize')?.value
          );
          
          // Update localStorage
          localStorage.setItem('quran_reader_preferences', JSON.stringify(preferences));
        }

        // Update bookmarks if received
        if (bookmarks?.length > 0) {
          this.bookmarks = bookmarks;
        }

        // Update history if received
        if (history?.success && history.history?.length > 0) {
          this.readingHistory = history.history;
        }
      },
      error: (error) => {
        console.warn('Error loading server data:', error);
      }
    });
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  // Custom validator to check if passwords match
  checkPasswords(group: FormGroup) {
    const password = group.get('newPassword')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    
    return password === confirmPassword ? null : { notMatching: true };
  }

  async updateProfile(): Promise<void> {
    if (this.profileForm.invalid) {
      return;
    }

    this.isLoading = true;
    const { firstName, lastName } = this.profileForm.value;
    const displayName = `${firstName} ${lastName}`;

    try {
      await this.authService.updateUserProfile({ displayName });
      this.snackBar.open('Profile updated successfully!', 'Close', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom'
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      this.snackBar.open('Failed to update profile. Please try again.', 'Close', {
        duration: 5000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom'
      });
    } finally {
      this.isLoading = false;
    }
  }

  async changePassword(): Promise<void> {
    if (this.passwordForm.invalid) {
      return;
    }

    this.isChangingPassword = true;
    const { currentPassword, newPassword } = this.passwordForm.value;

    try {
      await this.authService.changePassword(currentPassword, newPassword);
      this.snackBar.open('Password changed successfully!', 'Close', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom'
      });
      this.passwordForm.reset();
    } catch (error: any) {
      console.error('Error changing password:', error);
      let errorMessage = 'Failed to change password. Please try again.';
      
      if (error.code === 'auth/wrong-password') {
        errorMessage = 'Current password is incorrect.';
      }
      
      this.snackBar.open(errorMessage, 'Close', {
        duration: 5000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom'
      });
    } finally {
      this.isChangingPassword = false;
    }
  }
  
  async savePreferences(): Promise<void> {
    if (this.preferencesForm.invalid) {
        return;
    }
    
    const now = Date.now();
    if (now - this.lastSaveTime < 5000) {
        this.snackBar.open('Please wait a moment before saving again', 'Close', { duration: 2000 });
        return;
    }
    
    this.lastSaveTime = now;
    this.isSavingPrefs = true;
    const formValues = this.preferencesForm.value;
    
    // Ensure reciterId is valid
    const reciterId = this.validateReciterId(parseInt(formValues.selectedReciter, 10));
    if (!reciterId) {
        this.snackBar.open('Invalid reciter selected', 'Close', { duration: 3000 });
        this.isSavingPrefs = false;
        return;
    }
    
    // Get current preferences from localStorage
    let currentPrefs;
    try {
        currentPrefs = JSON.parse(localStorage.getItem('quran_reader_preferences') || '{}');
    } catch (error) {
        console.warn('Error reading current preferences:', error);
        currentPrefs = {};
    }
    
    const prefsToSave = {
        ...currentPrefs,
        selectedReciter: reciterId,
        selectedTranslation: formValues.selectedTranslation,
        fontSize: formValues.fontSize,
        lastState: currentPrefs.lastState || {
            lastSurah: 1,
            lastVerse: 1,
            isMushafView: false
        }
    };
    
    // Save to localStorage immediately
    try {
        localStorage.setItem('quran_reader_preferences', JSON.stringify(prefsToSave));
        localStorage.setItem('quranReaderPreferences', JSON.stringify({
            reciterId: reciterId,
            translationId: formValues.selectedTranslation,
            fontSize: formValues.fontSize
        }));
    } catch (error) {
        console.warn('Error saving to localStorage:', error);
    }
    
    try {
        const isAuthenticated = await this.authService.isAuthenticated();
        if (!isAuthenticated) {
            this.snackBar.open('Preferences saved locally', 'Close', { duration: 2000 });
            this.isSavingPrefs = false;
            return;
        }
        
        // Save to server
        await this.authService.saveUserPreferences(prefsToSave);
        this.preferences = prefsToSave;
        this.preferencesForm.markAsPristine();
        
        this.snackBar.open('Preferences saved successfully', 'Close', { duration: 3000 });
    } catch (error: any) {
        if (error.status === 429) {
            this.snackBar.open('Too many requests. Preferences saved locally.', 'Close', { duration: 3000 });
        } else {
            console.error('Error saving preferences to server:', error);
            this.snackBar.open('Preferences saved locally, but could not save to server', 'Close', { duration: 3000 });
        }
    } finally {
        this.isSavingPrefs = false;
    }
  }
  
  removeBookmark(bookmark: string): void {
    if (confirm('Are you sure you want to remove this bookmark?')) {
      const index = this.bookmarks.indexOf(bookmark);
      if (index !== -1) {
        this.bookmarks.splice(index, 1);
        
        // Update preferences on server
        const bookmarkSub = this.authService.removeBookmark(bookmark).subscribe(
          response => {
            if (response.bookmarks) {
              this.bookmarks = response.bookmarks;
            }
            this.snackBar.open('Bookmark removed', 'Close', {
              duration: 2000
            });
          },
          error => {
            console.error('Error removing bookmark:', error);
            // Revert local change if server update fails
            this.bookmarks.splice(index, 0, bookmark);
            this.snackBar.open('Failed to remove bookmark', 'Close', {
              duration: 3000
            });
          }
        );
        
        this.subscriptions.push(bookmarkSub);
      }
    }
  }
  
  goToVerse(bookmark: string): void {
    const [surah, verse] = bookmark.split(':').map(Number);
    if (!surah || !verse) return;
    
    this.router.navigate(['/quran'], {
      queryParams: { 
        surah,
        mode: 'translation'
      }
    }).then(() => {
      // Use the exact working scrollToVerse implementation
      const attemptScroll = (attempts = 0) => {
        const verseElement = document.getElementById(`verse-${verse}`);
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
    });
  }
  
  goToHistoryEntry(entry: ReadingHistory): void {
    if (!entry.surah || !entry.verse) return;
    
    this.router.navigate(['/quran'], {
      queryParams: { 
        surah: entry.surah,
        mode: 'translation'
      }
    }).then(() => {
      // Use the exact working scrollToVerse implementation
      const attemptScroll = (attempts = 0) => {
        const verseElement = document.getElementById(`verse-${entry.verse}`);
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
    });
  }
  
  clearHistory(): void {
    if (confirm('Are you sure you want to clear your reading history?')) {
      const clearSub = from(this.authService.clearHistory()).subscribe(
        () => {
          this.readingHistory = [];
          this.snackBar.open('Reading history cleared', 'Close', {
            duration: 2000
          });
        },
        (error: Error) => {
          console.error('Error clearing history:', error);
          this.snackBar.open('Failed to clear reading history', 'Close', {
            duration: 3000
          });
        }
      );
      
      this.subscriptions.push(clearSub);
    }
  }
  
  getSurahName(surahNumber: string | number): string {
    const num = typeof surahNumber === 'string' ? parseInt(surahNumber, 10) : surahNumber;
    return this.quranService.getSurahName(num) || `Surah ${num}`;
  }

  async signOut(): Promise<void> {
    try {
      await this.authService.signOut();
      this.router.navigate(['/']);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }

  // Format label for slider
  formatLabel(value: number): string {
    return `${value}px`;
  }

  private loadTranslations(): void {
    if (this.translationsLoaded) return;
    
    // Get translations from QuranService
    this.translations = this.quranService.translations.map(t => ({
      id: t.id.toString(),
      name: t.name
    }));
    
    // Load current translation from preferences
    const cachedPrefs = localStorage.getItem('quranReaderPreferences');
    if (cachedPrefs) {
      try {
        const prefs = JSON.parse(cachedPrefs);
        if (prefs.translationId) {
          this.preferencesForm.patchValue({
            selectedTranslation: prefs.translationId
          });
        }
      } catch (error) {
        console.warn('Error loading translation preference:', error);
      }
    }
    
    this.translationsLoaded = true;
  }

  // Load user bookmarks
  private loadUserBookmarks(): void {
    if (this.bookmarksLoaded) return;
    
    this.isLoading = true;
    this.bookmarks = []; // Initialize as empty array
    
    const bookmarksSub = this.authService.bookmarks$.subscribe({
      next: (bookmarks) => {
        // Ensure bookmarks is treated as an array
        const bookmarksArray = Array.isArray(bookmarks) ? bookmarks : [];
        
        // Filter out any invalid bookmarks
        this.bookmarks = bookmarksArray.filter(bookmark => {
          if (!bookmark || typeof bookmark !== 'string') return false;
          const [surah, verse] = bookmark.split(':').map(Number);
          return !isNaN(surah) && !isNaN(verse) && surah >= 1 && surah <= 114;
        });
        this.bookmarksLoaded = true;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading bookmarks:', error);
        this.bookmarks = [];
        this.bookmarksLoaded = true;
        this.isLoading = false;
      }
    });
    
    this.subscriptions.push(bookmarksSub);
  }

  // Method to get both Arabic and English surah names
  getFullSurahName(surahNumber: string | number): string {
    const surah = this.quranService.surahs.find(s => s.number === Number(surahNumber));
    return surah ? `${surah.englishName} (${surah.name})` : `Surah ${surahNumber}`;
  }

  // Load reciters
  private loadReciters(): void {
    if (this.recitersLoaded) return;
    
    // Get reciters from QuranService
    this.reciters = this.quranService.reciters;
    console.log('Loading reciters:', this.reciters);
    
    // Load current reciter from preferences
    const cachedPrefs = localStorage.getItem('quranReaderPreferences');
    if (cachedPrefs) {
      try {
        const prefs = JSON.parse(cachedPrefs);
        if (prefs.reciterId) {
          const reciterId = parseInt(prefs.reciterId, 10);
          console.log('Setting reciter from cache:', reciterId);
          this.preferencesForm.patchValue({
            selectedReciter: reciterId
          }, { emitEvent: true });
        }
      } catch (error) {
        console.warn('Error loading reciter preference:', error);
        this.preferencesForm.patchValue({
          selectedReciter: 1
        }, { emitEvent: true });
      }
    }
    
    this.recitersLoaded = true;
  }

  // Add this method to check for duplicates
  private isDuplicateBookmark(bookmark: string): boolean {
    return this.bookmarks.includes(bookmark);
  }

  private isDuplicateHistory(entry: ReadingHistory): boolean {
    return this.readingHistory.some(h => 
      h.surah === entry.surah && 
      h.verse === entry.verse &&
      new Date(h.timestamp).getTime() > Date.now() - 1000 * 60 // Within last minute
    );
  }

  private isValidVerseForHistory(surah: number, verse: number): boolean {
    return (
      Number.isInteger(surah) &&
      Number.isInteger(verse) &&
      surah > 0 &&
      surah <= 114 &&
      verse > 0
    );
  }

  // Add compareById function for mat-select comparison
  compareById(id1: number, id2: number): boolean {
    return id1 === id2;
  }

  private validateReciterId(reciterId: number | undefined): number | null {
    // Check if the reciterId exists in our reciters array
    if (reciterId && this.quranService.reciters.some(r => r.id === reciterId)) {
      return reciterId;
    }
    return null;
  }

  private loadReadingHistory(): void {
    if (this.historyLoaded) return;
    this.isLoading = true;

    // Load from server
    const historySub = this.authService.getReadingHistory().pipe(
      // Only try once
      take(1)
    ).subscribe({
      next: (response: ReadingHistoryResponse) => {
        if (response.success && response.history) {
          // Filter and sort server history
          const serverHistory = response.history.filter((entry: ReadingHistory) => {
            if (!entry || !entry.surah || !entry.verse) return false;
            const timestamp = new Date(entry.timestamp);
            return timestamp <= new Date() && // No future dates
                   entry.surah >= 1 && entry.surah <= 114 && // Valid surah
                   entry.verse >= 1; // Valid verse
          }).sort((a: ReadingHistory, b: ReadingHistory) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );

          // Update component state
          this.readingHistory = serverHistory;

          // Update localStorage
          try {
            const localPrefs = localStorage.getItem('quran_reader_preferences');
            const prefs = localPrefs ? JSON.parse(localPrefs) : {};
            prefs.readingHistory = serverHistory;
            localStorage.setItem('quran_reader_preferences', JSON.stringify(prefs));
          } catch (error) {
            console.warn('Error updating localStorage with server history:', error);
          }
        }
        this.historyLoaded = true;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading reading history from server:', error);
        this.historyLoaded = true;
        this.isLoading = false;
      }
    });

    this.subscriptions.push(historySub);
  }

  private loadUserData() {
    // This method is no longer needed
  }

  private loadBookmarks() {
    // This method is no longer needed
  }

  // Fix initializeForm method name
  private initializeForm(): void {
    // Pass default values for reciterId, translationId, and fontSize
    this.initializeForms(1, '131', 24);
  }
} 