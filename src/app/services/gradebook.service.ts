import { Injectable, inject } from '@angular/core';
import { Firestore, collection, query, where, getDocs, doc, getDoc } from '@angular/fire/firestore';
import { Observable, BehaviorSubject, of, from } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import {
  GradeBookEntry,
  GradeBookStats,
  StudentPerformance,
  TrendData,
  PerformanceBadge,
  StudentSummary,
  Grade,
} from '../models/gradebook.models';
import { Submission } from '../models/classroom.models';
import { ClassService } from './class.service';
import { AssignmentService } from './assignment.service';
import { SubmissionService } from './submission.service';

@Injectable({
  providedIn: 'root',
})
export class GradeBookService {
  private firestore = inject(Firestore);
  private classService = inject(ClassService);
  private assignmentService = inject(AssignmentService);
  private submissionService = inject(SubmissionService);

  // Cache
  private cacheTimestamp: number | null = null;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private gradeBookCache$ = new BehaviorSubject<GradeBookEntry[] | null>(null);

  constructor() {
    console.log('[GradeBookService] Initialized');
  }

  /**
   * Get grade book data for a teacher
   */
  getGradeBookData(teacherId: string): Observable<GradeBookEntry[]> {
    console.log('[GradeBookService] getGradeBookData called for teacher:', teacherId);

    // Check cache
    if (this.isCacheValid() && this.gradeBookCache$.value) {
      console.log('[GradeBookService] Returning cached data');
      return this.gradeBookCache$.asObservable() as Observable<GradeBookEntry[]>;
    }

    // Fetch fresh data
    return from(this.fetchGradeBookData(teacherId)).pipe(
      tap(entries => {
        console.log('[GradeBookService] Fetched', entries.length, 'grade book entries');
        this.gradeBookCache$.next(entries);
        this.cacheTimestamp = Date.now();
      }),
      catchError(error => {
        console.error('[GradeBookService] Error fetching grade book data:', error);
        return of([]);
      })
    );
  }

  /**
   * Fetch grade book data from Firestore
   */
  private async fetchGradeBookData(teacherId: string): Promise<GradeBookEntry[]> {
    console.log('[GradeBookService] fetchGradeBookData starting...');

    // Step 1: Get all students (from classes + 1-on-1)
    const students = await this.getAllStudentsForTeacher(teacherId);
    console.log('[GradeBookService] Found', students.length, 'students');

    // Step 2: Get all assignments for this teacher
    const assignments = await this.assignmentService
      .listAssignmentsForTeacher(teacherId)
      .toPromise();
    console.log('[GradeBookService] Found', assignments?.length || 0, 'assignments');

    if (!assignments || assignments.length === 0) {
      console.log('[GradeBookService] No assignments found, returning empty grade book');
      return students.map(student => this.createEmptyGradeBookEntry(student));
    }

    // Step 3: For each student, fetch their submissions
    const gradeBookEntries: GradeBookEntry[] = [];

    for (const student of students) {
      const entry = await this.buildGradeBookEntry(student, assignments, teacherId);
      gradeBookEntries.push(entry);
    }

    console.log('[GradeBookService] Built', gradeBookEntries.length, 'grade book entries');
    return gradeBookEntries;
  }

