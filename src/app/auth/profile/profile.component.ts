import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { FirebaseAuthService, AppUser } from '../../services/firebase-auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription, forkJoin, of } from 'rxjs';
import { catchError, takeUntil, map } from 'rxjs/operators';
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
import { ReadingHistoryEntry } from '../../interfaces/reading-history.interface';

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
    MatTooltipModule
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
  translations: any[] = [];
  bookmarks: string[] = [];
  readingHistory: ReadingHistoryEntry[] = [];
  
  // Cache flags to prevent redundant API calls
  private preferencesLoaded = false;
  private historyLoaded = false;
  private bookmarksLoaded = false;
  private recitersLoaded = false;
  private translationsLoaded = false;
  
  private subscriptions: Subscription[] = [];
  private lastSaveTime: number = 0;

  constructor(
    private fb: FormBuilder,
    private authService: FirebaseAuthService,
    private quranService: QuranService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    // Initialize forms immediately for a responsive UI
    this.initializeForms();
    
    // Pre-fill form with data from localStorage if available
    this.prefillFromCache();
    
    // Load reciters directly since it's a synchronous operation
    this.reciters = this.quranService.reciters;
    this.recitersLoaded = this.reciters.length > 0;
  }

  private initializeForms() {
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
    
    this.preferencesForm = this.fb.group({
      selectedReciter: [7],
      selectedTranslation: ['131'],
      fontSize: [24],
      showWordByWord: [false],
      darkMode: [false]
    });
  }

  private prefillFromCache() {
    try {
      // Check if we have cached user info
      const cachedUserStr = localStorage.getItem('currentUser');
      if (cachedUserStr) {
        const cachedUser = JSON.parse(cachedUserStr);
        if (cachedUser) {
          // Pre-fill form with cached data for immediate display
          this.profileForm.patchValue({
            firstName: cachedUser.firstName || '',
            lastName: cachedUser.lastName || '',
            email: cachedUser.email || ''
          });
          
          // We can hide loading since we're showing cached data
          setTimeout(() => {
            this.isLoading = false;
          }, 100);
        }
      }
      
      // Load preferences from localStorage
      const prefsStr = localStorage.getItem('quranPreferences');
      if (prefsStr) {
        const prefs = JSON.parse(prefsStr);
        if (prefs) {
          this.preferencesForm.patchValue({
            selectedReciter: prefs.selectedReciter || 7,
            selectedTranslation: prefs.selectedTranslation || '131',
            fontSize: prefs.fontSize || 24,
            showWordByWord: prefs.showWordByWord || false,
            darkMode: prefs.darkMode || false
          });
        }
      }
      
      // Load bookmarks from localStorage
      const bookmarksStr = localStorage.getItem('bookmarks');
      if (bookmarksStr) {
        this.bookmarks = JSON.parse(bookmarksStr) || [];
      }
    } catch (error) {
      // Ignore cache errors, will load from auth service
    }
  }

  ngOnInit(): void {
    // Get current user
    const userSub = this.authService.user$.subscribe(user => {
      if (user) {
        this.user = user;
        // Load preferences only if not already loaded
        if (!this.preferencesLoaded) {
          this.loadUserPreferences();
        }
        // Load history only if not already loaded
        if (!this.historyLoaded) {
          this.loadReadingHistory();
        }
        // Load bookmarks only if not already loaded
        if (!this.bookmarksLoaded) {
          this.loadUserBookmarks();
        }
      } else {
        this.router.navigate(['/login']);
      }
    });
    this.subscriptions.push(userSub);
    
    // Load translations only if not already loaded
    if (!this.translationsLoaded) {
      this.loadTranslations();
    }
    
    // Load reciters if needed
    if (!this.recitersLoaded) {
      this.loadReciters();
    }
  }
  
  private loadUserPreferences() {
    if (this.preferencesLoaded) return;
    
    this.isLoading = true;
    
    const prefsSub = this.authService.getUserPreferences().subscribe(
      (prefs: any) => {
        console.log('Loaded user preferences:', prefs);
        if (prefs) {
          this.preferencesForm.patchValue({
            selectedReciter: prefs.reciterId || 7,
            selectedTranslation: prefs.translationId || '131',
            fontSize: prefs.fontSize || 18,
            showWordByWord: prefs.showWordByWord || false,
            darkMode: prefs.darkMode || false
          });
        }
        this.preferencesLoaded = true;
        this.isLoading = false;
      },
      (error: any) => {
        console.error('Error loading user preferences:', error);
        // Try to load from localStorage as fallback
        const localPrefs = localStorage.getItem('quranReaderPreferences');
        if (localPrefs) {
          try {
            const prefs = JSON.parse(localPrefs);
            this.preferencesForm.patchValue({
              selectedReciter: prefs.reciterId || 7,
              selectedTranslation: prefs.translationId || '131',
              fontSize: prefs.fontSize || 18,
              showWordByWord: prefs.showWordByWord || false,
              darkMode: prefs.darkMode || false
            });
          } catch (e) {
            // Use defaults if parsing fails
          }
        }
        this.preferencesLoaded = true;
        this.isLoading = false;
      }
    );
    
    this.subscriptions.push(prefsSub);
  }
  
  private loadReadingHistory() {
    if (this.historyLoaded) return;
    this.isLoading = true;

    const historySub = this.authService.getReadingHistory().pipe(
      map(response => {
        // Ensure we have an array and not the browser History object
        let history = [];
        if (Array.isArray(response)) {
          history = response;
        } else if (response && response.history && Array.isArray(response.history)) {
          history = response.history;
        } else if (response && Array.isArray(response.data)) {
          history = response.data;
        } else if (response && typeof response === 'object') {
          // If response is an object, convert it to an array
          history = Object.values(response);
        }

        // Ensure we have an array even if all else fails
        if (!Array.isArray(history)) {
          history = [];
        }

        // Validate and transform each entry
        return history
          .filter((entry: ReadingHistoryEntry) =>
            entry &&
            typeof entry.surah === 'number' &&
            typeof entry.verse === 'number' &&
            entry.surah > 0 &&
            entry.surah <= 114
          )
          .map((entry: ReadingHistoryEntry) => ({
            surah: entry.surah,
            verse: entry.verse,
            timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date()
          }))
          .sort((a: ReadingHistoryEntry, b: ReadingHistoryEntry) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
      }),
      catchError(error => {
        console.error('Error loading reading history:', error);
        return of([]);
      })
    ).subscribe(history => {
      this.readingHistory = Array.isArray(history) ? history : [];
      this.historyLoaded = true;
      this.isLoading = false;
    });

    this.subscriptions.push(historySub);
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
    
    // Check if we've saved preferences too recently
    const now = Date.now();
    if (now - this.lastSaveTime < 5000) { // Less than 5 seconds since last save
      this.snackBar.open('Please wait a moment before saving again', 'Close', { duration: 2000 });
      return;
    }
    
    this.lastSaveTime = now;
    this.isSavingPrefs = true;
    const formValues = this.preferencesForm.value;
    
    const prefsToSave = {
      reciterId: formValues.selectedReciter,
      translationId: formValues.selectedTranslation,
      fontSize: formValues.fontSize,
      showWordByWord: formValues.showWordByWord,
      darkMode: formValues.darkMode
    };
    
    // First save to localStorage for immediate access with timestamp
    localStorage.setItem('quranReaderPreferences', JSON.stringify(prefsToSave));
    localStorage.setItem('preferences_save_timestamp', now.toString());
    
    try {
      // Only save to server if authenticated and not too frequent
      const isAuthenticated = await this.authService.isAuthenticated();
      if (!isAuthenticated) {
        this.snackBar.open('Preferences saved locally', 'Close', { duration: 2000 });
        this.isSavingPrefs = false;
        return;
      }
      
      await this.authService.saveUserPreferences(prefsToSave);
      this.snackBar.open('Preferences saved successfully', 'Close', { duration: 3000 });
    } catch (error: any) {
      // Handle rate limiting errors specially
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
          () => {
            this.snackBar.open('Bookmark removed', 'Close', {
              duration: 2000
            });
          },
          (error: any) => {
            console.error('Error removing bookmark:', error);
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
    const [surahStr, verseStr] = bookmark.split(':');
    const surah = parseInt(surahStr, 10);
    const verse = parseInt(verseStr, 10);
    
    if (isNaN(surah) || isNaN(verse)) {
      console.error('Invalid bookmark format:', bookmark);
      return;
    }

    // Pass the verse info through router state
    this.router.navigate(['/quran'], {
      queryParams: { 
        surah,
        mode: 'translation'
      },
      state: { 
        verseToScroll: verse,
        initialVerse: verse
      }
    });
  }
  
  goToHistoryEntry(entry: ReadingHistoryEntry): void {
    if (!entry || typeof entry.surah !== 'number' || typeof entry.verse !== 'number') {
      console.error('Invalid history entry:', entry);
      return;
    }

    // Pass the verse info through router state
    this.router.navigate(['/quran'], {
      queryParams: { 
        surah: entry.surah,
        mode: 'translation'
      },
      state: { 
        verseToScroll: entry.verse,
        initialVerse: entry.verse
      }
    });
  }
  
  clearHistory(): void {
    if (confirm('Are you sure you want to clear your reading history?')) {
      const clearSub = this.authService.clearReadingHistory().subscribe(
        () => {
          this.readingHistory = [];
          this.snackBar.open('Reading history cleared', 'Close', {
            duration: 2000
          });
        },
        (error: any) => {
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
    
    const transSub = this.quranService.getTranslations().subscribe(
      (translations) => {
        // Ensure translations is an array
        this.translations = Array.isArray(translations) ? translations : [];
        this.translationsLoaded = true;
      },
      (error) => {
        console.error('Error loading translations:', error);
        this.translations = [];
        this.translationsLoaded = true;
      }
    );
    this.subscriptions.push(transSub);
  }

  // Load user bookmarks
  loadUserBookmarks(): void {
    if (this.bookmarksLoaded) return;
    
    this.isLoading = true;
    
    const bookmarksSub = this.getBookmarks().subscribe(
      bookmarks => {
        this.bookmarks = bookmarks;
        this.bookmarksLoaded = true;
        this.isLoading = false;
      }
    );
    
    this.subscriptions.push(bookmarksSub);
  }

  // Get bookmarks with validation
  getBookmarks() {
    return this.authService.getBookmarks().pipe(
      map(bookmarks => {
        // Ensure we have an array
        if (!Array.isArray(bookmarks)) {
          console.warn('Bookmarks is not an array:', bookmarks);
          return [];
        }
        
        // Filter and validate bookmarks
        return bookmarks.filter(bookmark => {
          if (!bookmark || typeof bookmark !== 'string') return false;
          if (!bookmark.includes(':')) return false;
          
          const [surahStr, verseStr] = bookmark.split(':');
          const surah = parseInt(surahStr);
          const verse = parseInt(verseStr);
          
          return !isNaN(surah) && !isNaN(verse) && 
                 surah >= 1 && surah <= 114 && 
                 verse >= 1;
        });
      }),
      catchError(error => {
        console.error('Error getting bookmarks:', error);
        return of([]);
      })
    );
  }

  // Method to get both Arabic and English surah names
  getFullSurahName(surahNumber: string | number): string {
    const surah = this.quranService.surahs.find(s => s.number === Number(surahNumber));
    return surah ? `${surah.englishName} (${surah.name})` : `Surah ${surahNumber}`;
  }

  // Load reciters
  private loadReciters(): void {
    if (this.recitersLoaded) return;
    
    // Ensure reciters is an array
    this.reciters = Array.isArray(this.quranService.reciters) ? this.quranService.reciters : [];
    this.recitersLoaded = true;
    
    if (this.reciters.length === 0) {
      console.error('No reciters loaded from QuranService');
    }
  }
} 