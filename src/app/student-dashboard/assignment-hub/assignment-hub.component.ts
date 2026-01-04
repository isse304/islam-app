import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AssignmentService } from '../../services/assignment.service';
import { Assignment, AssignmentCategory, AssignmentStats } from '../../models/assignment.model';
import { AssignmentListComponent } from './assignment-list/assignment-list.component';

@Component({
  selector: 'app-assignment-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, AssignmentListComponent],
  templateUrl: './assignment-hub.component.html',
  styleUrls: ['./assignment-hub.component.scss']
})
export class AssignmentHubComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // Assignments by category
  dueTodayAssignments: Assignment[] = [];
  upcomingAssignments: Assignment[] = [];
  dueLaterAssignments: Assignment[] = [];
  completedAssignments: Assignment[] = [];
  overdueAssignments: Assignment[] = [];
  draftAssignments: Assignment[] = [];

  // All assignments
  allAssignments: Assignment[] = [];

  // Stats
  stats: AssignmentStats | null = null;

  // UI State
  loading = true;
  error: string | null = null;
  searchTerm = '';
  selectedFilter: 'all' | 'class' | 'type' = 'all';
  selectedClass: string | null = null;
  selectedType: Assignment['type'] | null = null;

  // Available filters
  availableClasses: { id: string; name: string; color: string }[] = [];
  availableTypes: Assignment['type'][] = ['quiz', 'essay', 'recording', 'project', 'worksheet', 'reading', 'other'];

  constructor(private assignmentService: AssignmentService) {}

  ngOnInit() {
    this.loadAssignments();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load all assignments
   */
  private loadAssignments() {
    this.loading = true;
    this.error = null;

    this.assignmentService.getStudentAssignments()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (assignments) => {
          this.allAssignments = assignments;
          this.categorizeAssignments(assignments);
          this.extractAvailableClasses(assignments);
          this.loadStats();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading assignments:', error);
          this.error = 'Failed to load assignments. Please try again.';
          this.loading = false;
        }
      });
  }

  /**
   * Load assignment statistics
   */
  private loadStats() {
    this.assignmentService.getAssignmentStats()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.stats = stats;
        },
        error: (error) => {
          console.error('Error loading stats:', error);
        }
      });
  }

  /**
   * Categorize assignments
   */
  private categorizeAssignments(assignments: Assignment[]) {
    this.dueTodayAssignments = this.filterByCategory(assignments, 'due_today');
    this.upcomingAssignments = this.filterByCategory(assignments, 'upcoming');
    this.dueLaterAssignments = this.filterByCategory(assignments, 'due_later');
    this.completedAssignments = this.filterByCategory(assignments, 'completed');
    this.overdueAssignments = this.filterByCategory(assignments, 'overdue');
    this.draftAssignments = this.filterByCategory(assignments, 'draft');
  }

  /**
   * Filter assignments by category
   */
  private filterByCategory(assignments: Assignment[], category: AssignmentCategory): Assignment[] {
    const now = new Date();

    switch (category) {
      case 'due_today':
        return assignments.filter(a => {
          const due = new Date(a.dueDate);
          return due.toDateString() === now.toDateString() && 
                 a.status !== 'submitted' && 
                 a.status !== 'graded';
        }).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

      case 'upcoming':
        return assignments.filter(a => {
          const due = new Date(a.dueDate);
          const daysUntilDue = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          return daysUntilDue > 0 && 
                 daysUntilDue <= 7 && 
                 a.status !== 'submitted' && 
                 a.status !== 'graded';
        }).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

      case 'due_later':
        return assignments.filter(a => {
          const due = new Date(a.dueDate);
          const daysUntilDue = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          return daysUntilDue > 7 && 
                 a.status !== 'submitted' && 
                 a.status !== 'graded';
        }).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

      case 'completed':
        return assignments.filter(a => 
          a.status === 'submitted' || 
          a.status === 'graded'
        ).sort((a, b) => {
          const dateA = a.submittedDate || a.dueDate;
          const dateB = b.submittedDate || b.dueDate;
          return dateB.getTime() - dateA.getTime();
        });

      case 'overdue':
        return assignments.filter(a => a.status === 'overdue')
          .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

      case 'draft':
        return assignments.filter(a => a.status === 'in_progress')
          .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

      default:
        return assignments;
    }
  }

  /**
   * Extract unique classes from assignments
   */
  private extractAvailableClasses(assignments: Assignment[]) {
    const classMap = new Map<string, { id: string; name: string; color: string }>();
    
    assignments.forEach(assignment => {
      if (!classMap.has(assignment.classId)) {
        classMap.set(assignment.classId, {
          id: assignment.classId,
          name: assignment.className,
          color: assignment.classColor
        });
      }
    });

    this.availableClasses = Array.from(classMap.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Search assignments
   */
  onSearch(term: string) {
    this.searchTerm = term;
    // Implement search filtering
    // TODO: Add search functionality
  }

  /**
   * Filter by class
   */
  filterByClass(classId: string | null) {
    this.selectedClass = classId;
    // Implement class filtering
    // TODO: Add class filtering
  }

  /**
   * Filter by type
   */
  filterByType(type: Assignment['type'] | null) {
    this.selectedType = type;
    // Implement type filtering
    // TODO: Add type filtering
  }

  /**
   * Reset filters
   */
  resetFilters() {
    this.searchTerm = '';
    this.selectedClass = null;
    this.selectedType = null;
    this.selectedFilter = 'all';
  }

  /**
   * Refresh assignments
   */
  refresh() {
    this.loadAssignments();
  }
}







