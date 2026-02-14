import { Injectable, inject } from '@angular/core';
import { Observable, from, combineLatest, firstValueFrom } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { AssignmentService } from './assignment.service';
import { SubmissionService } from './submission.service';
import { ClassService } from './class.service';
import { FirebaseAuthService } from './firebase-auth.service';
import { Assignment, Submission, Class } from '../models/classroom.models';

export interface StudentAnalytics {
  overallGrade: number;
  letterGrade: string;
  gradeChange: number;
  completionRate: number;
  onTimeRate: number;
  subjectPerformance: SubjectPerformance[];
  gradeTrends: GradeTrend[];
  recentGrades: RecentGrade[];
}

export interface SubjectPerformance {
  classId: string;
  className: string;
  averageGrade: number;
  letterGrade: string;
  assignmentsCompleted: number;
  totalAssignments: number;
  completionRate: number;
}

export interface GradeTrend {
  date: Date;
  grade: number;
}

export interface RecentGrade {
  assignmentId: string;
  assignmentTitle: string;
  className: string;
  grade: number;
  submittedDate: Date;
}

interface AssignmentWithSubmission extends Assignment {
  submission?: Submission | null;
  className?: string;
}

@Injectable({
  providedIn: 'root'
})
export class StudentProgressService {
  private assignmentService = inject(AssignmentService);
  private submissionService = inject(SubmissionService);
  private classService = inject(ClassService);
  private authService = inject(FirebaseAuthService);

  /**
   * Get comprehensive analytics for a student
   */
  getStudentAnalytics(studentId?: string): Observable<StudentAnalytics> {
    return this.assignmentService.listAssignmentsForStudent().pipe(
      switchMap(async (assignments) => {
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

        // Get class names - use firstValueFrom to get the first emission
        const classes = await firstValueFrom(this.classService.listMyClasses());
        const classMap = new Map(classes.map(c => [c.id, c.name]));
        
        assignmentsWithSubmissions.forEach(a => {
          if (a.classId) {
            a.className = classMap.get(a.classId) || 'Unknown Class';
          } else {
            a.className = 'Individual Assignment';
          }
        });

        // Calculate all analytics
        const overallGrade = this.calculateOverallGrade(assignmentsWithSubmissions);
        const letterGrade = this.getLetterGrade(overallGrade);
        const gradeChange = this.calculateGradeChange(assignmentsWithSubmissions);
        const completionRate = this.calculateCompletionRate(assignmentsWithSubmissions);
        const onTimeRate = this.calculateOnTimeRate(assignmentsWithSubmissions);
        const subjectPerformance = this.calculateSubjectPerformance(assignmentsWithSubmissions, classes);
        const gradeTrends = this.calculateGradeTrends(assignmentsWithSubmissions, 30);
        const recentGrades = this.getRecentGrades(assignmentsWithSubmissions, 10);

        return {
          overallGrade,
          letterGrade,
          gradeChange,
          completionRate,
          onTimeRate,
          subjectPerformance,
          gradeTrends,
          recentGrades
        };
      })
    );
  }

  /**
   * Get grade trends over a specified number of days
   */
  getGradeTrends(studentId: string, days: number = 30): Observable<GradeTrend[]> {
    return this.assignmentService.listAssignmentsForStudent().pipe(
      switchMap(async (assignments) => {
        const assignmentsWithSubmissions = await Promise.all(
          assignments.map(async (assignment) => {
            const submission = await this.submissionService.getSubmissionForStudent(assignment.id);
            return { ...assignment, submission } as AssignmentWithSubmission;
          })
        );
        
        return this.calculateGradeTrends(assignmentsWithSubmissions, days);
      })
    );
  }

  /**
   * Get subject performance breakdown
   */
  getSubjectPerformance(studentId?: string): Observable<SubjectPerformance[]> {
    return combineLatest([
      this.assignmentService.listAssignmentsForStudent(),
      this.classService.listMyClasses()
    ]).pipe(
      switchMap(async ([assignments, classes]) => {
        const assignmentsWithSubmissions = await Promise.all(
          assignments.map(async (assignment) => {
            const submission = await this.submissionService.getSubmissionForStudent(assignment.id);
            return { ...assignment, submission } as AssignmentWithSubmission;
          })
        );
        
        return this.calculateSubjectPerformance(assignmentsWithSubmissions, classes);
      })
    );
  }

  /**
   * Calculate overall completion rate
   */
  async calculateCompletionRateAsync(studentId?: string): Promise<number> {
    const assignments = await firstValueFrom(this.assignmentService.listAssignmentsForStudent());
    
    const assignmentsWithSubmissions = await Promise.all(
      assignments.map(async (assignment) => {
        const submission = await this.submissionService.getSubmissionForStudent(assignment.id);
        return { ...assignment, submission } as AssignmentWithSubmission;
      })
    );
    
    return this.calculateCompletionRate(assignmentsWithSubmissions);
  }

  /**
   * Private helper methods
   */

  private calculateOverallGrade(assignments: AssignmentWithSubmission[]): number {
    const gradedAssignments = assignments.filter(
      a => a.submission?.status === 'graded' && a.submission.score != null
    );
    
    if (gradedAssignments.length === 0) return 0;
    
    const totalScore = gradedAssignments.reduce((sum, a) => sum + (a.submission?.score || 0), 0);
    return Math.round(totalScore / gradedAssignments.length);
  }

