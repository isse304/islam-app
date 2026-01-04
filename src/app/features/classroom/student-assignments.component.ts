import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Observable, combineLatest } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { Assignment, Class, Submission } from '../../models/classroom.models';
import { AssignmentService } from '../../services/assignment.service';
import { ClassService } from '../../services/class.service';
import { SubmissionService } from '../../services/submission.service';
import { ToastService } from 'src/app/services/toast.service';

export interface AssignmentWithSubmission extends Assignment {
  submission?: Submission | null;
}

@Component({
  selector: 'app-student-assignments',
  templateUrl: './student-assignments.component.html',
  styleUrls: ['./student-assignments.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
})
export class StudentAssignmentsComponent implements OnInit {
  private assignmentService = inject(AssignmentService);
  private classService = inject(ClassService);
  private submissionService = inject(SubmissionService);
  private fb = inject(FormBuilder);
  private toastService = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

  myAssignments$!: Observable<AssignmentWithSubmission[]>;
  myClasses$!: Observable<Class[]>;
  joinClassForm: FormGroup;
  showJoinForm = false;
  joinError = '';
  joinSuccess = '';
  
  // Tab and categorization
  activeTab: 'active' | 'completed' | 'all' = 'active';
  dueTodayAssignments: AssignmentWithSubmission[] = [];
  upcomingThisWeekAssignments: AssignmentWithSubmission[] = [];
  dueLaterAssignments: AssignmentWithSubmission[] = [];
  overdueAssignments: AssignmentWithSubmission[] = [];
  completedAssignments: AssignmentWithSubmission[] = [];
  allAssignments: AssignmentWithSubmission[] = [];
  
  // Counts
  activeCount = 0;
  completedCount = 0;
  totalCount = 0;
  newlyGradedCount = 0;
  
  // Filter for hiding graded assignments
  hideGradedAssignments = false;

  constructor() {
    this.joinClassForm = this.fb.group({
      code: ['', Validators.required],
    });
  }

  ngOnInit(): void {
    this.loadAssignmentsWithSubmissions();
    this.myClasses$ = this.classService.listMyClasses();
  }

  private loadAssignmentsWithSubmissions(): void {
    this.myAssignments$ = this.assignmentService.listAssignmentsForStudent().pipe(
      switchMap(async (assignments) => {
        console.log('[StudentAssignments] Loaded assignments:', assignments.length);
        
        // Fetch submission status for each assignment
        const assignmentsWithSubmissions = await Promise.all(
          assignments.map(async (assignment) => {
            const submission = await this.submissionService.getSubmissionForStudent(assignment.id);
            return {
              ...assignment,
              submission
            } as AssignmentWithSubmission;
          })
        );
        
        console.log('[StudentAssignments] Assignments with submissions:', assignmentsWithSubmissions.length);
        
        // Categorize assignments
        this.categorizeAssignments(assignmentsWithSubmissions);
        
        // Trigger change detection
        this.cdr.detectChanges();
        
        return assignmentsWithSubmissions;
      })
    );
    
    // Subscribe to trigger the observable
    this.myAssignments$.subscribe({
      next: (assignments) => {
        console.log('[StudentAssignments] Subscription received:', assignments.length);
      },
      error: (error) => {
        console.error('[StudentAssignments] Error loading assignments:', error);
        this.toastService.error('Failed to load assignments. Please refresh the page.');
      }
    });
  }
  
  private categorizeAssignments(assignments: AssignmentWithSubmission[]): void {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);
    
    const oneWeekFromNow = new Date(today);
    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
    
    // Filter out graded assignments if hideGradedAssignments is true
    const filteredAssignments = this.hideGradedAssignments
      ? assignments.filter(a => a.submission?.status !== 'graded')
      : assignments;
    
    // Reset categories
    this.dueTodayAssignments = [];
    this.upcomingThisWeekAssignments = [];
    this.dueLaterAssignments = [];
    this.overdueAssignments = [];
    this.completedAssignments = [];
    this.allAssignments = filteredAssignments;
    
    filteredAssignments.forEach(assignment => {
      const dueDate = assignment.dueAt?.toDate();
      const isCompleted = assignment.submission?.status === 'submitted' || assignment.submission?.status === 'graded';
      
      if (isCompleted) {
        this.completedAssignments.push(assignment);
      } else if (dueDate) {
        if (dueDate < now) {
          // Overdue
          this.overdueAssignments.push(assignment);
        } else if (dueDate <= endOfToday) {
          // Due today
          this.dueTodayAssignments.push(assignment);
        } else if (dueDate <= oneWeekFromNow) {
          // Due this week
          this.upcomingThisWeekAssignments.push(assignment);
        } else {
          // Due later
          this.dueLaterAssignments.push(assignment);
        }
      } else {
        // No due date
        this.dueLaterAssignments.push(assignment);
      }
    });
    
    // Sort completed assignments by submission date (newest first)
    this.completedAssignments.sort((a, b) => {
      const dateA = a.submission?.submittedAt?.toDate()?.getTime() || 0;
      const dateB = b.submission?.submittedAt?.toDate()?.getTime() || 0;
      return dateB - dateA; // Descending order (newest first)
    });
    
    // Update counts (use original assignments for accurate totals)
    this.activeCount = filteredAssignments.length - this.completedAssignments.length;
    this.completedCount = this.completedAssignments.length;
    this.totalCount = filteredAssignments.length;
    
    // Count newly graded assignments (graded within last 7 days and student hasn't seen them yet)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    this.newlyGradedCount = this.completedAssignments.filter(a => {
      if (a.submission?.status === 'graded' && a.submission?.gradedAt) {
        const gradedDate = a.submission.gradedAt.toDate();
        return gradedDate >= sevenDaysAgo;
      }
      return false;
    }).length;
  }
  
  toggleHideGraded(): void {
    this.hideGradedAssignments = !this.hideGradedAssignments;
    
    // Re-trigger assignment loading to apply the filter
    this.loadAssignmentsWithSubmissions();
  }
  
  switchTab(tab: 'active' | 'completed' | 'all'): void {
    this.activeTab = tab;
  }

  toggleJoinForm() {
    this.showJoinForm = !this.showJoinForm;
    this.joinError = '';
    this.joinSuccess = '';
    this.joinClassForm.reset();
  }

  async joinClass() {
    if (this.joinClassForm.invalid) {
      this.toastService.error('Please enter a class code');
      return;
    }

    const code = this.joinClassForm.value.code.trim();
    
    if (!code) {
      this.toastService.error('Please enter a valid class code');
      return;
    }

    try {
      await this.classService.joinClassByCode(code);
      
      // Clear form state
      this.joinSuccess = 'Successfully joined class!';
      this.joinError = '';
      this.joinClassForm.reset();
      
      // Force refresh of data
      this.loadAssignmentsWithSubmissions();
      this.myClasses$ = this.classService.listMyClasses();
      
      // Trigger change detection
      this.cdr.detectChanges();
      
      // Show success message
      this.toastService.success(`✓ Successfully joined class with code: ${code}`);
      
      // Auto-hide form after delay
      setTimeout(() => {
        this.showJoinForm = false;
        this.joinSuccess = '';
        this.cdr.detectChanges();
      }, 2000);
    } catch (error: any) {
      console.error('Error joining class:', error);
      this.joinError = error.message || 'Failed to join class';
      this.joinSuccess = '';
      this.toastService.error(error.message || 'Failed to join class. Please check the code and try again.');
      this.cdr.detectChanges();
    }
  }

  /**
   * Navigate to the reader with assignment parameters
   */
  openAssignment(assignment: AssignmentWithSubmission): void {
    this.router.navigate(['/reader'], {
      queryParams: {
        surah: assignment.surah,
        start: assignment.startAyah,
        end: assignment.endAyah,
        mode: 'assignment',
        aid: assignment.id,
      },
    });
  }

  /**
   * Get the status label for an assignment
   */
  getStatusLabel(assignment: AssignmentWithSubmission): string {
    if (!assignment.submission) return 'Not Started';
    
    switch (assignment.submission.status) {
      case 'submitted':
        return 'Submitted';
      case 'graded':
        return 'Graded';
      case 'in_progress':
        return 'In Progress';
      default:
        return 'Not Started';
    }
  }

  /**
   * Check if assignment is submitted
   */
  isSubmitted(assignment: AssignmentWithSubmission): boolean {
    return assignment.submission?.status === 'submitted' || assignment.submission?.status === 'graded';
  }

  /**
   * Check if assignment is graded
   */
  isGraded(assignment: AssignmentWithSubmission): boolean {
    return assignment.submission?.status === 'graded';
  }
  
  /**
   * Check if assignment is newly graded (within last 7 days)
   */
  isNewlyGraded(assignment: AssignmentWithSubmission): boolean {
    if (assignment.submission?.status === 'graded' && assignment.submission?.gradedAt) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const gradedDate = assignment.submission.gradedAt.toDate();
      return gradedDate >= sevenDaysAgo;
    }
    return false;
  }

  /**
   * Get button text based on submission status
   */
  getButtonText(assignment: AssignmentWithSubmission): string {
    if (this.isSubmitted(assignment)) {
      return 'Revisit';
    }
    return 'Start Reading';
  }
}