  /**
   * Get all students for a teacher (from classes + 1-on-1)
   */
  private async getAllStudentsForTeacher(teacherId: string): Promise<StudentSummary[]> {
    const students: StudentSummary[] = [];
    const studentIds = new Set<string>();

    // Get students from classes - Query directly instead of using the reactive stream
    try {
      const classesRef = collection(this.firestore, 'classes');
      const classQuery = query(
        classesRef,
        where('ownerId', '==', teacherId)
      );

      const classSnapshot = await getDocs(classQuery);
      console.log('[GradeBookService] Found', classSnapshot.docs.length, 'classes');
      
      for (const classDoc of classSnapshot.docs) {
        const classData = classDoc.data();
        
        // Skip deleted classes
        if (classData['deleted']) {
          continue;
        }

        const memberIds = classData['memberIds'] || [];
        
        for (const memberId of memberIds) {
          // Skip the teacher themselves
          if (memberId === teacherId) {
            continue;
          }
          
          if (!studentIds.has(memberId)) {
            studentIds.add(memberId);
            const studentInfo = await this.getUserInfo(memberId);
            if (studentInfo) {
              students.push(studentInfo);
            }
          }
        }
      }

      console.log('[GradeBookService] Found', students.length, 'students from classes');
    } catch (error: any) {
      console.error('[GradeBookService] Error fetching classes:', error);
      if (error.message?.includes('index')) {
        console.error('👆 CREATE THIS INDEX BY CLICKING THE LINK ABOVE 👆');
      }
    }

    // Get 1-on-1 students (from individual assignments)
    try {
      const assignmentsRef = collection(this.firestore, 'assignments');
      const individualQuery = query(
        assignmentsRef,
        where('teacherId', '==', teacherId),
        where('mode', '==', 'individual')
      );

      const individualSnapshot = await getDocs(individualQuery);
      console.log('[GradeBookService] Found', individualSnapshot.docs.length, 'individual assignments');
      
      for (const assignmentDoc of individualSnapshot.docs) {
        const assignment = assignmentDoc.data();
        const studentId = assignment['studentId'];
        
        if (studentId && !studentIds.has(studentId)) {
          studentIds.add(studentId);
          const studentInfo = await this.getUserInfo(studentId);
          if (studentInfo) {
            students.push(studentInfo);
          }
        }
      }
    } catch (error: any) {
      console.error('[GradeBookService] Error fetching individual assignments:', error);
      if (error.message?.includes('index')) {
        console.error('👆 CREATE THIS INDEX BY CLICKING THE LINK ABOVE 👆');
      }
    }

    console.log('[GradeBookService] Total students found:', students.length);
    return students;
  }

