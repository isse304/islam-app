import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';
import { AssignmentService } from '../../services/assignment.service';
import { SubmissionService } from '../../services/submission.service';
import { Assignment, Submission } from '../../models/classroom.models';
import { ProgressSummaryWidgetComponent } from './widgets/progress-summary-widget.component';
import { TodayFocusWidgetComponent } from './widgets/today-focus-widget.component';
import { WeekOverviewWidgetComponent } from './widgets/week-overview-widget.component';
import { FirebaseAuthService } from '../../services/firebase-auth.service';

interface AssignmentWithSubmission extends Assignment {
  submission?: Submission | null;
}

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ProgressSummaryWidgetComponent,
    TodayFocusWidgetComponent,
    WeekOverviewWidgetComponent
  ],
  templateUrl: './dashboard-home.component.html',
  styleUrls: ['./dashboard-home.component.scss']
})
export class DashboardHomeComponent implements OnInit {
  private assignmentService = inject(AssignmentService);
  private submissionService = inject(SubmissionService);
  private authService = inject(FirebaseAuthService);
  private cdr = inject(ChangeDetectorRef);
  
  studentName = '';
  
  // Widget data
  overallGrade = 0;
  letterGrade = 'N/A';
  gradeChange = 0;
  
  completedToday = 0;
  totalToday = 0;
  
  dueThisWeek = 0;
  completedThisWeek = 0;
  overdueThisWeek = 0;
  
  // Upcoming deadlines
  upcomingDeadlines: { day: string; count: number; urgency: 'urgent' | 'warning' | 'normal' }[] = [];
  
  // Recent assignments
  recentAssignments: AssignmentWithSubmission[] = [];
  
  loading = true;

  ngOnInit(): void {
    this.authService.user$.subscribe((user: any) => {
      if (user) {
        this.studentName = user.displayName || user.email?.split('@')[0] || 'Student';
      }
    });
    
    this.loadDashboardData();
  }

  private async loadDashboardData(): Promise<void> {
    try {
      this.loading = true;
      
      // Get all assignments for student
      const assignments = await firstValueFrom(this.assignmentService.listAssignmentsForStudent());
      
      // Get submissions for all assignments
      const assignmentsWithSubmissions = await Promise.all(
        assignments.map(async (assignment) => {
          try {
            const submission = await this.submissionService.getSubmissionForStudent(assignment.id);
            return {
              ...assignment,
              submission
            } as AssignmentWithSubmission;
          } catch (error) {
            return {
              ...assignment,
              submission: null
            } as AssignmentWithSubmission;
          }
        })
      );
      
      // Calculate overall grade
      this.calculateOverallGrade(assignmentsWithSubmissions);
      
      // Calculate today's stats
      this.calculateTodayStats(assignmentsWithSubmissions);
      
      // Calculate week stats
      this.calculateWeekStats(assignmentsWithSubmissions);
      
      // Calculate upcoming deadlines
      this.calculateUpcomingDeadlines(assignmentsWithSubmissions);
      
      // Get recent assignments (top 5)
      this.recentAssignments = assignmentsWithSubmissions
        .filter(a => a.submission?.status === 'graded' || a.submission?.status === 'submitted')
        .sort((a, b) => {
          const dateA = a.submission?.submittedAt ? a.submission.submittedAt.toDate() : a.createdAt.toDate();
          const dateB = b.submission?.submittedAt ? b.submission.submittedAt.toDate() : b.createdAt.toDate();
          return dateB.getTime() - dateA.getTime();
        })
        .slice(0, 5);
      
      this.loading = false;
      this.cdr.detectChanges();
    } catch (error) {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private calculateOverallGrade(assignments: AssignmentWithSubmission[]): void {
    const gradedAssignments = assignments.filter(a => a.submission?.status === 'graded' && a.submission.score != null);
    
    if (gradedAssignments.length === 0) {
      this.overallGrade = 0;
      this.letterGrade = 'N/A';
      this.gradeChange = 0;
      return;
    }
    
    const totalScore = gradedAssignments.reduce((sum, a) => sum + (a.submission?.score || 0), 0);
    const totalPossible = gradedAssignments.length * 100;
    
    this.overallGrade = Math.round((totalScore / totalPossible) * 100);
    this.letterGrade = this.getLetterGrade(this.overallGrade);
    
    // Calculate trend (compare recent vs older assignments)
    const recentGraded = gradedAssignments.slice(0, 3);
    const olderGraded = gradedAssignments.slice(3, 6);
    
    if (recentGraded.length > 0 && olderGraded.length > 0) {
      const recentAvg = recentGraded.reduce((sum, a) => sum + (a.submission?.score || 0), 0) / recentGraded.length;
      const olderAvg = olderGraded.reduce((sum, a) => sum + (a.submission?.score || 0), 0) / olderGraded.length;
      this.gradeChange = Math.round(recentAvg - olderAvg);
    }
  }

  private calculateTodayStats(assignments: AssignmentWithSubmission[]): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const dueToday = assignments.filter(a => {
      const dueDate = a.dueAt ? a.dueAt.toDate() : null;
      return dueDate && dueDate >= today && dueDate < tomorrow && a.submission?.status !== 'submitted' && a.submission?.status !== 'graded';
    });
    
    const completedToday = dueToday.filter(a => a.submission?.status === 'submitted' || a.submission?.status === 'graded');
    
    this.totalToday = dueToday.length;
    this.completedToday = completedToday.length;
  }

  private calculateWeekStats(assignments: AssignmentWithSubmission[]): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    
    const dueThisWeek = assignments.filter(a => {
      const dueDate = a.dueAt ? a.dueAt.toDate() : null;
      return dueDate && dueDate >= today && dueDate < weekEnd;
    });
    
    this.dueThisWeek = dueThisWeek.filter(a => a.submission?.status !== 'submitted' && a.submission?.status !== 'graded').length;
    this.completedThisWeek = dueThisWeek.filter(a => a.submission?.status === 'submitted' || a.submission?.status === 'graded').length;
    this.overdueThisWeek = assignments.filter(a => {
      const dueDate = a.dueAt ? a.dueAt.toDate() : null;
      return dueDate && dueDate < today && a.submission?.status !== 'submitted' && a.submission?.status !== 'graded';
    }).length;
  }

