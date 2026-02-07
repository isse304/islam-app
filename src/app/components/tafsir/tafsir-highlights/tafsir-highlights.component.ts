import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

// Material imports
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';

// Services
import { HighlightService } from '../../../services/highlight.service';
import { QuranService, Surah } from '../../../services/quran.service';

// Models
import { Highlight, BookmarkHelpers } from '../../../models/bookmark.model';

@Component({
  selector: 'app-tafsir-highlights',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    MatButtonToggleModule,
    MatTooltipModule,
    MatDividerModule
  ],
  templateUrl: './tafsir-highlights.component.html',
  styleUrls: ['./tafsir-highlights.component.scss']
})
export class TafsirHighlightsComponent implements OnInit {
  highlights: Highlight[] = [];
  filteredHighlights: Highlight[] = [];
  isLoading = true;

  // Filters
  searchQuery = '';
  selectedColor: Highlight['color'] | null = null;
  selectedSurah: number | null = null;

  // View mode
  viewMode: 'grid' | 'list' = 'list';

  // Surah list
  surahs: Surah[] = [];

  // Available colors
  highlightColors: Array<{ value: Highlight['color']; label: string; hex: string; icon: string }> = [
    { value: 'yellow', label: 'Yellow', hex: '#fef3c7', icon: '🟡' },
    { value: 'green', label: 'Green', hex: '#d1fae5', icon: '🟢' },
    { value: 'blue', label: 'Blue', hex: '#dbeafe', icon: '🔵' },
    { value: 'pink', label: 'Pink', hex: '#fce7f3', icon: '🟣' },
    { value: 'orange', label: 'Orange', hex: '#fed7aa', icon: '🟠' },
    { value: 'red', label: 'Red', hex: '#fee2e2', icon: '🔴' },
    { value: 'purple', label: 'Purple', hex: '#f3e8ff', icon: '🟪' }
  ];

  constructor(
    private highlightService: HighlightService,
    private quranService: QuranService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadSurahs();
    this.loadHighlights();
  }

  loadSurahs(): void {
    this.quranService.getSurahList().subscribe({
      next: (surahs) => {
        this.surahs = surahs;
      },
      error: (error) => console.error('Error loading surahs:', error)
    });
  }

  loadHighlights(): void {
    this.isLoading = true;
    const highlights = this.highlightService.getAllHighlights();
    this.highlights = BookmarkHelpers.sortByDate(highlights, true);
    this.applyFilters();
    this.isLoading = false;
  }

  applyFilters(): void {
    let filtered = [...this.highlights];

    // Search filter
    if (this.searchQuery.trim()) {
      filtered = BookmarkHelpers.searchHighlights(filtered, this.searchQuery);
    }

    // Color filter
    if (this.selectedColor) {
      filtered = filtered.filter(h => h.color === this.selectedColor);
    }

    // Surah filter
    if (this.selectedSurah) {
      filtered = filtered.filter(h => h.surah === this.selectedSurah);
    }

    this.filteredHighlights = filtered;
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  filterByColor(color: Highlight['color'] | null): void {
    this.selectedColor = color;
    this.applyFilters();
  }

  filterBySurah(surah: number | null): void {
    this.selectedSurah = surah;
    this.applyFilters();
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedColor = null;
    this.selectedSurah = null;
    this.applyFilters();
  }

  setViewMode(mode: 'grid' | 'list'): void {
    this.viewMode = mode;
  }

  deleteHighlight(id: string): void {
    if (confirm('Are you sure you want to delete this highlight?')) {
      this.highlightService.deleteHighlight(id).subscribe({
        next: () => {
          this.loadHighlights();
        },
        error: (error) => console.error('Error deleting highlight:', error)
      });
    }
  }

  goToVerse(highlight: Highlight): void {
    this.router.navigate([
      '/tafsir/read',
      highlight.editionId,
      highlight.surah,
      highlight.verse
    ]);
  }

  getSurahName(surahNumber: number): string {
    const surah = this.surahs.find(s => s.number === surahNumber);
    return surah ? `${surah.englishName}` : `Surah ${surahNumber}`;
  }

  getColorHex(color: Highlight['color']): string {
    const colorObj = this.highlightColors.find(c => c.value === color);
    return colorObj?.hex || '#fef3c7';
  }

  getColorLabel(color: Highlight['color']): string {
    const colorObj = this.highlightColors.find(c => c.value === color);
    return colorObj ? `${colorObj.icon} ${colorObj.label}` : color;
  }

  exportHighlights(): void {
    const dataStr = JSON.stringify(this.highlights, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tafsir-highlights-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  get totalHighlights(): number {
    return this.highlights.length;
  }

  get colorStats(): { color: Highlight['color']; count: number; hex: string }[] {
    const stats = new Map<Highlight['color'], number>();
    this.highlights.forEach(h => {
      stats.set(h.color, (stats.get(h.color) || 0) + 1);
    });
    return Array.from(stats.entries()).map(([color, count]) => ({
      color,
      count,
      hex: this.getColorHex(color)
    }));
  }
}