  /**
   * Get user information from Firestore (with placeholder fallback)
   */
  private async getUserInfo(userId: string): Promise<StudentSummary | null> {
    try {
      // Skip temporary/invalid user IDs
      if (userId.startsWith('temp_')) {
        return null;
      }
      
      const userRef = doc(this.firestore, 'users', userId);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const userData = userSnap.data();
        return {
          studentId: userId,
          studentName: userData['displayName'] || userData['name'] || 'Unknown Student',
          studentEmail: userData['email'] || '',
          studentPhotoURL: userData['photoURL'] || undefined,
          average: 0,
          trend: 'stable',
          needsAttention: false,
        };
      } else {
        // Firestore document doesn't exist - create placeholder entry
        return {
          studentId: userId,
          studentName: `Student (ID: ${userId.substring(0, 8)}...)`,
          studentEmail: 'Profile incomplete',
          studentPhotoURL: undefined,
          average: 0,
          trend: 'stable',
          needsAttention: true, // Mark as needing attention since profile is incomplete
        };
      }
    } catch (error) {
      console.error('[GradeBookService] Error fetching user info for', userId, error);
      return null;
    }
  }

  /**
   * Build a grade book entry for a student
   */
  private async buildGradeBookEntry(
    student: StudentSummary,
    assignments: any[],
    teacherId: string
  ): Promise<GradeBookEntry> {
    const entry: GradeBookEntry = {
      studentId: student.studentId,
      studentName: student.studentName,
      studentEmail: student.studentEmail,
      studentPhotoURL: student.studentPhotoURL,
      assignments: {},
      average: 0,
      averageTajweed: 0,
      averageFluency: 0,
      averageAccuracy: 0,
      totalAssignments: 0,
      completedAssignments: 0,
      completionRate: 0,
      trend: 'stable',
      needsAttention: false,
      performanceBadges: [],
    };

    const scores: number[] = [];
    const tajweedScores: number[] = [];
    const fluencyScores: number[] = [];
    const accuracyScores: number[] = [];

    // For each assignment, check if student has a submission
    for (const assignment of assignments) {
      // Check if this assignment is relevant to this student
      const isRelevant = await this.isAssignmentRelevantToStudent(
        assignment,
        student.studentId,
        teacherId
      );

      if (!isRelevant) {
        continue;
      }

      entry.totalAssignments++;

      // Fetch submission for this assignment
      const submissions = await this.submissionService
        .listSubmissionsForAssignment(assignment.id)
        .toPromise();

      const submission = submissions?.find(s => s.studentId === student.studentId);

      if (submission) {
        const status = submission.status || 'not_started';
        const score = submission.score || null;

        entry.assignments[assignment.id] = {
          score,
          status: status as any,
          submittedAt: submission.submittedAt || null,
          gradedAt: submission.gradedAt || null,
          rubric: submission.rubric
            ? {
                tajweed: submission.rubric.tajweed || 0,
                fluency: submission.rubric.fluency || 0,
                accuracy: submission.rubric.accuracy || 0,
              }
            : undefined,
        };

        if (status === 'graded' && score !== null) {
          entry.completedAssignments++;
          scores.push(score);

          if (submission.rubric) {
            tajweedScores.push(submission.rubric.tajweed || 0);
            fluencyScores.push(submission.rubric.fluency || 0);
            accuracyScores.push(submission.rubric.accuracy || 0);
          }
        }
      } else {
        // No submission found
        entry.assignments[assignment.id] = {
          score: null,
          status: 'not_started',
          submittedAt: null,
          gradedAt: null,
        };
      }
    }

    // Calculate averages
    entry.average = scores.length > 0 ? this.calculateAverage(scores) : 0;
    entry.averageTajweed = tajweedScores.length > 0 ? this.calculateAverage(tajweedScores) : 0;
    entry.averageFluency = fluencyScores.length > 0 ? this.calculateAverage(fluencyScores) : 0;
    entry.averageAccuracy = accuracyScores.length > 0 ? this.calculateAverage(accuracyScores) : 0;
    entry.completionRate =
      entry.totalAssignments > 0 ? (entry.completedAssignments / entry.totalAssignments) * 100 : 0;

    // Calculate trend
    entry.trend = this.calculateTrend(scores).direction;

    // Determine if needs attention
    entry.needsAttention =
      entry.average < 70 || entry.trend === 'declining' || entry.completionRate < 50;

    // Assign performance badges
    entry.performanceBadges = this.assignPerformanceBadges(entry, scores);

    return entry;
  }

  /**
   * Check if an assignment is relevant to a student
   */
  private async isAssignmentRelevantToStudent(
    assignment: any,
    studentId: string,
    teacherId: string
  ): Promise<boolean> {
    // Individual assignment: check if it's for this student
    if (assignment.mode === 'individual') {
      return assignment.studentId === studentId && assignment.teacherId === teacherId;
    }

    // Classroom assignment: check if student is in the class
    if (assignment.mode === 'classroom' && assignment.classId) {
      const classRef = doc(this.firestore, 'classes', assignment.classId);
      const classSnap = await getDoc(classRef);

      if (classSnap.exists()) {
        const classData = classSnap.data();
        const memberIds = classData['memberIds'] || [];
        return memberIds.includes(studentId);
      }
    }

    return false;
  }

  /**
   * Create an empty grade book entry for a student with no assignments
   */
  private createEmptyGradeBookEntry(student: StudentSummary): GradeBookEntry {
    return {
      studentId: student.studentId,
      studentName: student.studentName,
      studentEmail: student.studentEmail,
      studentPhotoURL: student.studentPhotoURL,
      assignments: {},
      average: 0,
      averageTajweed: 0,
      averageFluency: 0,
      averageAccuracy: 0,
      totalAssignments: 0,
      completedAssignments: 0,
      completionRate: 0,
      trend: 'stable',
      needsAttention: false,
      performanceBadges: [],
    };
  }

  /**
   * Get grade book statistics
   */
  getGradeBookStats(teacherId: string): Observable<GradeBookStats> {
    return this.getGradeBookData(teacherId).pipe(
      map(entries => {
        const totalStudents = entries.length;
        const needsAttention = entries.filter(e => e.needsAttention).length;
        const topPerformers = entries.filter(e => e.average >= 90).length;
        
        // Count pending grading across all students
        let pendingGrading = 0;
        for (const entry of entries) {
          for (const assignmentId in entry.assignments) {
            if (entry.assignments[assignmentId].status === 'submitted') {
              pendingGrading++;
            }
          }
        }

        const averageClassScore =
          totalStudents > 0
            ? entries.reduce((sum, e) => sum + e.average, 0) / totalStudents
            : 0;

        return {
          totalStudents,
          needsAttention,
          topPerformers,
          pendingGrading,
          averageClassScore,
        };
      })
    );
  }

  /**
   * Calculate average of an array of numbers
   */
  private calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    const sum = numbers.reduce((acc, val) => acc + val, 0);
    return sum / numbers.length;
  }

  /**
   * Calculate trend from scores
   */
  calculateTrend(scores: number[]): TrendData {
    if (scores.length < 3) {
      return {
        direction: 'stable',
        confidence: 'low',
        slope: 0,
        percentageChange: 0,
      };
    }

    // Take last 5 scores
    const recentScores = scores.slice(-5);
    const slope = this.calculateSlope(recentScores);

    let direction: 'improving' | 'stable' | 'declining';
    if (slope > 2) direction = 'improving';
    else if (slope < -2) direction = 'declining';
    else direction = 'stable';

    // Calculate percentage change (last 5 vs previous 5)
    const previousScores = scores.slice(-10, -5);
    const percentageChange = this.calculatePercentageChange(previousScores, recentScores);

    return {
      direction,
      confidence: 'medium',
      slope,
      percentageChange,
    };
  }

  /**
   * Calculate slope using simple linear regression
   */
  private calculateSlope(data: number[]): number {
    const n = data.length;
    if (n < 2) return 0;

    const xMean = (n - 1) / 2;
    const yMean = data.reduce((sum, val) => sum + val, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (data[i] - yMean);
      denominator += (i - xMean) ** 2;
    }

    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Calculate percentage change between two arrays
   */
  private calculatePercentageChange(oldData: number[], newData: number[]): number {
    if (oldData.length === 0 || newData.length === 0) return 0;

    const oldAvg = this.calculateAverage(oldData);
    const newAvg = this.calculateAverage(newData);

    if (oldAvg === 0) return 0;

    return ((newAvg - oldAvg) / oldAvg) * 100;
  }

  /**
   * Assign performance badges based on student data
   */
  private assignPerformanceBadges(entry: GradeBookEntry, scores: number[]): PerformanceBadge[] {
    const badges: PerformanceBadge[] = [];

    // On Fire: 3+ assignments in a row > 85
    if (scores.length >= 3) {
      const lastThree = scores.slice(-3);
      if (lastThree.every(score => score > 85)) {
        badges.push({
          icon: '🔥',
          label: 'On Fire!',
          color: '#FF6B35',
          description: '3+ assignments in a row scoring above 85',
        });
      }
    }

    // Needs Help: Average < 70 or declining trend
    if (entry.average < 70 || entry.trend === 'declining') {
      badges.push({
        icon: '⚠️',
        label: 'Needs Help',
        color: '#F59E0B',
        description: 'Average below 70 or declining performance',
      });
    }

    // Consistent: All grades within 10 points
    if (scores.length >= 3) {
      const max = Math.max(...scores);
      const min = Math.min(...scores);
      if (max - min <= 10) {
        badges.push({
          icon: '🎯',
          label: 'Consistent',
          color: '#8B5CF6',
          description: 'All grades within 10 points',
        });
      }
    }

    // Improving: Last 3 assignments trending up
    if (scores.length >= 3) {
      const lastThree = scores.slice(-3);
      const isImproving = lastThree[2] > lastThree[1] && lastThree[1] > lastThree[0];
      if (isImproving) {
        badges.push({
          icon: '📈',
          label: 'Improving',
          color: '#10B981',
          description: 'Last 3 assignments show upward trend',
        });
      }
    }

    return badges;
  }

  /**
   * Get students needing attention
   */
  getStudentsNeedingAttention(teacherId: string): Observable<StudentSummary[]> {
    return this.getGradeBookData(teacherId).pipe(
      map(entries =>
        entries
          .filter(e => e.needsAttention)
          .map(e => ({
            studentId: e.studentId,
            studentName: e.studentName,
            studentEmail: e.studentEmail,
            studentPhotoURL: e.studentPhotoURL,
            average: e.average,
            trend: e.trend,
            needsAttention: e.needsAttention,
          }))
      )
    );
  }

  /**
   * Get top performers
   */
  getTopPerformers(teacherId: string, limit: number = 5): Observable<StudentSummary[]> {
    return this.getGradeBookData(teacherId).pipe(
      map(entries =>
        entries
          .filter(e => e.average >= 85)
          .sort((a, b) => b.average - a.average)
          .slice(0, limit)
          .map(e => ({
            studentId: e.studentId,
            studentName: e.studentName,
            studentEmail: e.studentEmail,
            studentPhotoURL: e.studentPhotoURL,
            average: e.average,
            trend: e.trend,
            needsAttention: e.needsAttention,
          }))
      )
    );
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    console.log('[GradeBookService] Clearing cache');
    this.gradeBookCache$.next(null);
    this.cacheTimestamp = null;
  }

  /**
   * Check if cache is valid
   */
  private isCacheValid(): boolean {
    if (!this.cacheTimestamp) return false;
    return Date.now() - this.cacheTimestamp < this.CACHE_DURATION;
  }
}
