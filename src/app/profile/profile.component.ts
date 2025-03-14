import { Component, OnInit } from '@angular/core';
import { FirebaseAuthService } from '../services/firebase-auth.service';
import { QuranService } from '../services/quran.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Router } from '@angular/router';
import { QuranReaderComponent } from '../components/quran/quran-reader/quran-reader.component';
import { ToastService } from '../services/toast.service';

interface UserPreferences {
  selectedReciter: number;
  selectedTranslation: string;
  fontSize: number;
  bookmarks: string[];
  lastState?: {
    isMushafView: boolean;
    lastSurah?: number;
    lastVerse?: number;
    lastPage?: number;
  };
}

interface ReadingHistoryEntry {
  timestamp: string | Date;
  surah: number;
  verse: number;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="profile-container">
      <!-- Success Message -->
      <div *ngIf="showSuccessMessage" class="success-message">
        <i class="fas fa-check-circle"></i>
        <span>Preferences saved successfully!</span>
      </div>

      <div class="profile-header">
        <div class="user-info">
          <div class="profile-image-container">
            <img *ngIf="user?.imageUrl" [src]="user.imageUrl" alt="Profile" class="profile-image">
            <div *ngIf="!user?.imageUrl" class="profile-image-placeholder">
              <i class="fas fa-user"></i>
            </div>
          </div>
          <div class="user-details">
            <h2>{{ user?.firstName || user?.email }}</h2>
            <p>{{ user?.email }}</p>
            <p class="member-since">Member since {{ user?.createdAt | date:'MMMM yyyy' }}</p>
          </div>
        </div>
      </div>

      <div class="profile-content">
        <!-- Preferences Section -->
        <section class="preferences-section">
          <div class="section-header">
            <h3><i class="fas fa-cog"></i> Preferences</h3>
            <button (click)="savePreferences()" class="btn-save">
              <i class="fas fa-save"></i> Save Changes
            </button>
          </div>
          <div class="preferences-form">
            <div class="form-group">
              <label for="fontSize">Font Size</label>
              <div class="font-size-control">
                <input type="range" 
                       id="fontSize" 
                       [(ngModel)]="preferences.fontSize" 
                       min="16" 
                       max="32" 
                       class="range-slider">
                <span class="font-size-value">{{ preferences.fontSize }}px</span>
              </div>
            </div>

            <div class="form-group">
              <label for="selectedReciter">Reciter</label>
              <select id="selectedReciter" 
                      [(ngModel)]="preferences.selectedReciter" 
                      class="styled-select">
                <option *ngFor="let reciter of quranService.reciters" [ngValue]="reciter.id">
                  {{ reciter.name }} ({{ reciter.style }})
                </option>
              </select>
              <div class="current-setting">
                Current: {{ getCurrentReciterName() }}
              </div>
            </div>

            <div class="form-group">
              <label for="selectedTranslation">Translation</label>
              <select id="selectedTranslation" 
                      [(ngModel)]="preferences.selectedTranslation" 
                      class="styled-select">
                <option *ngFor="let translation of quranService.translations" [value]="translation.id">
                  {{ translation.name }} ({{ translation.language }})
                </option>
              </select>
              <div class="current-setting">
                Current: {{ getCurrentTranslationName() }}
              </div>
            </div>
          </div>
        </section>

        <!-- Bookmarks Section -->
        <section class="bookmarks-section">
          <div class="section-header">
            <h3><i class="fas fa-bookmark"></i> Bookmarks</h3>
            <span class="bookmark-count">{{ preferences.bookmarks.length }} bookmarks</span>
          </div>
          <div class="bookmarks-list">
            <div *ngFor="let bookmark of preferences.bookmarks" class="bookmark-item">
              <div class="bookmark-content">
                <i class="fas fa-bookmark"></i>
                <span>{{ formatVerseKey(bookmark) }}</span>
              </div>
              <div class="bookmark-actions">
                <button (click)="navigateToVerse(+bookmark.split(':')[0], +bookmark.split(':')[1])" 
                        class="btn-view" 
                        title="View verse">
                  <i class="fas fa-eye"></i>
                </button>
                <button (click)="removeBookmark(bookmark)" 
                        class="btn-remove" 
                        title="Remove bookmark">
                  <i class="fas fa-times"></i>
                </button>
              </div>
            </div>
            <div *ngIf="preferences.bookmarks.length === 0" class="empty-state">
              <i class="fas fa-bookmark"></i>
              <p>No bookmarks yet</p>
              <button (click)="router.navigate(['/quran'])" class="btn-browse">
                Browse Quran
              </button>
            </div>
          </div>
        </section>