  private calculateGradeChange(assignments: AssignmentWithSubmission[]): number {
    const gradedAssignments = assignments
      .filter(a => a.submission?.status === 'graded' && a.submission.score != null)
      .sort((a, b) => {
        const dateA = a.submission?.submittedAt ? a.submission.submittedAt.toDate() : a.createdAt.toDate();
        const dateB = b.submission?.submittedAt ? b.submission.submittedAt.toDate() : b.createdAt.toDate();
        return dateB.getTime() - dateA.getTime();
      });
    
    if (gradedAssignments.length < 4) return 0;
    
    const recentGrades = gradedAssignments.slice(0, 3);
    const olderGrades = gradedAssignments.slice(3, 6);
    
    const recentAvg = recentGrades.reduce((sum, a) => sum + (a.submission?.score || 0), 0) / recentGrades.length;
    const olderAvg = olderGrades.reduce((sum, a) => sum + (a.submission?.score || 0), 0) / olderGrades.length;
    
    return Math.round(recentAvg - olderAvg);
  }

  private calculateCompletionRate(assignments: AssignmentWithSubmission[]): number {
    if (assignments.length === 0) return 0;
    
    const completed = assignments.filter(
      a => a.submission?.status === 'submitted' || a.submission?.status === 'graded'
    ).length;
    
    return Math.round((completed / assignments.length) * 100);
  }

  private calculateOnTimeRate(assignments: AssignmentWithSubmission[]): number {
    const completed = assignments.filter(
      a => a.submission?.status === 'submitted' || a.submission?.status === 'graded'
    );
    
    if (completed.length === 0) return 0;
    
    const onTime = completed.filter(a => {
      if (!a.submission?.submittedAt || !a.dueAt) return false;
      return a.submission.submittedAt <= a.dueAt;
    }).length;
    
    return Math.round((onTime / completed.length) * 100);
  }

  private calculateSubjectPerformance(
    assignments: AssignmentWithSubmission[],
    classes: Class[]
  ): SubjectPerformance[] {
    const classMap = new Map<string, AssignmentWithSubmission[]>();
    
    assignments.forEach(a => {
      if (a.classId) {
        if (!classMap.has(a.classId)) {
          classMap.set(a.classId, []);
        }
        classMap.get(a.classId)!.push(a);
      }
    });
    
    return Array.from(classMap.entries()).map(([classId, classAssignments]) => {
      const className = classes.find(c => c.id === classId)?.name || 'Unknown Class';
      const gradedAssignments = classAssignments.filter(
        a => a.submission?.status === 'graded' && a.submission.score != null
      );
      
      const averageGrade = gradedAssignments.length > 0
        ? Math.round(gradedAssignments.reduce((sum, a) => sum + (a.submission?.score || 0), 0) / gradedAssignments.length)
        : 0;
      
      const completedAssignments = classAssignments.filter(
        a => a.submission?.status === 'submitted' || a.submission?.status === 'graded'
      ).length;
      
      const completionRate = classAssignments.length > 0
        ? Math.round((completedAssignments / classAssignments.length) * 100)
        : 0;
      
      return {
        classId,
        className,
        averageGrade,
        letterGrade: this.getLetterGrade(averageGrade),
        assignmentsCompleted: completedAssignments,
        totalAssignments: classAssignments.length,
        completionRate
      };
    }).sort((a, b) => b.averageGrade - a.averageGrade);
  }

  private calculateGradeTrends(assignments: AssignmentWithSubmission[], days: number): GradeTrend[] {
    const gradedAssignments = assignments
      .filter(a => a.submission?.status === 'graded' && a.submission.score != null && a.submission.submittedAt)
      .sort((a, b) => {
        const dateA = a.submission!.submittedAt.toDate();
        const dateB = b.submission!.submittedAt.toDate();
        return dateA.getTime() - dateB.getTime();
      });
    
    if (gradedAssignments.length === 0) return [];
    
    const trends: GradeTrend[] = [];
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);
    
    // Group assignments by day
    const dailyGrades = new Map<string, number[]>();
    
    gradedAssignments.forEach(a => {
      const date = a.submission?.submittedAt ? a.submission.submittedAt.toDate() : null;
      if (!date || date < startDate) return;
      
      const dateKey = date.toISOString().split('T')[0];
      if (!dailyGrades.has(dateKey)) {
        dailyGrades.set(dateKey, []);
      }
      dailyGrades.get(dateKey)!.push(a.submission?.score || 0);
    });
    
    // Calculate running average for each day
    const sortedDates = Array.from(dailyGrades.keys()).sort();
    let runningGrades: number[] = [];
    
    sortedDates.forEach(dateKey => {
      const grades = dailyGrades.get(dateKey)!;
      runningGrades = [...runningGrades, ...grades];
      
      const average = runningGrades.reduce((sum, g) => sum + g, 0) / runningGrades.length;
      
      trends.push({
        date: new Date(dateKey),
        grade: Math.round(average)
      });
    });
    
    return trends;
  }

  private getRecentGrades(assignments: AssignmentWithSubmission[], limit: number): RecentGrade[] {
    return assignments
      .filter(a => a.submission?.status === 'graded' && a.submission.score != null)
      .sort((a, b) => {
        const dateA = a.submission?.submittedAt ? a.submission.submittedAt.toDate() : a.createdAt.toDate();
        const dateB = b.submission?.submittedAt ? b.submission.submittedAt.toDate() : b.createdAt.toDate();
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, limit)
      .map(a => ({
        assignmentId: a.id,
        assignmentTitle: a.title,
        className: a.className || 'Unknown Class',
        grade: a.submission?.score || 0,
        submittedDate: a.submission?.submittedAt ? a.submission.submittedAt.toDate() : new Date()
      }));
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
}
