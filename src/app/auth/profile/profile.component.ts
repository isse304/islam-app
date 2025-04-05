import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { FirebaseAuthService, AppUser, UserPreferences } from '../../services/firebase-auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription, forkJoin, of, take, timeout, catchError, finalize, retry, from, filter, tap, switchMap, takeUntil, debounceTime, Subject, firstValueFrom } from 'rxjs';
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
import { QuranService, Reciter } from '../../services/quran.service';
import { ReadingHistory, ReadingHistoryResponse } from '../../interfaces/reading-history.interface';
import { UsageComponent } from '../../components/usage/usage.component';
import { StripeService } from '../../services/stripe.service';
import { SubscriptionStatus } from '../../interfaces/subscription-status.interface';
import { ApiService } from '../../services/api.service';
import { PreferencesService } from '../../services/preferences.service';
import { MatDialog } from '@angular/material/dialog';
import { DatePipe } from '@angular/common';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog.component';
import { DeleteConfirmationDialogComponent } from '../../components/dialogs/delete-confirmation-dialog/delete-confirmation-dialog.component';
import { SubscriptionService } from '../../services/subscription.service';
import { TimeoutError } from 'rxjs';
import { Observable } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';

// Keep local Translation interface
interface Translation {
  id: string;
  name: string;
}

