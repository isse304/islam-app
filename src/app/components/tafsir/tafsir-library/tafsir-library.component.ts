import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// Material imports
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

// Services
import { TafsirService } from '../../../services/tafsir.service';

// Models
import { TafsirEdition } from '../../../models/tafsir.model';

@Component({
  selector: 'app-tafsir-library',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatButtonToggleModule
  ],
  templateUrl: './tafsir-library.component.html',
  styleUrls: ['./tafsir-library.component.scss']
})
export class TafsirLibraryComponent implements OnInit {
  editions$!: Observable<TafsirEdition[]>;
  filteredEditions$!: Observable<TafsirEdition[]>;
  isLoading = false;
  isDarkMode = false;

  // Filters
  searchQuery = '';
  selectedLanguage = 'all';
  selectedDifficulty = 'all';
  showOnlyOffline = false;

  // View mode
  viewMode: 'grid' | 'list' = 'grid';

  // Available languages
  availableLanguages = [
    { value: 'all', label: 'All Languages' },
    { value: 'en', label: 'English' },
    { value: 'ar', label: 'Arabic' },
    { value: 'ur', label: 'Urdu' },
    { value: 'so', label: 'Somali' }
  ];

  // Difficulty levels
  difficultyLevels = [
    { value: 'all', label: 'All Levels' },
    { value: 'beginner', label: 'Beginner' },
    { value: 'intermediate', label: 'Intermediate' },
    { value: 'advanced', label: 'Advanced' }
  ];

  constructor(
    private tafsirService: TafsirService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.isDarkMode = document.body.classList.contains('theme-dark') || document.body.classList.contains('theme-night');
    this.loadEditions();
  }

  loadEditions(): void {
    this.isLoading = true;
    this.editions$ = this.tafsirService.getEditions();
    this.applyFilters();
    this.isLoading = false;
  }

  applyFilters(): void {
    this.filteredEditions$ = this.editions$.pipe(
      map(editions => {
        let filtered = editions;

        // Search filter
        if (this.searchQuery.trim()) {
          const query = this.searchQuery.toLowerCase();
          filtered = filtered.filter(edition =>
            edition.name.toLowerCase().includes(query) ||
            edition.author.toLowerCase().includes(query) ||
            edition.description.toLowerCase().includes(query)
          );
        }

        // Language filter
        if (this.selectedLanguage !== 'all') {
          filtered = filtered.filter(edition =>
            edition.language === this.selectedLanguage
          );
        }

        // Difficulty filter
        if (this.selectedDifficulty !== 'all') {
          filtered = filtered.filter(edition =>
            edition.difficulty === this.selectedDifficulty
          );
        }

        // Offline filter
        if (this.showOnlyOffline) {
          filtered = filtered.filter(edition => edition.isOfflineAvailable);
        }

        return filtered;
      })
    );
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  openEdition(edition: TafsirEdition, surah?: number, verse?: number): void {
    // Check if user has a saved position for this edition
    const savedProgress = localStorage.getItem(`tafsir_progress_${edition.id}`);
    
    if (savedProgress && !surah && !verse) {
      // Resume from last position
      try {
        const progress = JSON.parse(savedProgress);
        this.router.navigate(['/tafsir/read', edition.id, progress.surah, progress.verse]);
        return;
      } catch (error) {
        console.error('Error loading saved progress:', error);
      }
    }
    
    // Default to 1:1 or specified position
    this.router.navigate(['/tafsir/read', edition.id, surah || 1, verse || 1]);
  }

  getDifficultyColor(difficulty: string): string {
    switch (difficulty) {
      case 'beginner': return '#4caf50';
      case 'intermediate': return '#ff9800';
      case 'advanced': return '#f44336';
      default: return '#757575';
    }
  }

  getLanguageFlag(languageCode: string): string {
    const flags: { [key: string]: string } = {
      'en': '🇬🇧',
      'ar': '🇸🇦',
      'ur': '🇵🇰',
      'so': '🇸🇴',
      'id': '🇮🇩',
      'tr': '🇹🇷'
    };
    return flags[languageCode] || '🌍';
  }

  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
  }

  /**
   * Get saved reading progress for an edition
   */
  getSavedProgress(editionId: string): { surah: number; verse: number } | null {
    try {
      const savedProgress = localStorage.getItem(`tafsir_progress_${editionId}`);
      if (savedProgress) {
        const progress = JSON.parse(savedProgress);
        return { surah: progress.surah, verse: progress.verse };
      }
    } catch (error) {
      console.error('Error loading progress:', error);
    }
    return null;
  }

  /**
   * Check if user has reading progress for this edition
   */
  hasProgress(editionId: string): boolean {
    return this.getSavedProgress(editionId) !== null;
  }
}
