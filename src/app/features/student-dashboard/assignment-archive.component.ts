import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArchiveService, ArchiveFilters, ArchiveStats, ArchivedAssignment } from '../../services/archive.service';
import { ClassService } from '../../services/class.service';
import { Class } from '../../models/classroom.models';

@Component({
  selector: 'app-assignment-archive',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './assignment-archive.component.html',
  styleUrls: ['./assignment-archive.component.scss']
})
export class AssignmentArchiveComponent implements OnInit {
  private archiveService = inject(ArchiveService);
  private classService = inject(ClassService);
  private cdr = inject(ChangeDetectorRef);
  
  assignments: ArchivedAssignment[] = [];
  allClasses: Class[] = [];
  stats: ArchiveStats | null = null;
  loading = true;
  
  // Filters
  selectedPreset: 'week' | 'month' | 'semester' | 'all' = 'all';
  selectedClassIds: string[] = [];
  searchTerm = '';
  minGrade = 0;
  maxGrade = 100;
  
  // View
  sortBy: 'date' | 'grade' | 'title' = 'date';
  sortDirection: 'asc' | 'desc' = 'desc';

  ngOnInit(): void {
    this.loadClasses();
    this.loadArchive();
  }

  private loadClasses(): void {
    this.classService.listMyClasses().subscribe({
      next: (classes) => {
        this.allClasses = classes;
      },
      error: (error) => {
        console.error('[Archive] Error loading classes:', error);
      }
    });
  }

  loadArchive(): void {
    this.loading = true;
    
    const filters = this.buildFilters();
    
    this.archiveService.getArchivedAssignments(filters).subscribe({
      next: (assignments) => {
        this.assignments = this.sortAssignments(assignments);
        this.loadStats(filters);
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  private loadStats(filters: Partial<ArchiveFilters>): void {
    this.archiveService.getArchiveStats(filters).subscribe({
      next: (stats) => {
        this.stats = stats;
      },
      error: (error) => {
        console.error('[Archive] Error loading stats:', error);
      }
    });
  }

  private buildFilters(): Partial<ArchiveFilters> {
    const dateRange = this.archiveService.getDatePreset(this.selectedPreset);
    
    return {
      dateRange: {
        ...dateRange,
        preset: this.selectedPreset
      },
      classIds: this.selectedClassIds,
      grades: {
        min: this.minGrade,
        max: this.maxGrade
      },
      searchTerm: this.searchTerm
    };
  }

  onPresetChange(): void {
    this.loadArchive();
  }

  onClassFilterChange(): void {
    this.loadArchive();
  }

  onSearchChange(): void {
    // Debounce search in real implementation
    this.loadArchive();
  }

  onGradeFilterChange(): void {
    this.loadArchive();
  }

  clearFilters(): void {
    this.selectedPreset = 'all';
    this.selectedClassIds = [];
    this.searchTerm = '';
    this.minGrade = 0;
    this.maxGrade = 100;
    this.loadArchive();
  }

  toggleSort(field: 'date' | 'grade' | 'title'): void {
    if (this.sortBy === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = field;
      this.sortDirection = 'desc';
    }
    this.assignments = this.sortAssignments(this.assignments);
  }

  private sortAssignments(assignments: ArchivedAssignment[]): ArchivedAssignment[] {
    return [...assignments].sort((a, b) => {
      let comparison = 0;
      
      switch (this.sortBy) {
        case 'date':
          const dateA = a.dueAt ? a.dueAt.toDate().getTime() : 0;
          const dateB = b.dueAt ? b.dueAt.toDate().getTime() : 0;
          comparison = dateB - dateA;
          break;
        case 'grade':
          const gradeA = a.submission?.score || 0;
          const gradeB = b.submission?.score || 0;
          comparison = gradeB - gradeA;
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
      }
      
      return this.sortDirection === 'asc' ? -comparison : comparison;
    });
  }

  exportCSV(): void {
    const blob = this.archiveService.exportToCSV(this.assignments);
    this.downloadFile(blob, 'assignment-archive.csv');
  }

  async exportPDF(): Promise<void> {
    const blob = await this.archiveService.exportToPDF(this.assignments);
    this.downloadFile(blob, 'assignment-archive.html');
  }

  private downloadFile(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  getGradeClass(grade: number): string {
    if (grade >= 90) return 'grade-a';
    if (grade >= 80) return 'grade-b';
    if (grade >= 70) return 'grade-c';
    return 'grade-d';
  }

  getGradeColor(grade: number): string {
    if (grade >= 90) return '#10B981';
    if (grade >= 80) return '#3B82F6';
    if (grade >= 70) return '#F59E0B';
    return '#EF4444';
  }

  getDueDate(assignment: ArchivedAssignment): Date | null {
    return assignment.dueAt ? assignment.dueAt.toDate() : null;
  }

  getSubmittedDate(assignment: ArchivedAssignment): Date | null {
    return assignment.submission?.submittedAt ? assignment.submission.submittedAt.toDate() : null;
  }
}
