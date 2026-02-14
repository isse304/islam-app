import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, combineLatest, of } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { Firestore, collection, query, where, orderBy, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, Timestamp, CollectionReference, DocumentReference, DocumentData } from '@angular/fire/firestore';
import { Assignment, Submission, AssignmentCategory, AssignmentFilters, AssignmentStats } from '../models/assignment.model';
import { Assignment as ClassroomAssignment } from '../models/classroom.models';
import { FirebaseAuthService } from './firebase-auth.service';

@Injectable({
  providedIn: 'root'
})
export class AssignmentService {
  private assignmentsCache$ = new BehaviorSubject<Assignment[]>([]);
  private submissionsCache$ = new BehaviorSubject<Map<string, Submission>>(new Map());
  private loading$ = new BehaviorSubject<boolean>(false);

  constructor(
    private firestore: Firestore,
    private authService: FirebaseAuthService
  ) {}

  /**
   * Get all assignments for the current student
   */
  getStudentAssignments(): Observable<Assignment[]> {
    return this.authService.user$.pipe(
      switchMap(user => {
        if (!user?.uid) {
          return of([]);
        }
        return this.fetchAssignmentsForStudent(user.uid);
      })
    );
  }

  /**
   * Get assignments by category
   */
  getAssignmentsByCategory(category: AssignmentCategory): Observable<Assignment[]> {
    return this.assignmentsCache$.pipe(
      map(assignments => this.filterByCategory(assignments, category))
    );
  }

  /**
   * Get a single assignment by ID
   */
  getAssignmentById(assignmentId: string): Observable<Assignment | null> {
    return this.assignmentsCache$.pipe(
      map(assignments => assignments.find(a => a.id === assignmentId) || null)
    );
  }

  /**
   * Get assignment statistics
   */
  getAssignmentStats(): Observable<AssignmentStats> {
    return this.assignmentsCache$.pipe(
      map(assignments => this.calculateStats(assignments))
    );
  }

  /**
   * Filter assignments
   */
  filterAssignments(filters: AssignmentFilters): Observable<Assignment[]> {
    return this.assignmentsCache$.pipe(
      map(assignments => this.applyFilters(assignments, filters))
    );
  }

  /**
   * Submit an assignment
   */
  async submitAssignment(assignmentId: string, submission: Partial<Submission>): Promise<void> {
    const user = this.authService.getCurrentUser();
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    const submissionsRef = collection(this.firestore, 'submissions');
    const submissionData = {
      assignmentId,
      studentId: user.uid,
      ...submission,
      status: 'submitted',
      submittedAt: Timestamp.now(),
      lastModifiedAt: Timestamp.now()
    };

    await addDoc(submissionsRef, submissionData);
    
    // Refresh assignments to update status
    await this.refreshAssignments();
  }

  /**
   * Save assignment draft
   */
  async saveDraft(assignmentId: string, submission: Partial<Submission>): Promise<void> {
    const user = this.authService.getCurrentUser();
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    const submissionsRef = collection(this.firestore, 'submissions');
    const submissionData = {
      assignmentId,
      studentId: user.uid,
      ...submission,
      status: 'draft',
      lastModifiedAt: Timestamp.now()
    };

    await addDoc(submissionsRef, submissionData);
    await this.refreshAssignments();
  }

  /**
   * Update submission progress
   */
  async updateProgress(submissionId: string, progress: number): Promise<void> {
    const submissionRef = doc(this.firestore, 'submissions', submissionId);
    await updateDoc(submissionRef, {
      progress,
      lastModifiedAt: Timestamp.now()
    });
  }