  private calculateUpcomingDeadlines(assignments: AssignmentWithSubmission[]): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const deadlines: { [key: string]: { count: number; date: Date } } = {};
    
    assignments.forEach(a => {
      if (a.dueAt && a.submission?.status !== 'submitted' && a.submission?.status !== 'graded') {
        const dueDate = a.dueAt.toDate();
        dueDate.setHours(0, 0, 0, 0);
        
        if (dueDate >= today) {
          const dayKey = dueDate.toISOString().split('T')[0];
          if (!deadlines[dayKey]) {
            deadlines[dayKey] = { count: 0, date: dueDate };
          }
          deadlines[dayKey].count++;
        }
      }
    });
    
    this.upcomingDeadlines = Object.entries(deadlines)
      .map(([key, value]) => {
        const daysDiff = Math.floor((value.date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        let dayLabel = '';
        let urgency: 'urgent' | 'warning' | 'normal' = 'normal';
        
        if (daysDiff === 0) {
          dayLabel = 'Today';
          urgency = 'urgent';
        } else if (daysDiff === 1) {
          dayLabel = 'Tomorrow';
          urgency = 'urgent';
        } else if (daysDiff <= 2) {
          dayLabel = value.date.toLocaleDateString('en-US', { weekday: 'short' });
          urgency = 'warning';
        } else if (daysDiff <= 7) {
          dayLabel = value.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          urgency = 'warning';
        } else {
          dayLabel = value.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          urgency = 'normal';
        }
        
        return { day: dayLabel, count: value.count, urgency };
      })
      .sort((a, b) => {
        const urgencyOrder = { urgent: 0, warning: 1, normal: 2 };
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      })
      .slice(0, 5);
  }

  private getLetterGrade(percentage: number): string {
    if (percentage >= 93) return 'A';
    if (percentage >= 90) return 'A-';
    if (percentage >= 87) return 'B+';
    if (percentage >= 83) return 'B';
    if (percentage >= 80) return 'B-';
    if (percentage >= 77) return 'C+';
    if (percentage >= 73) return 'C';
    if (percentage >= 70) return 'C-';
    if (percentage >= 67) return 'D+';
    if (percentage >= 63) return 'D';
    if (percentage >= 60) return 'D-';
    return 'F';
  }

  getStatusBadgeClass(assignment: AssignmentWithSubmission): string {
    if (assignment.submission?.status === 'graded') return 'badge-graded';
    if (assignment.submission?.status === 'submitted') return 'badge-submitted';
    
    const now = new Date();
    const dueDate = assignment.dueAt ? assignment.dueAt.toDate() : null;
    if (dueDate && dueDate < now) return 'badge-overdue';
    
    const daysDiff = dueDate ? Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 999;
    if (daysDiff <= 1) return 'badge-due-today';
    if (daysDiff <= 3) return 'badge-due-soon';
    
    return 'badge-upcoming';
  }

  getStatusText(assignment: AssignmentWithSubmission): string {
    if (assignment.submission?.status === 'graded') return 'Graded';
    if (assignment.submission?.status === 'submitted') return 'Submitted';
    
    const now = new Date();
    const dueDate = assignment.dueAt ? assignment.dueAt.toDate() : null;
    if (dueDate && dueDate < now) return 'Overdue';
    
    const daysDiff = dueDate ? Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 999;
    if (daysDiff === 0) return 'Due Today';
    if (daysDiff === 1) return 'Due Tomorrow';
    if (daysDiff <= 3) return 'Due Soon';
    
    return 'Upcoming';
  }

  getDueDate(assignment: AssignmentWithSubmission): Date | null {
    return assignment.dueAt ? assignment.dueAt.toDate() : null;
  }
}
