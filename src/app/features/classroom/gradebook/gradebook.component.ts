import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Observable, combineLatest, of } from 'rxjs';
import { map, switchMap, tap, startWith } from 'rxjs/operators';
import { GradeBookService } from '../../../services/gradebook.service';
import { AssignmentService } from '../../../services/assignment.service';
import { SubmissionService } from '../../../services/submission.service';
import { FirebaseAuthService } from '../../../services/firebase-auth.service';
import { ToastService } from '../../../services/toast.service';
import { GradePanelComponent } from '../../submissions/grade-panel.component';
import {
  GradeBookEntry,
  GradeBookStats,
  GradeBookFilters,
  StudentPerformance,
} from '../../../models/gradebook.models';
import { Assignment, Submission } from '../../../models/classroom.models';

@Component({
  selector: 'app-gradebook',
  templateUrl: './gradebook.component.html',
  styleUrls: ['./gradebook.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, GradePanelComponent],
})
export class GradeBookComponent implements OnInit {
  private gradebookService = inject(GradeBookService);
  private assignmentService = inject(AssignmentService);
  private submissionService = inject(SubmissionService);
  private authService = inject(FirebaseAuthService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private fb = inject(FormBuilder);

  // Data
  gradeBookEntries$!: Observable<GradeBookEntry[]>;
  gradeBookStats$!: Observable<GradeBookStats>;
  assignments$!: Observable<Assignment[]>;
  filteredEntries$!: Observable<GradeBookEntry[]>;

  // UI State
  isLoading = true;
  viewMode: 'grid' | 'cards' = 'grid';
  selectedSubmission: Submission | null = null;
  selectedStudentForPerformance: string | null = null;

  // Filters
  filterForm: FormGroup;
  searchQuery = '';
  currentFilters: GradeBookFilters = {
    performanceLevel: 'all',
    sortBy: 'name_asc',
  };

  // Grid data
  assignmentColumns: Assignment[] = [];
  visibleStudents: GradeBookEntry[] = [];

  constructor() {
    this.filterForm = this.fb.group({
      performanceLevel: ['all'],
      sortBy: ['name_asc'],
      search: [''],
    });
  }

  async ngOnInit() {
    await this.loadData();
    this.setupFilterSubscription();
    
    // Detect mobile for responsive view
    this.detectViewMode();
    window.addEventListener('resize', () => this.detectViewMode());
  }

  async loadData() {
    this.isLoading = true;
    
    try {
      const currentUser = await this.authService.getCurrentUser();
      if (!currentUser) {
        this.toastService.error('You must be logged in to view the grade book');
        this.router.navigate(['/login']);
        return;
      }

      const teacherId = currentUser.uid;

      // Load grade book data
      this.gradeBookEntries$ = this.gradebookService.getGradeBookData(teacherId);
      this.gradeBookStats$ = this.gradebookService.getGradeBookStats(teacherId);

      // Load assignments for columns
      this.assignments$ = this.assignmentService.listAssignmentsForTeacher(teacherId).pipe(
        map(assignments => assignments.sort((a, b) => 
          (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)
        ).slice(0, 10)) // Show last 10 assignments
      );

      // Subscribe to assignments to populate columns
      this.assignments$.subscribe(assignments => {
        this.assignmentColumns = assignments;
        this.cdr.detectChanges();
      });

      // Setup filtered entries with initial form value
      this.filteredEntries$ = combineLatest([
        this.gradeBookEntries$,
        this.filterForm.valueChanges.pipe(
          // Start with the current form value for initial load
          startWith(this.filterForm.value)
        )
      ]).pipe(
        map(([entries, filters]) => this.applyFilters(entries, filters)),
        tap(entries => {
          this.visibleStudents = entries;
          this.cdr.detectChanges();
        })
      );

      // Initial load
      this.filteredEntries$.subscribe();

      this.isLoading = false;
    } catch (error) {
      console.error('[GradeBook] Error loading data:', error);
      this.toastService.error('Failed to load grade book. Please try again.');
      this.isLoading = false;
    }
  }

  setupFilterSubscription() {
    this.filterForm.valueChanges.subscribe(values => {
      this.currentFilters = {
        ...this.currentFilters,
        performanceLevel: values.performanceLevel,
        sortBy: values.sortBy,
      };
      this.searchQuery = values.search || '';
    });
  }

  applyFilters(entries: GradeBookEntry[], filters: any): GradeBookEntry[] {
    let filtered = [...entries];

    // Apply performance level filter
    if (filters.performanceLevel === 'needs_attention') {
      filtered = filtered.filter(e => e.needsAttention);
    } else if (filters.performanceLevel === 'top_performers') {
      filtered = filtered.filter(e => e.average >= 90);
    }

    // Apply search
    const search = (filters.search || '').toLowerCase();
    if (search) {
      filtered = filtered.filter(e =>
        e.studentName.toLowerCase().includes(search) ||
        e.studentEmail.toLowerCase().includes(search)
      );
    }

    // Apply sorting
    switch (filters.sortBy) {
      case 'name_asc':
        filtered.sort((a, b) => a.studentName.localeCompare(b.studentName));
        break;
      case 'name_desc':
        filtered.sort((a, b) => b.studentName.localeCompare(a.studentName));
        break;
      case 'average_asc':
        filtered.sort((a, b) => a.average - b.average);
        break;
      case 'average_desc':
        filtered.sort((a, b) => b.average - a.average);
        break;
      case 'completion_asc':
        filtered.sort((a, b) => a.completionRate - b.completionRate);
        break;
      case 'completion_desc':
        filtered.sort((a, b) => b.completionRate - a.completionRate);
        break;
    }

    return filtered;
  }

  get completionRate(): (entry: GradeBookEntry) => number {
    return (entry: GradeBookEntry) => {
      return entry.totalAssignments > 0
        ? Math.round((entry.completedAssignments / entry.totalAssignments) * 100)
        : 0;
    };
  }

  detectViewMode() {
    this.viewMode = window.innerWidth < 1024 ? 'cards' : 'grid';
  }

  /**
   * Get color class for a score
   */
  getScoreColor(score: number | null): string {
    if (score === null) return 'bg-gray-200 dark:bg-gray-700 text-gray-500';
    if (score >= 85) return 'bg-green-500 text-white';
    if (score >= 70) return 'bg-yellow-500 text-white';
    if (score >= 60) return 'bg-orange-500 text-white';
    return 'bg-red-500 text-white';
  }

  /**
   * Get status color
   */
  getStatusColor(status: string): string {
    switch (status) {
      case 'graded': return 'bg-green-500';
      case 'submitted': return 'bg-blue-500';
      case 'in_progress': return 'bg-yellow-500';
      default: return 'bg-gray-300';
    }
  }

  /**
   * Get trend icon
   */
  getTrendIcon(trend: 'improving' | 'stable' | 'declining'): string {
    switch (trend) {
      case 'improving': return '↑';
      case 'declining': return '↓';
      default: return '→';
    }
  }

  /**
   * Get trend color
   */
  getTrendColor(trend: 'improving' | 'stable' | 'declining'): string {
    switch (trend) {
      case 'improving': return 'text-green-600 dark:text-green-400';
      case 'declining': return 'text-red-600 dark:text-red-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  }

  /**
   * Click on a grade cell to view/grade submission
   */
  async onCellClick(studentId: string, assignmentId: string, status: string) {
    if (status === 'not_started') {
      this.toastService.info('Student has not started this assignment yet');
      return;
    }

    try {
      // Find the submission
      const submissions = await this.submissionService
        .listSubmissionsForAssignment(assignmentId)
        .toPromise();
      
      const submission = submissions?.find(s => s.studentId === studentId);
      
      if (submission) {
        this.selectedSubmission = submission;
      } else {
        this.toastService.error('Submission not found');
      }
    } catch (error) {
      console.error('[GradeBook] Error loading submission:', error);
      this.toastService.error('Failed to load submission');
    }
  }

  /**
   * View student performance details
   */
  viewStudentPerformance(studentId: string) {
    this.selectedStudentForPerformance = studentId;
  }

  /**
   * Close grading panel
   */
  closeGradePanel() {
    this.selectedSubmission = null;
  }

  /**
   * Handle grading completion
   */
  async onGraded() {
    this.selectedSubmission = null;
    
    // Clear cache and reload data
    this.gradebookService.clearCache();
    await this.loadData();
    
    this.toastService.success('✓ Grade submitted! Grade book updated.');
  }

  /**
   * Close performance panel
   */
  closePerformancePanel() {
    this.selectedStudentForPerformance = null;
  }

  /**
   * Refresh data
   */
  async refreshData() {
    this.gradebookService.clearCache();
    await this.loadData();
    this.toastService.success('✓ Grade book refreshed!');
  }

  /**
   * Export to CSV
   */
  exportToCSV() {
    if (!this.visibleStudents || this.visibleStudents.length === 0) {
      this.toastService.error('No data to export');
      return;
    }

    const headers = [
      'Student Name',
      'Email',
      'Average',
      'Trend',
      'Completed',
      'Total',
      'Completion %',
      'Tajweed Avg',
      'Fluency Avg',
      'Accuracy Avg',
    ];

    const rows = this.visibleStudents.map(entry => [
      entry.studentName,
      entry.studentEmail,
      entry.average.toFixed(1),
      entry.trend,
      entry.completedAssignments,
      entry.totalAssignments,
      this.completionRate(entry),
      entry.averageTajweed.toFixed(1),
      entry.averageFluency.toFixed(1),
      entry.averageAccuracy.toFixed(1),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gradebook_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);

    this.toastService.success('✓ Grade book exported to CSV!');
  }

  /**
   * Navigate to student assignments page
   */
  goToStudentAssignments(studentId: string) {
    // TODO: Implement student detail view
    this.toastService.info('Student detail view coming soon!');
  }
}


