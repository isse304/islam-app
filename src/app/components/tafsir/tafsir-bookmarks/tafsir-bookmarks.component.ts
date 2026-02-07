import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, combineLatest } from 'rxjs';

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
import { MatBadgeModule } from '@angular/material/badge';
import { MatDividerModule } from '@angular/material/divider';

// Services
import { BookmarkService } from '../../../services/bookmark.service';
import { NoteService } from '../../../services/note.service';
import { QuranService } from '../../../services/quran.service';

// Models
import { Bookmark, BookmarkFilter, BookmarkHelpers, Tag } from '../../../models/bookmark.model';

@Component({
  selector: 'app-tafsir-bookmarks',
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
    MatBadgeModule,
    MatDividerModule
  ],
  templateUrl: './tafsir-bookmarks.component.html',
  styleUrls: ['./tafsir-bookmarks.component.scss']
})
export class TafsirBookmarksComponent implements OnInit, OnDestroy {
  // Data
  allBookmarks: Bookmark[] = [];
  filteredBookmarks: Bookmark[] = [];
  tags: Tag[] = [];
  
  // Filter state
  searchQuery = '';
  selectedTags: string[] = [];
  selectedColor: string | null = null;
  selectedSurah: number | null = null;
  
  // View state
  viewMode: 'grid' | 'list' = 'grid';
  isLoading = false;
  
  // Stats
  totalBookmarks = 0;
  totalNotes = 0;
  
  // Colors for filtering
  bookmarkColors: Array<{ value: Bookmark['color']; label: string; icon: string }> = [
    { value: 'blue', label: 'General', icon: '🔵' },
    { value: 'green', label: 'Important', icon: '🟢' },
    { value: 'yellow', label: 'To Review', icon: '🟡' },
    { value: 'red', label: 'Questions', icon: '🔴' },
    { value: 'purple', label: 'Favorites', icon: '🟣' }
  ];
  
  // Surah list for filtering
  surahs: number[] = Array.from({ length: 114 }, (_, i) => i + 1);
  
  private destroy$ = new Subject<void>();

  constructor(
    private bookmarkService: BookmarkService,
    private noteService: NoteService,
    private quranService: QuranService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load all bookmarks, notes, and tags
   */
  loadData(): void {
    this.isLoading = true;

    combineLatest([
      this.bookmarkService.getBookmarks(),
      this.bookmarkService.getTags(),
      this.noteService.getNotes()
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ([bookmarks, tags, notes]) => {
          this.allBookmarks = bookmarks;
          this.filteredBookmarks = bookmarks;
          this.tags = tags;
          this.totalBookmarks = bookmarks.length;
          this.totalNotes = notes.length;
          this.isLoading = false;
          
          // Apply any active filters
          this.applyFilters();
        },
        error: (error) => {
          console.error('Error loading bookmarks:', error);
          this.isLoading = false;
        }
      });
  }

  /**
   * Apply all active filters
   */
  applyFilters(): void {
    let filtered = [...this.allBookmarks];

    // Search filter
    if (this.searchQuery) {
      filtered = BookmarkHelpers.search(
        filtered,
        this.searchQuery,
        ['verseText', 'tafsirExcerpt', 'tags']
      );
    }

    // Tag filter
    if (this.selectedTags.length > 0) {
      filtered = filtered.filter(bookmark =>
        this.selectedTags.some(tag => bookmark.tags.includes(tag))
      );
    }

    // Color filter
    if (this.selectedColor) {
      filtered = filtered.filter(bookmark => bookmark.color === this.selectedColor);
    }

    // Surah filter
    if (this.selectedSurah) {
      filtered = filtered.filter(bookmark => bookmark.surah === this.selectedSurah);
    }

    this.filteredBookmarks = filtered;
  }

  /**
   * Handle search input change
   */
  onSearchChange(): void {
    this.applyFilters();
  }

  /**
   * Toggle tag filter
   */
  toggleTag(tagName: string): void {
    const index = this.selectedTags.indexOf(tagName);
    if (index >= 0) {
      this.selectedTags.splice(index, 1);
    } else {
      this.selectedTags.push(tagName);
    }
    this.applyFilters();
  }

  /**
   * Set color filter
   */
  filterByColor(color: string | null): void {
    this.selectedColor = color;
    this.applyFilters();
  }

  /**
   * Set surah filter
   */
  filterBySurah(surah: number | null): void {
    this.selectedSurah = surah;
    this.applyFilters();
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.searchQuery = '';
    this.selectedTags = [];
    this.selectedColor = null;
    this.selectedSurah = null;
    this.applyFilters();
  }

  /**
   * Navigate to bookmarked verse in reader
   */
  openBookmark(bookmark: Bookmark): void {
    this.router.navigate([
      '/tafsir/read',
      bookmark.editionId,
      bookmark.surah,
      bookmark.verse
    ]);
  }

  /**
   * Delete a bookmark
   */
  deleteBookmark(bookmark: Bookmark, event: Event): void {
    event.stopPropagation();
    
    if (confirm(`Delete bookmark for ${bookmark.surah}:${bookmark.verse}?`)) {
      this.bookmarkService.deleteBookmark(bookmark.id).subscribe({
        next: () => {
          console.log('✅ Bookmark deleted');
          this.loadData();
        },
        error: (error) => {
          console.error('Error deleting bookmark:', error);
        }
      });
    }
  }

  /**
   * Change bookmark color
   */
  changeBookmarkColor(bookmark: Bookmark, color: Bookmark['color'], event: Event): void {
    event.stopPropagation();
    
    const updated = { ...bookmark, color };
    this.bookmarkService.saveBookmark(updated).subscribe({
      next: () => {
        console.log('✅ Bookmark color updated');
        this.loadData();
      },
      error: (error) => {
        console.error('Error updating bookmark:', error);
      }
    });
  }

  /**
   * Get surah name from number
   */
  getSurahName(surahNumber: number): string {
    return this.quranService.getSurahName(surahNumber);
  }

  /**
   * Get color hex value
   */
  getColorHex(color: Bookmark['color']): string {
    return BookmarkHelpers.getColorHex(color);
  }

  /**
   * Export bookmarks to JSON
   */
  exportBookmarks(): void {
    const json = this.bookmarkService.exportBookmarks();
    const blob = new Blob([json], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tafsir-bookmarks-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
    console.log('✅ Bookmarks exported');
  }

  /**
   * Import bookmarks from JSON file
   */
  importBookmarks(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const json = e.target?.result as string;
          this.bookmarkService.importBookmarks(json).subscribe({
            next: (count) => {
              console.log(`✅ Imported ${count} bookmarks`);
              this.loadData();
            },
            error: (error) => {
              console.error('Error importing bookmarks:', error);
              alert('Error importing bookmarks. Please check the file format.');
            }
          });
        } catch (error) {
          console.error('Error reading file:', error);
          alert('Error reading file. Please try again.');
        }
      };
      
      reader.readAsText(file);
    }
  }

  /**
   * Toggle view mode (grid/list)
   */
  setViewMode(mode: 'grid' | 'list'): void {
    this.viewMode = mode;
  }

  /**
   * Check if a tag is selected
   */
  isTagSelected(tagName: string): boolean {
    return this.selectedTags.includes(tagName);
  }

  /**
   * Get filter count (active filters)
   */
  getActiveFilterCount(): number {
    let count = 0;
    if (this.searchQuery) count++;
    if (this.selectedTags.length > 0) count += this.selectedTags.length;
    if (this.selectedColor) count++;
    if (this.selectedSurah) count++;
    return count;
  }
}