        <!-- Reading History Section -->
        <section class="history-section">
          <div class="section-header">
            <h3><i class="fas fa-history"></i> Reading History</h3>
            <div class="flex items-center gap-4">
              <span class="history-count">{{ readingHistory.length }} entries</span>
              <button *ngIf="readingHistory.length > 0" 
                      (click)="clearHistory()" 
                      class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2">
                <i class="fas fa-trash"></i> Clear History
              </button>
            </div>
          </div>
          <div class="history-list">
            <div *ngFor="let entry of readingHistory" class="history-item">
              <div class="history-content">
                <div class="surah-ayah">
                  <i class="fas fa-book-open"></i>
                  <span>Surah {{ entry.surah }}, Verse {{ entry.verse }}</span>
                </div>
                <span class="timestamp">{{ entry.timestamp | date:'medium' }}</span>
              </div>
              <button (click)="navigateToVerse(entry.surah, entry.verse)" class="btn-view">
                <i class="fas fa-eye"></i> View
              </button>
            </div>
            <div *ngIf="readingHistory.length === 0" class="empty-state">
              <i class="fas fa-history"></i>
              <p>No reading history yet</p>
              <button (click)="router.navigate(['/quran'])" class="btn-browse">
                Start Reading
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .profile-container {
      max-width: 800px;
      margin: 2rem auto;
      padding: 0 1rem;
    }

    .success-message {
      position: fixed;
      top: 1rem;
      right: 1rem;
      background: #10B981;
      color: white;
      padding: 1rem 2rem;
      border-radius: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      animation: slideIn 0.3s ease-out;
      z-index: 1000;
    }

    @keyframes slideIn {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }

