import { Component, OnInit } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { QuranService } from '../services/quran.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Router } from '@angular/router';
import { QuranReaderComponent } from '../components/quran/quran-reader/quran-reader.component';

interface UserPreferences {
  selectedReciter: number;
  selectedTranslation: string;
  fontSize: number;
  darkMode: boolean;
  bookmarks: string[];
}

interface ReadingHistoryEntry {
  timestamp: string;
  surah: number;
  ayah: number;
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
              <label for="darkMode">Dark Mode</label>
              <div class="toggle-switch">
                <input type="checkbox" 
                       id="darkMode" 
                       [(ngModel)]="preferences.darkMode" 
                       (change)="toggleDarkMode()"
                       class="toggle-input">
                <span class="toggle-slider"></span>
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
                <option *ngFor="let translation of quranService.translations" [ngValue]="translation.id">
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
                <span>{{ bookmark }}</span>
              </div>
              <button (click)="removeBookmark(bookmark)" class="btn-remove" title="Remove bookmark">
                <i class="fas fa-times"></i>
              </button>
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
            <span class="history-count">{{ readingHistory.length }} entries</span>
          </div>
          <div class="history-list">
            <div *ngFor="let entry of readingHistory" class="history-item">
              <div class="history-content">
                <div class="surah-ayah">
                  <i class="fas fa-book-open"></i>
                  <span>Surah {{ entry.surah }}: Ayah {{ entry.ayah }}</span>
                </div>
                <span class="timestamp">{{ entry.timestamp | date:'medium' }}</span>
              </div>
              <button (click)="navigateToVerse(entry.surah, entry.ayah)" class="btn-view">
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

    .toggle-switch {
      position: relative;
      display: inline-block;
      width: 60px;
      height: 34px;
    }

    .toggle-input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .toggle-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #e2e8f0;
      transition: .4s;
      border-radius: 34px;
    }

    .toggle-slider:before {
      position: absolute;
      content: "";
      height: 26px;
      width: 26px;
      left: 4px;
      bottom: 4px;
      background-color: white;
      transition: .4s;
      border-radius: 50%;
    }

    .toggle-input:checked + .toggle-slider {
      background-color: #B7A57A;
    }

    .toggle-input:checked + .toggle-slider:before {
      transform: translateX(26px);
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

    .btn-remove, .btn-view {
      padding: 0.5rem;
      border: none;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: all 0.2s;
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
      display: flex;
      align-items: center;
      gap: 0.5rem;
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

    .dark-mode .current-setting {
      color: #c0c0c0;
    }
  `]
})
export class ProfileComponent implements OnInit {
  user: any;
  preferences: UserPreferences = {
    selectedReciter: 7,
    selectedTranslation: '131',
    fontSize: 24,
    darkMode: false,
    bookmarks: []
  };
  readingHistory: ReadingHistoryEntry[] = [];
  showSuccessMessage = false;

  constructor(
    private authService: AuthService,
    public quranService: QuranService,
    public router: Router
  ) {}

  async ngOnInit() {
    this.authService.user$.subscribe(user => {
      if (user) {
        this.user = user;
        this.loadUserData();
      }
    });
  }

  private async loadUserData() {
    if (!this.user) return;

    // Load preferences
    this.preferences = await this.authService.getUserSettings();
    
    // Apply dark mode immediately
    this.applyDarkMode(this.preferences.darkMode);

    // Load reading history
    this.readingHistory = await this.authService.getReadingHistory();
  }

  toggleDarkMode() {
    this.applyDarkMode(this.preferences.darkMode);
  }

  private applyDarkMode(isDark: boolean) {
    // Remove any existing dark mode class
    document.body.classList.remove('dark-mode');
    // Add dark mode class if enabled
    if (isDark) {
      document.body.classList.add('dark-mode');
    }
    // Store the preference
    localStorage.setItem('darkMode', isDark.toString());
  }

  getCurrentReciterName(): string {
    const reciter = this.quranService.reciters.find(r => r.id === this.preferences.selectedReciter);
    return reciter ? reciter.name : 'Not set';
  }

  getCurrentTranslationName(): string {
    const translation = this.quranService.translations.find(t => t.id.toString() === this.preferences.selectedTranslation);
    return translation ? translation.name : 'Not set';
  }

  async savePreferences() {
    if (!this.user) return;
    
    try {
      // Save preferences to backend
      await this.authService.saveUserPreferences(this.preferences);
      
      // Show success message
      this.showSuccessMessage = true;
      setTimeout(() => {
        this.showSuccessMessage = false;
      }, 3000);

      // Apply preferences to Quran reader
      const quranReader = document.querySelector('app-quran-reader');
      if (quranReader) {
        // Get the component instance
        const quranReaderComponent = (quranReader as any).__ngContext__?.component;
        if (quranReaderComponent) {
          // Update the component's properties
          const selectedReciter = this.quranService.reciters.find(
            r => r.id === this.preferences.selectedReciter
          );
          if (selectedReciter) {
            quranReaderComponent.selectedReciter = selectedReciter;
          }

          const selectedTranslation = this.quranService.translations.find(
            t => t.id.toString() === this.preferences.selectedTranslation
          );
          if (selectedTranslation) {
            quranReaderComponent.selectedTranslation = selectedTranslation.id.toString();
          }

          quranReaderComponent.fontSize = this.preferences.fontSize;
          quranReaderComponent.isDarkMode = this.preferences.darkMode;
          
          // Trigger any necessary updates
          if (quranReaderComponent.onPreferencesChange) {
            quranReaderComponent.onPreferencesChange();
          }
        }
      }

      // Apply dark mode
      this.applyDarkMode(this.preferences.darkMode);
    } catch (error) {
      console.error('Error saving preferences:', error);
      // TODO: Show error message to user
    }
  }

  async removeBookmark(verseKey: string) {
    if (!this.user) return;
    await this.authService.removeBookmark(verseKey);
    this.preferences.bookmarks = this.preferences.bookmarks.filter(b => b !== verseKey);
  }

  navigateToVerse(surah: number, ayah: number) {
    this.router.navigate(['/quran'], { 
      queryParams: { 
        surah: surah,
        ayah: ayah
      }
    });
  }
} 