  /**
   * Get urgency level for an assignment
   */
  getUrgencyLevel(assignment: Assignment): 'urgent' | 'upcoming' | 'later' {
    const now = new Date();
    const dueDate = new Date(assignment.dueDate);
    const hoursUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilDue < 0) {
      return 'urgent'; // Overdue
    } else if (hoursUntilDue <= 24) {
      return 'urgent'; // Due today
    } else if (hoursUntilDue <= 168) { // 7 days
      return 'upcoming';
    } else {
      return 'later';
    }
  }

  /**
   * Get human-readable time until due
   */
  getTimeUntilDue(dueDate: Date): string {
    const now = new Date();
    const due = new Date(dueDate);
    const diff = due.getTime() - now.getTime();

    if (diff < 0) {
      const overdueDays = Math.floor(Math.abs(diff) / (1000 * 60 * 60 * 24));
      if (overdueDays === 0) {
        const overdueHours = Math.floor(Math.abs(diff) / (1000 * 60 * 60));
        return `Overdue by ${overdueHours}h`;
      }
      return `Overdue by ${overdueDays}d`;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 7) {
      return `Due ${due.toLocaleDateString()}`;
    } else if (days > 1) {
      return `Due in ${days}d`;
    } else if (days === 1) {
      return 'Due tomorrow';
    } else if (hours > 1) {
      return `Due in ${hours}h`;
    } else if (hours === 1) {
      return 'Due in 1 hour';
    } else {
      return `Due in ${minutes}m`;
    }
  }

  /**
   * Refresh assignments from Firestore
   */
  private async refreshAssignments(): Promise<void> {
    const user = this.authService.getCurrentUser();
    if (!user?.uid) return;

    this.loading$.next(true);
    try {
      const assignments = await this.fetchAssignmentsForStudent(user.uid).toPromise();
      if (assignments) {
        this.assignmentsCache$.next(assignments);
      }
    } finally {
      this.loading$.next(false);
    }
  }

  /**
   * Fetch assignments from Firestore
   */
  private fetchAssignmentsForStudent(studentId: string): Observable<Assignment[]> {
    return new Observable<Assignment[]>(observer => {
      // First, get the user document to find enrolled classes
      const userDoc = doc(this.firestore, 'users', studentId);
      
      getDoc(userDoc)
        .then(async userSnapshot => {
          if (!userSnapshot.exists()) {
            observer.next([]);
            observer.complete();
            return;
          }

          const userData = userSnapshot.data();
          const enrolledClasses = userData['enrolledClasses'] || userData['classes'] || [];

          if (enrolledClasses.length === 0) {
            observer.next([]);
            observer.complete();
            return;
          }

          // Query assignments for enrolled classes
          const assignmentsRef = collection(this.firestore, 'assignments');
          const q = query(
            assignmentsRef,
            where('classId', 'in', enrolledClasses.slice(0, 10)), // Firestore 'in' query limit is 10
            orderBy('dueDate', 'asc')
          );

          const snapshot = await getDocs(q);

          const assignments: Assignment[] = [];
          
          for (const docSnapshot of snapshot.docs) {
            const data = docSnapshot.data();
            
            // Check if student has a submission for this assignment
            const submission = await this.getSubmissionForAssignment(docSnapshot.id, studentId);
            
            assignments.push({
              id: docSnapshot.id,
              title: data['title'] || 'Untitled Assignment',
              description: data['description'] || '',
              instructions: data['instructions'] || '',
              classId: data['classId'] || '',
              className: data['className'] || 'Unknown Class',
              classColor: data['classColor'] || '#1E40AF',
              teacherId: data['teacherId'] || '',
              teacherName: data['teacherName'] || '',
              assignedDate: data['assignedDate']?.toDate() || new Date(),
              dueDate: data['dueDate']?.toDate() || new Date(),
              submittedDate: submission?.submittedAt,
              submissionId: submission?.id,
              status: this.determineStatus(data['dueDate']?.toDate(), submission),
              earnedPoints: submission?.earnedPoints,
              grade: submission?.grade,
              teacherFeedback: submission?.feedback,
              gradedDate: submission?.gradedAt,
              progress: submission?.progress,
              totalPoints: data['totalPoints'] || 100,
              type: data['type'] || 'other',
              allowLateSubmission: data['allowLateSubmission'] || false,
              allowResubmission: data['allowResubmission'] || false,
              attachments: data['attachments'] || [],
              estimatedTime: data['estimatedTime'],
              createdAt: data['createdAt']?.toDate() || new Date(),
              updatedAt: data['updatedAt']?.toDate() || new Date()
            });
          }
          
          observer.next(assignments);
          observer.complete();
        })
        .catch(error => {
          observer.error(error);
        });
    });
  }

  /**
   * Get submission for a specific assignment
   */
  private async getSubmissionForAssignment(assignmentId: string, studentId: string): Promise<Submission | null> {
    const submissionsRef = collection(this.firestore, 'submissions');
    const q = query(
      submissionsRef,
      where('assignmentId', '==', assignmentId),
      where('studentId', '==', studentId)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    
    return {
      id: doc.id,
      ...data,
      submittedAt: data['submittedAt']?.toDate(),
      lastModifiedAt: data['lastModifiedAt']?.toDate() || new Date(),
      gradedAt: data['gradedAt']?.toDate()
    } as Submission;
  }

  /**
   * Determine assignment status
   */
  private determineStatus(dueDate: Date, submission: Submission | null): Assignment['status'] {
    if (submission) {
      if (submission.status === 'graded') {
        return 'graded';
      } else if (submission.status === 'submitted' || submission.status === 'pending_review') {
        return 'submitted';
      } else if (submission.status === 'draft') {
        return 'in_progress';
      }
    }

    const now = new Date();
    if (now > dueDate) {
      return 'overdue';
    }

    return 'not_started';
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
          return due.toDateString() === now.toDateString() && a.status !== 'submitted' && a.status !== 'graded';
        });

      case 'upcoming':
        return assignments.filter(a => {
          const due = new Date(a.dueDate);
          const daysUntilDue = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          return daysUntilDue > 0 && daysUntilDue <= 7 && a.status !== 'submitted' && a.status !== 'graded';
        });

      case 'due_later':
        return assignments.filter(a => {
          const due = new Date(a.dueDate);
          const daysUntilDue = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          return daysUntilDue > 7 && a.status !== 'submitted' && a.status !== 'graded';
        });

      case 'completed':
        return assignments.filter(a => a.status === 'submitted' || a.status === 'graded');

      case 'overdue':
        return assignments.filter(a => a.status === 'overdue');

      case 'draft':
        return assignments.filter(a => a.status === 'in_progress');

      default:
        return assignments;
    }
  }

  /**
   * Apply filters to assignments
   */
  private applyFilters(assignments: Assignment[], filters: AssignmentFilters): Assignment[] {
    let filtered = [...assignments];

    if (filters.category) {
      filtered = this.filterByCategory(filtered, filters.category);
    }

    if (filters.classId) {
      filtered = filtered.filter(a => a.classId === filters.classId);
    }

    if (filters.type) {
      filtered = filtered.filter(a => a.type === filters.type);
    }

    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(a => 
        a.title.toLowerCase().includes(term) ||
        a.description.toLowerCase().includes(term) ||
        a.className.toLowerCase().includes(term)
      );
    }

    if (filters.dateRange) {
      filtered = filtered.filter(a => {
        const due = new Date(a.dueDate);
        return due >= filters.dateRange!.start && due <= filters.dateRange!.end;
      });
    }

    return filtered;
  }

  /**
   * Calculate assignment statistics
   */
  private calculateStats(assignments: Assignment[]): AssignmentStats {
    const stats: AssignmentStats = {
      total: assignments.length,
      dueToday: this.filterByCategory(assignments, 'due_today').length,
      upcoming: this.filterByCategory(assignments, 'upcoming').length,
      overdue: this.filterByCategory(assignments, 'overdue').length,
      completed: this.filterByCategory(assignments, 'completed').length,
      draft: this.filterByCategory(assignments, 'draft').length,
      completionRate: 0,
      onTimeRate: 0,
      averageGrade: 0
    };

    if (stats.total > 0) {
      stats.completionRate = (stats.completed / stats.total) * 100;
      
      const onTimeSubmissions = assignments.filter(a => {
        return a.status === 'submitted' || a.status === 'graded' && a.submittedDate && a.submittedDate <= a.dueDate;
      }).length;
      stats.onTimeRate = (onTimeSubmissions / stats.total) * 100;

      const gradedAssignments = assignments.filter(a => a.earnedPoints !== undefined && a.totalPoints > 0);
      if (gradedAssignments.length > 0) {
        const totalPercentage = gradedAssignments.reduce((sum, a) => {
          return sum + ((a.earnedPoints! / a.totalPoints) * 100);
        }, 0);
        stats.averageGrade = totalPercentage / gradedAssignments.length;
      }
    }

    return stats;
  }

  // ==========================================
  // Teacher Dashboard Methods (Stubs)
  // TODO: Implement these properly
  // ==========================================

  /**
   * Create a new assignment (for teacher dashboard)
   */
  async createAssignment(assignment: any): Promise<string> {
    const assignmentsRef = collection(this.firestore, 'assignments');
    
    // Filter out undefined values to avoid Firestore errors
    const cleanAssignment: any = {
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    // Only add defined fields
    Object.keys(assignment).forEach(key => {
      if (assignment[key] !== undefined) {
        cleanAssignment[key] = assignment[key];
      }
    });
    
    const docRef = await addDoc(assignmentsRef, cleanAssignment);
    return docRef.id;
  }

  /**
   * Update an existing assignment (for teacher dashboard)
   */
  async updateAssignment(assignmentId: string, updates: any): Promise<void> {
    const assignmentRef = doc(this.firestore, 'assignments', assignmentId);
    
    // Filter out undefined values to avoid Firestore errors
    const cleanUpdates: any = {
      updatedAt: Timestamp.now()
    };
    
    // Only add defined fields
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        cleanUpdates[key] = updates[key];
      }
    });
    
    await updateDoc(assignmentRef, cleanUpdates);
  }

  /**
   * Delete an assignment (for teacher dashboard)
   */
  async deleteAssignment(assignmentId: string): Promise<void> {
    const assignmentRef = doc(this.firestore, 'assignments', assignmentId);
    await deleteDoc(assignmentRef);
  }

  /**
   * List assignments for a class (for teacher dashboard)
   */
  listAssignmentsForClass(classId: string): Observable<ClassroomAssignment[]> {
    const assignmentsRef = collection(this.firestore, 'assignments');
    // Query with mode filter to match how student dashboard queries
    const q = query(
      assignmentsRef,
      where('mode', '==', 'classroom'),
      where('classId', '==', classId)
    );
    
    return new Observable(observer => {
      getDocs(q).then(snapshot => {
        const assignments = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as ClassroomAssignment));
        
        observer.next(assignments);
        observer.complete();
      }).catch(error => {
        // Return empty array on error instead of erroring out
        observer.next([]);
        observer.complete();
      });
    });
  }

  /**
   * List assignments for an individual student (for teacher dashboard)
   * This returns ALL assignments for a student: both classroom assignments (from classes they're in)
   * and individual (1-on-1) assignments assigned directly to them
   */
  listAssignmentsForIndividualStudent(studentId: string): Observable<ClassroomAssignment[]> {
    return new Observable(observer => {
      (async () => {
        try {
          // Step 1: Find all classes where the student is a member
          const classesRef = collection(this.firestore, 'classes');
          const classQuery = query(
            classesRef,
            where('memberIds', 'array-contains', studentId)
          );
          
          const classSnapshot = await getDocs(classQuery);
          const enrolledClassIds = classSnapshot.docs.map(doc => doc.id);
          
          console.log(`[AssignmentService] Student ${studentId} enrolled in classes:`, enrolledClassIds);

          // Step 2: Query assignments
          const assignmentsRef = collection(this.firestore, 'assignments');
          let classroomAssignments: ClassroomAssignment[] = [];
          
          // Only query classroom assignments if student is in any classes
          if (enrolledClassIds.length > 0) {
            // Query without orderBy to avoid index requirement
            const classroomQuery = query(
              assignmentsRef,
              where('mode', '==', 'classroom'),
              where('classId', 'in', enrolledClassIds.slice(0, 10)) // Firestore limit
            );
            
            const classroomSnapshot = await getDocs(classroomQuery);
            classroomAssignments = classroomSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            } as ClassroomAssignment));
            console.log(`[AssignmentService] Found ${classroomAssignments.length} classroom assignments`);
          }

          // Step 3: Query individual assignments (without orderBy to avoid index requirement)
          const individualQuery = query(
            assignmentsRef,
            where('mode', '==', 'individual'),
            where('studentId', '==', studentId)
          );
          
          const individualSnapshot = await getDocs(individualQuery);
          const individualAssignments = individualSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as ClassroomAssignment));
          console.log(`[AssignmentService] Found ${individualAssignments.length} individual assignments`);

          // Step 4: Combine and sort
          const allAssignments = [...classroomAssignments, ...individualAssignments];
          allAssignments.sort((a, b) => {
            const aDate = a.dueAt || a.createdAt;
            const bDate = b.dueAt || b.createdAt;
            if (!aDate || !bDate) return 0;
            return aDate.seconds - bDate.seconds;
          });
          
          observer.next(allAssignments);
          observer.complete();
        } catch (error) {
          // Return empty array on error instead of erroring out
          observer.next([]);
          observer.complete();
        }
      })();
    });
  }

  /**
   * Delete all assignments for a class (for teacher dashboard)
   */
  async deleteAllAssignmentsForClass(classId: string): Promise<number> {
    const assignmentsRef = collection(this.firestore, 'assignments');
    const q = query(assignmentsRef, where('classId', '==', classId));
    const snapshot = await getDocs(q);
    
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    return snapshot.size;
  }

  /**
   * Delete all assignments for a student (for teacher dashboard)
   */
  async deleteAllAssignmentsForStudent(studentId: string): Promise<number> {
    const assignmentsRef = collection(this.firestore, 'assignments');
    const q = query(assignmentsRef, where('studentId', '==', studentId));
    const snapshot = await getDocs(q);
    
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    return snapshot.size;
  }

  /**
   * List assignments for current student (for student assignments component)
   * This queries the classroom-style assignments from Firestore
   */
  listAssignmentsForStudent(): Observable<ClassroomAssignment[]> {
    const user = this.authService.getCurrentUser();
    if (!user?.uid) {
      return of([]);
    }

    return new Observable(observer => {
      (async () => {
        try {
          // Step 1: Find all classes where the student is a member
          const classesRef = collection(this.firestore, 'classes');
          const classQuery = query(
            classesRef,
            where('memberIds', 'array-contains', user.uid)
          );
          
          const classSnapshot = await getDocs(classQuery);
          const enrolledClassIds = classSnapshot.docs.map(doc => doc.id);

          // Step 2: Query assignments
          const assignmentsRef = collection(this.firestore, 'assignments');
          let classroomAssignments: ClassroomAssignment[] = [];
          
          // Only query classroom assignments if student is in any classes
          if (enrolledClassIds.length > 0) {
            // Query without orderBy to avoid index requirement
            const classroomQuery = query(
              assignmentsRef,
              where('mode', '==', 'classroom'),
              where('classId', 'in', enrolledClassIds.slice(0, 10)) // Firestore limit
            );
            
            const classroomSnapshot = await getDocs(classroomQuery);
            classroomAssignments = classroomSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            } as ClassroomAssignment));
          }

          // Step 3: Query individual assignments (without orderBy to avoid index requirement)
          const individualQuery = query(
            assignmentsRef,
            where('mode', '==', 'individual'),
            where('studentId', '==', user.uid)
          );
          
          const individualSnapshot = await getDocs(individualQuery);
          const individualAssignments = individualSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as ClassroomAssignment));

          // Step 4: Combine and sort
          const allAssignments = [...classroomAssignments, ...individualAssignments];
          allAssignments.sort((a, b) => {
            const aDate = a.dueAt || a.createdAt;
            const bDate = b.dueAt || b.createdAt;
            if (!aDate || !bDate) return 0;
            return aDate.seconds - bDate.seconds;
          });

          observer.next(allAssignments);
          observer.complete();
        } catch (error) {
          console.error('Error fetching student assignments:', error);
          observer.error(error);
        }
      })();
    });
  }

  /**
   * List all assignments for a teacher (for grade book)
   */
  listAssignmentsForTeacher(teacherId: string): Observable<ClassroomAssignment[]> {
    console.log('[AssignmentService] listAssignmentsForTeacher called for teacherId:', teacherId);
    
    const assignmentsRef = collection(this.firestore, 'assignments');
    const q = query(
      assignmentsRef,
      where('teacherId', '==', teacherId),
      orderBy('createdAt', 'desc')
    );
    
    return new Observable(observer => {
      getDocs(q).then(snapshot => {
        const assignments = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as ClassroomAssignment));
        
        observer.next(assignments);
        observer.complete();
      }).catch(error => {
        observer.next([]);
        observer.complete();
      });
    });
  }
}