// Removed local UserPreferences interface

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  ],
  providers: [
    DatePipe
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
  isDeletingAccount = false;
  isCancellingSubscription = false;
  subscriptionStatus: { plan: string; status: string; currentPeriodEnd?: Date | null } | null = null;
  historyLoading: boolean = false;
  historyLoadingError: string | null = null;
  
  // Quran preferences
  reciters: Reciter[] = [];
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

  private userSub?: Subscription;
  private destroy$ = new Subject<void>();
  private initialFormValues: any = {}; // Store initial values to check for changes
  error: string | null = null; // Declare the error property

  constructor(
    private fb: FormBuilder,
    private authService: FirebaseAuthService,
    private quranService: QuranService,
    private router: Router,
    private snackBar: MatSnackBar,
    private stripeService: StripeService,
    private apiService: ApiService,
    private preferencesService: PreferencesService,
    private dialog: MatDialog,
    private datePipe: DatePipe,
    private subscriptionService: SubscriptionService,
    private cdr: ChangeDetectorRef,
    private http: HttpClient
  ) {
    this.initializeForms(null, null, 24);

    // *** Subscribe to history updates ***
    this.authService.history$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(history => {
      // Ensure a new array reference is created for OnPush
      this.readingHistory = [...(history ?? [])];
      this.historyLoading = false; // Stop loading indicator when history is received
      this.historyLoadingError = null; // Clear any previous error
      // *** Force immediate change detection ***
      this.cdr.markForCheck();
    });
    // *** End history subscription ***
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
      // Initialize forms with default values if there's an error
      this.initializeForms(null, null, 24);
    }
  }

  private initializeForms(reciterId: number | null, translationId: string | null, fontSize: number) {
    // Initialize profile form
    this.profileForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: [{ value: '', disabled: true }, [Validators.required, Validators.email]] // Email likely shouldn't be editable here
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

    // Create preferences form
    this.preferencesForm = this.fb.group({
      selectedReciter: [reciterId, [Validators.required, Validators.min(1), Validators.max(this.reciters?.length || 1)]],
      selectedTranslation: [translationId, Validators.required],
      fontSize: [fontSize, [Validators.required, Validators.min(14), Validators.max(36)]],
      selectedTafsir: [''],
      arabicFont: ['uthmani'],
      showWordByWord: [true],
      isMushafView: [false],
      isDoublePageView: [false],
    });
  }

  ngOnInit(): void {
    this.isLoading = true; // Start main loading

    // Assign reciters and translations here
    this.reciters = this.quranService.reciters;
    this.translations = this.quranService.translations.map((t: any) => ({
      id: t.id.toString(),
      name: t.name
    }));
    
    // Re-initialize forms AFTER reciters/translations are set
    // This ensures default values are picked correctly if needed
    this.initializeForms(null, null, 24); 

    // Subscribe to the AppUser observable
    this.authService.user$.pipe(
      filter((user): user is AppUser => !!user), // Ensure user is not null
      take(1), // Take the first emitted AppUser
      tap(appUser => {
        this.user = appUser; // Assign the AppUser
        // Initiate loading of preferences, bookmarks (subscription status is part of AppUser)
        this.loadOtherUserData(appUser.id);
      }),
      catchError(err => {
        this.isLoading = false; // Stop loading on error fetching user
        this.error = 'Failed to load user data. Please log in again.';
        console.error('[Profile] Error getting user from authService.user$:', err);
        this.cdr.markForCheck();
        return of(null); // Complete the observable chain
      }),
      takeUntil(this.destroy$)
    ).subscribe();

    // Handle case where user$ might complete without emitting a user (e.g., logged out)
    // This might be redundant if the filter handles it, but provides a fallback.
    this.authService.user$.pipe(take(1)).subscribe(user => {
      if (!user) {
         this.isLoading = false;
         this.error = 'User not found. Please log in again.';
         this.cdr.markForCheck();
         // Optionally navigate to login
         // this.router.navigate(['/auth/login']);
      }
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.destroy$.next();
    this.destroy$.complete();
    this.userSub?.unsubscribe();
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
    if (!this.preferencesForm.valid) { 
        this.snackBar.open('Please correct the errors in the preferences form.', 'Close', { duration: 3000 });
        return;
    }
    this.isSavingPrefs = true;
    const currentValues = this.preferencesForm.value;
    const changesToSave: Partial<UserPreferences> = {};
    let hasChanges = false;

    Object.keys(currentValues).forEach(key => {
      const prefKey = key as keyof UserPreferences; // Cast key
      if (currentValues[prefKey] !== this.initialFormValues[prefKey]) {
        changesToSave[prefKey] = currentValues[prefKey]; // Use casted key
        hasChanges = true;
      }
    });

    if (!hasChanges) {
      this.snackBar.open('No changes to save.', 'Close', { duration: 3000 });
            this.isSavingPrefs = false;
            return;
        }
        
    this.authService.saveUserPreferences(changesToSave)
      .then((savedPrefs: Partial<UserPreferences>) => {
        this.initialFormValues = this.preferencesForm.value; // Update initial values after successful save
        this.snackBar.open('Preferences saved successfully!', 'Close', { duration: 3000 });
        this.isSavingPrefs = false;
        this.cdr.markForCheck(); // Trigger change detection
        this.preferencesForm.markAsPristine(); // Mark form as pristine
      })
      .catch((error: any) => {
        this.isSavingPrefs = false;
        this.snackBar.open(`Error saving preferences: ${error.message || 'Please try again.'}`, 'Close', { duration: 5000 });
        this.cdr.detectChanges();
      });
  }
  
  removeBookmark(bookmark: string): void {
    this.authService.removeBookmark(bookmark).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        if (response.success) {
              this.bookmarks = response.bookmarks;
          this.snackBar.open('Bookmark removed', 'Close', { duration: 2000 });
          this.cdr.detectChanges(); // Update UI
        } else {
          this.snackBar.open(`Failed to remove bookmark: ${response.message}`, 'Close', { duration: 4000 });
        }
      },
      error: (error) => {
        this.snackBar.open(`Error removing bookmark: ${error.message || 'Please try again.'}`, 'Close', { duration: 5000 });
      }
    });
  }
  
  goToVerse(bookmark: string): void {
    const [surah, verse] = bookmark.split(':');
    this.router.navigate(['/read', surah, verse]);
  }
  
  goToHistoryEntry(entry: ReadingHistory): void {
    // Navigate to /quran and pass surah/verse as query parameters
    this.router.navigate(['/quran'], { 
      queryParams: { 
        surah: entry.surah, 
        verse: entry.verse 
      } 
    });
  }
  
  async clearHistory(): Promise<void> {
    this.authService.clearHistory()
      .then(() => {
          this.readingHistory = [];
        this.cdr.detectChanges(); // Update UI
        this.snackBar.open('Reading history cleared', 'Close', { duration: 3000 });
      })
      .catch((error: any) => {
        this.snackBar.open(`Error clearing history: ${error.message || 'Please try again.'}`, 'Close', { duration: 5000 });
      });
  }
  
  getSurahName(surahNumber: string | number): string {
    const num = typeof surahNumber === 'string' ? parseInt(surahNumber, 10) : surahNumber;
    return this.quranService.getSurahName(num) || `Surah ${num}`;
  }

  async signOut(): Promise<void> {
    try {
      await this.authService.signOut();
    } catch (error) {
      this.snackBar.open(`Sign out failed: ${error}`, 'Close', { duration: 5000 });
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
    
    // Load current reciter from preferences
    const cachedPrefs = localStorage.getItem('quranReaderPreferences');
    if (cachedPrefs) {
      try {
        const prefs = JSON.parse(cachedPrefs);
        if (prefs.reciterId) {
          const reciterId = parseInt(prefs.reciterId, 10);
          this.preferencesForm.patchValue({
            selectedReciter: reciterId
          }, { emitEvent: true });
        }
      } catch (error) {
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
  compareById(item1: any, item2: any): boolean {
    return item1 && item2 ? item1 === item2 : item1 === item2;
  }

  private validateReciterId(reciterId: number | undefined): number | null {
    // Check if the reciterId exists in our reciters array
    if (reciterId && this.quranService.reciters.some(r => r.id === reciterId)) {
      return reciterId;
    }
    return null;
  }

  // *** Renamed and wrapped original loadUserData logic ***
  private loadOtherUserData(userId: string): void {
    this.isLoading = true; // Ensure loading is true
    this.cdr.markForCheck();

    forkJoin({
      preferences: this.loadPreferences(userId), // Fetches and initializes form
      bookmarks: this.loadBookmarks(userId)
      // Removed subscription: this.loadSubscriptionStatus(userId)
    })
    .pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        this.isLoading = false; // Stop main loading AFTER forkJoin completes or errors
        this.cdr.markForCheck();
        // console.log('[Profile] Main data loading finalized (isLoading=false).');
      })
    )
    .subscribe({
      next: (results) => {
        // Preferences are handled within loadPreferences/form init
        this.bookmarks = results.bookmarks || [];
        // Subscription status should be available on this.user if loaded correctly by authService
        this.subscriptionStatus = this.user?.subscriptionStatus ? {
            plan: this.user.isPremium ? 'premium' : 'free',
            status: this.user.subscriptionStatus,
            currentPeriodEnd: this.user.subscriptionEnd ? new Date(this.user.subscriptionEnd * 1000) : null
        } : null;
        // console.log('[Profile] Main data loaded successfully. Subscription Status:', this.subscriptionStatus);

        // *** NOW load history AFTER main data is loaded successfully ***
        this.loadHistorySeparately();
      },
      error: (err) => {
        console.error('[Profile] Error loading main user data (forkJoin):', err);
        this.error = 'Failed to load profile data. Please try refreshing the page.';
        // isLoading is set to false in finalize
      }
    });
  }

  // Load Preferences
  private loadPreferences(userId: string): Observable<UserPreferences | null> {
    // Check flag
    if (this.preferencesLoaded) return of(this.preferences);

    // Convert Promise to Observable using from()
    return from(this.authService.getUserPreferences()).pipe(
      timeout(10000),
      catchError(error => {
        this.handleDataLoadError(error, 'preferences');
        return of(null); // Return null on error/timeout
      }),
      tap(() => this.preferencesLoaded = true) // Mark as loaded
    );
  }

  // Fix initializeForm method name
  private initializeForm(): void {
    // Pass default values for reciterId, translationId, and fontSize
    this.initializeForms(1, '131', 24);
  }

  async resetPassword(): Promise<void> {
    if (this.profileForm.get('email')?.invalid) {
      this.snackBar.open('Please enter a valid email address', 'Close', {
        duration: 3000
      });
      return;
    }

      const email = this.profileForm.get('email')?.value;
    this.authService.sendPasswordResetEmail(email)
      .then(() => {
        this.snackBar.open('Password reset email sent. Check your inbox.', 'Close', { duration: 5000 });
      })
      .catch(error => {
        this.snackBar.open(`Error sending reset email: ${error.message || 'Please try again.'}`, 'Close', { duration: 5000 });
      });
  }

  // Method to initiate the delete account confirmation dialog
  openDeleteConfirmationDialog(): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Account?',
        message: 'Are you sure you want to permanently delete your account and all associated data (including subscription, if active)? This action cannot be undone.',
        confirmButtonText: 'Delete Account',
        confirmButtonColor: 'warn'
      },
      disableClose: true // Prevent closing by clicking outside
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result === true) {
        // User confirmed deletion, proceed
        await this.performAccountDeletion();
      }
    });
  }

  // Updated method to perform the actual deletion via the backend
  private async performAccountDeletion(): Promise<void> {
    if (this.isDeletingAccount) return; // Prevent multiple clicks

    this.isDeletingAccount = true;
    this.cdr.markForCheck(); // Update view to show spinner

    try {
      // Call the new backend endpoint using HttpClient
      const response = await firstValueFrom(this.http.delete<any>(
        `${environment.apiUrl}/api/users/me`
        // No body needed for DELETE, interceptor handles token
      ));

      // Use optional chaining for safer access
      if (response?.success) {
        console.log('[Profile] Account deletion successful on backend.');
        this.snackBar.open('Your account has been deleted successfully.', 'Close', {
          duration: 5000,
          panelClass: ['snackbar-success'] // Optional: Add success class
        });

        // Perform frontend sign-out and redirect AFTER backend confirms
        await this.authService.signOut(); // Handles cleanup and redirect

      } else {
        // Backend responded but indicated failure
        console.error('[Profile] Backend failed to delete account:', response);
        // Use optional chaining and provide defaults
        const errorMessage = response?.message ?? response?.error ?? 'Failed to delete account on the server.';
        this.snackBar.open(`Error: ${errorMessage}`, 'Close', {
          duration: 7000,
          panelClass: ['snackbar-error'] // Optional: Add error class
        });
      }

    } catch (error: any) {
      console.error('[Profile] Error calling account deletion endpoint:', error);
      let errorMessage = 'An unexpected error occurred.';
      if (error instanceof HttpErrorResponse) {
        // Use optional chaining and provide defaults
        errorMessage = error.error?.message ?? error.error?.error ?? error.message ?? 'Server error during deletion.';
        if (error.status === 401 || error.status === 403) {
          errorMessage = 'Authentication error. Please try logging out and back in.';
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      this.snackBar.open(`Account Deletion Failed: ${errorMessage}`, 'Close', {
        duration: 7000,
        panelClass: ['snackbar-error'] // Optional: Add error class
      });

    } finally {
      this.isDeletingAccount = false;
      this.cdr.markForCheck(); // Update view to hide spinner
    }
  }

  async manageSubscription(): Promise<void> {
    this.isCancellingSubscription = true;
    this.cdr.markForCheck();
    try {
      const response = await this.apiService.createCustomerPortalSession();
      // console.log('[Profile] Customer portal session created:', response);
      if (response?.url) {
        window.location.href = response.url;
      } else {
        throw new Error('No portal URL received from backend.');
      }
    } catch (error: any) {
      // console.error('[Profile] Error creating customer portal session:', error);
      this.snackBar.open(`Could not open subscription management: ${error?.error?.error || error?.message || 'Please try again.'}`, 'Close', {
        duration: 7000,
        panelClass: ['snackbar-error']
      });
    } finally {
      this.isCancellingSubscription = false;
      this.cdr.markForCheck();
    }
  }

  // Load Bookmarks
  private loadBookmarks(userId: string): Observable<string[] | null> {
    // Check flag
    if (this.bookmarksLoaded) return of(this.bookmarks);

    return this.authService.getBookmarks().pipe(
      timeout(10000),
      catchError(error => {
        this.handleDataLoadError(error, 'bookmarks');
        return of(null); // Return null on error/timeout
      }),
      tap(() => this.bookmarksLoaded = true) // Mark as loaded
    );
  }

  // Centralized Error Handler for Data Loading
  private handleDataLoadError(error: any, context: string): void {
    console.error(`Error loading data (${context}):`, error);
    let message = `Failed to load ${context}.`;
    if (error instanceof TimeoutError) {
      message = `Loading ${context} timed out. Please try again later.`;
    } else if (error?.status === 403 || error?.status === 401) {
      message = `Authentication error loading ${context}. Please sign in again.`;
      this.authService.signOut(); // Sign out on auth errors
    } else if (error?.message) {
      message = `Error loading ${context}: ${error.message}`;
    }

    // Specific handling for history errors
    if (context === 'history') {
      this.historyLoadingError = message;
      this.historyLoading = false; // Ensure loading stops on error
    } else {
      // General error notification for other contexts
      this.snackBar.open(message, 'Close', { duration: 5000 });
    }
    this.cdr.markForCheck(); // Update UI
  }

  // Make public so template can call it for retry
  public loadHistorySeparately() {
    // console.log('[Profile] loadHistorySeparately initiated.'); // Add log
    this.historyLoading = true;
    this.historyLoadingError = null;
    this.cdr.markForCheck(); // Trigger detection for spinner

    this.authService.getReadingHistory().pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        // Fallback: Ensure loading is stopped regardless of success or error
        if (this.historyLoading) {
          this.historyLoading = false;
          this.cdr.markForCheck(); // Trigger change detection
          // console.log('[Profile] History loading finalized (fallback).');
        }
      })
    ).subscribe({
      next: (response) => {
        // console.log('[Profile] History API response received:', response); // Add log
        if (response.success) {
          this.readingHistory = response.history;
          this.historyLoaded = true; // Mark history as successfully loaded
          // console.log('[Profile] History loaded successfully (next block):', this.readingHistory);
        } else {
          // Use a generic error message if success is false, as 'message' isn't guaranteed
          this.historyLoadingError = 'Failed to load history (API returned success: false)';
          // console.warn('[Profile] History API error (next block):', this.historyLoadingError);
          this.readingHistory = []; // Ensure history is empty on API failure
          this.historyLoaded = false;
        }
        // Explicitly set loading false here
        this.historyLoading = false;
        // console.log('[Profile] historyLoading set to false in next block.'); // Add log
        this.cdr.markForCheck();
      },
      error: (error) => {
        // Handle HTTP errors from the observable chain
        this.historyLoadingError = error.message || 'Failed to load history (network/request error)';
        // console.error('[Profile] History loading HTTP error (error block):', error);
        this.readingHistory = []; // Ensure history is empty on error
        this.historyLoaded = false;
        // Explicitly set loading false here
        this.historyLoading = false;
        // console.log('[Profile] historyLoading set to false in error block.'); // Add log
        this.cdr.markForCheck();
      }
      // No need for complete handler, finalize handles cleanup
    });
  }

  // ... rest of the methods (compareById, resetPassword, manageSubscription, etc.)
} 