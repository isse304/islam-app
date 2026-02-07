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
import { NoteService } from '../../../services/note.service';
import { BookmarkService } from '../../../services/bookmark.service';
import { QuranService } from '../../../services/quran.service';

// Models
import { Note, NoteFilter, BookmarkHelpers, Tag } from '../../../models/bookmark.model';

@Component({
  selector: 'app-tafsir-notes',
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
  templateUrl: './tafsir-notes.component.html',
  styleUrls: ['./tafsir-notes.component.scss']
})
export class TafsirNotesComponent implements OnInit, OnDestroy {
  // Data
  allNotes: Note[] = [];
  filteredNotes: Note[] = [];
  tags: Tag[] = [];
  
  // Filter state
  searchQuery = '';
  selectedTags: string[] = [];
  selectedSurah: number | null = null;
  showPrivateOnly = false;
  
  // View state
  viewMode: 'grid' | 'list' = 'grid';
  isLoading = false;
  
  // Stats
  totalNotes = 0;
  totalBookmarks = 0;
  
  // Surah list for filtering
  surahs: number[] = Array.from({ length: 114 }, (_, i) => i + 1);
  
  private destroy$ = new Subject<void>();

  constructor(
    private noteService: NoteService,
    private bookmarkService: BookmarkService,
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
   * Load all notes and tags
   */
  loadData(): void {
    this.isLoading = true;

    combineLatest([
      this.noteService.getNotes(),
      this.noteService.getTags(),
      this.bookmarkService.getBookmarks()
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ([notes, tags, bookmarks]) => {
          this.allNotes = notes;
          this.filteredNotes = notes;
          this.tags = tags;
          this.totalNotes = notes.length;
          this.totalBookmarks = bookmarks.length;
          this.isLoading = false;
          
          // Apply any active filters
          this.applyFilters();
        },
        error: (error) => {
          console.error('Error loading notes:', error);
          this.isLoading = false;
        }
      });
  }

  /**
   * Apply all active filters
   */
  applyFilters(): void {
    let filtered = [...this.allNotes];

    // Search filter
    if (this.searchQuery) {
      filtered = BookmarkHelpers.search(
        filtered,
        this.searchQuery,
        ['plainText', 'tags']
      );
    }

    // Tag filter
    if (this.selectedTags.length > 0) {
      filtered = filtered.filter(note =>
        this.selectedTags.some(tag => note.tags.includes(tag))
      );
    }

    // Surah filter
    if (this.selectedSurah) {
      filtered = filtered.filter(note => note.surah === this.selectedSurah);
    }

    // Privacy filter
    if (this.showPrivateOnly) {
      filtered = filtered.filter(note => note.isPrivate);
    }

    this.filteredNotes = filtered;
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
   * Set surah filter
   */
  filterBySurah(surah: number | null): void {
    this.selectedSurah = surah;
    this.applyFilters();
  }

  /**
   * Toggle privacy filter
   */
  togglePrivacyFilter(): void {
    this.showPrivateOnly = !this.showPrivateOnly;
    this.applyFilters();
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.searchQuery = '';
    this.selectedTags = [];
    this.selectedSurah = null;
    this.showPrivateOnly = false;
    this.applyFilters();
  }

  /**
   * Navigate to verse with this note
   */
  openNote(note: Note): void {
    this.router.navigate([
      '/tafsir/read',
      note.editionId,
      note.surah,
      note.verse
    ]);
  }

  /**
   * Delete a note
   */
  deleteNote(note: Note, event: Event): void {
    event.stopPropagation();
    
    if (confirm(`Delete note for ${note.surah}:${note.verse}?`)) {
      this.noteService.deleteNote(note.id).subscribe({
        next: () => {
          console.log('✅ Note deleted');
          this.loadData();
        },
        error: (error) => {
          console.error('Error deleting note:', error);
        }
      });
    }
  }

  /**
   * Toggle note privacy
   */
  toggleNotePrivacy(note: Note, event: Event): void {
    event.stopPropagation();
    
    const updated = { ...note, isPrivate: !note.isPrivate };
    this.noteService.saveNote(updated).subscribe({
      next: () => {
        console.log('✅ Note privacy updated');
        this.loadData();
      },
      error: (error) => {
        console.error('Error updating note:', error);
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
   * Get word count from note
   */
  getWordCount(note: Note): number {
    return note.plainText.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Export notes to JSON
   */
  exportNotes(): void {
    const json = this.noteService.exportNotes();
    const blob = new Blob([json], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tafsir-notes-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
    console.log('✅ Notes exported');
  }

  /**
   * Import notes from JSON file
   */
  importNotes(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const json = e.target?.result as string;
          this.noteService.importNotes(json).subscribe({
            next: (count) => {
              console.log(`✅ Imported ${count} notes`);
              this.loadData();
            },
            error: (error) => {
              console.error('Error importing notes:', error);
              alert('Error importing notes. Please check the file format.');
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
    if (this.selectedSurah) count++;
    if (this.showPrivateOnly) count++;
    return count;
  }

  /**
   * Truncate HTML content for preview
   */
  getTruncatedContent(html: string, maxLength: number = 150): string {
    const plain = BookmarkHelpers.stripHtml(html);
    return BookmarkHelpers.truncate(plain, maxLength);
  }
}