    .profile-header {
      background: linear-gradient(135deg, #B7A57A 0%, #9b8a65 100%);
      border-radius: 1rem;
      padding: 2rem;
      margin-bottom: 2rem;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      color: white;
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    .profile-image-container {
      position: relative;
    }

    .profile-image, .profile-image-placeholder {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      object-fit: cover;
      border: 4px solid white;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .profile-image-placeholder {
      background: rgba(255, 255, 255, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 3rem;
    }

    .user-details h2 {
      margin: 0;
      font-size: 2rem;
      font-weight: 600;
    }

    .user-details p {
      margin: 0.5rem 0 0;
      opacity: 0.9;
    }

    .member-since {
      font-size: 0.9rem;
      opacity: 0.8;
    }

    .profile-content {
      display: grid;
      gap: 2rem;
    }

    section {
      background: white;
      border-radius: 1rem;
      padding: 2rem;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
    }

    h3 {
      margin: 0;
      color: #2c3e50;
      font-size: 1.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .preferences-form {
      display: grid;
      gap: 2rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .form-group label {
      font-weight: 500;
      color: #4a5568;
      font-size: 1.1rem;
    }

    .font-size-control {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .range-slider {
      flex: 1;
      height: 6px;
      -webkit-appearance: none;
      background: #e2e8f0;
      border-radius: 3px;
      outline: none;
    }

    .range-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 20px;
      height: 20px;
      background: #B7A57A;
      border-radius: 50%;
      cursor: pointer;
      transition: all 0.2s;
    }

    .range-slider::-webkit-slider-thumb:hover {
      transform: scale(1.1);
    }

    .font-size-value {
      min-width: 60px;
      text-align: center;
      font-weight: 500;
      color: #4a5568;
    }

    .styled-select {
      padding: 0.75rem;
      border: 2px solid #e2e8f0;
      border-radius: 0.5rem;
      font-size: 1rem;
      color: #4a5568;
      background-color: white;
      cursor: pointer;
      transition: all 0.2s;
    }

    .styled-select:hover {
      border-color: #B7A57A;
    }

    .styled-select:focus {
      outline: none;
      border-color: #B7A57A;
      box-shadow: 0 0 0 3px rgba(183, 165, 122, 0.1);
    }

    .btn-save {
      background: #B7A57A;
      color: white;
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      border: none;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.2s;
    }

    .btn-save:hover {
      background: #9b8a65;
      transform: translateY(-1px);
    }

    .bookmarks-list, .history-list {
      display: grid;
      gap: 1rem;
    }

    .bookmark-item, .history-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      background: #f8fafc;
      border-radius: 0.5rem;
      transition: all 0.2s;
    }

    .bookmark-item:hover, .history-item:hover {
      background: #f1f5f9;
    }

    .bookmark-content {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      color: #4a5568;
    }

    .history-content {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .surah-ayah {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 500;
      color: #2c3e50;
    }

    .timestamp {
      font-size: 0.875rem;
      color: #666;
    }

    .bookmark-actions {
      display: flex;
      gap: 0.5rem;
    }

    .btn-remove, .btn-view {
      padding: 0.5rem;
      border: none;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .btn-remove {
      color: #e53e3e;
      background: none;
    }

    .btn-remove:hover {
      background: #fee2e2;
    }

    .btn-view {
      background: #B7A57A;
      color: white;
    }

    .btn-view:hover {
      background: #9b8a65;
    }

    .empty-state {
      text-align: center;
      padding: 2rem;
      color: #666;
    }

    .empty-state i {
      font-size: 3rem;
      color: #B7A57A;
      margin-bottom: 1rem;
    }

    .btn-browse {
      margin-top: 1rem;
      background: #B7A57A;
      color: white;
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      border: none;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-browse:hover {
      background: #9b8a65;
    }

    .bookmark-count, .history-count {
      background: #f1f5f9;
      padding: 0.5rem 1rem;
      border-radius: 2rem;
      font-size: 0.875rem;
      color: #4a5568;
    }

    @media (max-width: 640px) {
      .profile-container {
        margin: 1rem auto;
      }

      .profile-header {
        padding: 1.5rem;
      }

      .user-info {
        flex-direction: column;
        text-align: center;
      }

      .profile-image, .profile-image-placeholder {
        width: 100px;
        height: 100px;
      }

      .section-header {
        flex-direction: column;
        gap: 1rem;
        align-items: flex-start;
      }

      .btn-save {
        width: 100%;
        justify-content: center;
      }
    }

    .current-setting {
      font-size: 0.875rem;
      color: #666;
      margin-top: 0.25rem;
    }
  `]
})
export class ProfileComponent implements OnInit {
  user: any;
  preferences: UserPreferences = {
    selectedReciter: 7,
    selectedTranslation: '131',
    fontSize: 24,
    bookmarks: []
  };
  readingHistory: ReadingHistoryEntry[] = [];
  showSuccessMessage = false;

  constructor(
    private authService: FirebaseAuthService,
    public quranService: QuranService,
    public router: Router,
    private toastService: ToastService
  ) {}

  async ngOnInit() {
    // Show default UI immediately
    this.showDefaultUI();
    
    // Subscribe to auth state, but don't block rendering
    this.authService.user$.subscribe(user => {
      if (user) {
        this.user = user;
        this.loadUserData();
      }
    });
  }

  /**
   * Initialize the UI with default values for immediate display
   * This creates a more responsive feel while actual data loads
   */
  private showDefaultUI() {
    // Default user info placeholder 
    if (!this.user) {
      this.user = {
        email: 'Loading...',
        firstName: 'Loading',
        lastName: '...',
        imageUrl: '',
        createdAt: new Date()
      };
    }
    
    // Default preferences
    this.preferences = {
      selectedReciter: 7,
      selectedTranslation: '131',
      fontSize: 24,
      bookmarks: []
    };
    
    // Empty reading history (won't show initially)
    this.readingHistory = [];
  }

  private async loadUserData() {
    if (!this.user) return;

    try {
      // Load preferences
      const savedPreferences = await this.authService.getUserSettings();
      
      // Initialize preferences with defaults if not set
      this.preferences = {
        selectedReciter: savedPreferences?.selectedReciter ?? 7,
        selectedTranslation: savedPreferences?.selectedTranslation ?? '131',
        fontSize: savedPreferences?.fontSize ?? 24,
        bookmarks: savedPreferences?.bookmarks ?? [],
        lastState: savedPreferences?.lastState
      };

      // Load reading history
      this.readingHistory = await this.authService.getReadingHistory() || [];
      
      // Sort reading history by timestamp in descending order (most recent first)
      this.readingHistory.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch (error) {
      console.error('Error loading user data:', error);
      // Already showing default UI, so no need for additional fallback
    }
  }

  getCurrentReciterName(): string {
    const reciter = this.quranService.reciters.find(r => r.id === this.preferences.selectedReciter);
    return reciter ? `${reciter.name} (${reciter.style})` : 'Not set';
  }

  getCurrentTranslationName(): string {
    const translation = this.quranService.translations.find(t => t.id === Number(this.preferences.selectedTranslation));
    return translation ? `${translation.name} (${translation.language})` : 'Not set';
  }

  async savePreferences() {
    if (!this.user) return;
    
    try {
      // First save to backend to ensure it succeeds
      await this.authService.saveUserPreferences(this.preferences);
      
      // Then update QuranReader if it exists
      const quranReader = document.querySelector('app-quran-reader');
      if (quranReader) {
        const quranReaderComponent = (quranReader as any).__ngContext__?.component;
        if (quranReaderComponent) {
          // Stop any current playback
          if (quranReaderComponent.isPlaying || quranReaderComponent.isPlayingFullSurah) {
            quranReaderComponent.stopAndCloseAudioPlayer();
          }

          // Update reciter
          const selectedReciter = this.quranService.reciters.find(
            r => r.id === this.preferences.selectedReciter
          );
          if (selectedReciter) {
            quranReaderComponent.selectedReciter = selectedReciter;
          }

          // Update translation
          quranReaderComponent.selectedTranslation = this.preferences.selectedTranslation;

          // Update font size
          quranReaderComponent.fontSize = this.preferences.fontSize;

          // Save current state
          this.preferences.lastState = {
            isMushafView: quranReaderComponent.isMushafView,
            lastSurah: quranReaderComponent.currentSurah,
            lastVerse: quranReaderComponent.currentRecitingVerse,
            lastPage: quranReaderComponent.displayPageNumber
          };

          // Force reload current content with new settings
          if (quranReaderComponent.isMushafView) {
            quranReaderComponent.loadMushafPage(quranReaderComponent.currentPage);
          } else if (quranReaderComponent.currentSurah) {
            quranReaderComponent.loadSurah(quranReaderComponent.currentSurah);
          }
        }
      }
      
      // Show success message
      this.showSuccessMessage = true;
      setTimeout(() => {
        this.showSuccessMessage = false;
      }, 3000);
    } catch (error) {
      console.error('Error saving preferences:', error);
    }
  }

  async removeBookmark(verseKey: string) {
    if (!this.user) return;
    
    try {
      await this.authService.removeBookmark(verseKey);
      this.preferences.bookmarks = this.preferences.bookmarks.filter(b => b !== verseKey);
      this.toastService.show('Bookmark removed successfully');
    } catch (error) {
      console.error('Error removing bookmark:', error);
      this.toastService.show('Error removing bookmark');
    }
  }

  navigateToVerse(surah: number, ayah: number) {
    // Navigate to the Quran page with query params and preserve state
    this.router.navigate(['/quran'], { 
      queryParams: { 
        surah: surah,
        ayah: ayah
      },
      queryParamsHandling: 'merge' // This preserves existing query params
    });
  }

  formatVerseKey(verseKey: string): string {
    const [surah, ayah] = verseKey.split(':');
    const surahDetails = this.quranService.surahs.find(s => s.number === parseInt(surah));
    return `${surahDetails ? surahDetails.name : `Surah ${surah}`}, Verse ${ayah}`;
  }

  async clearHistory() {
    if (!this.user) return;
    
    try {
      await this.authService.clearReadingHistory();
      this.readingHistory = [];
      this.toastService.show('Reading history cleared successfully');
    } catch (error) {
      console.error('Error clearing reading history:', error);
      this.toastService.show('Error clearing reading history');
    }
  }
} 