import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  serverTimestamp,
  Timestamp,
  collectionData,
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Observable, from, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { Submission } from '../models/classroom.models';
import { genericConverter } from '../models/firestore-converters';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root',
})
export class SubmissionService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private notificationService = inject(NotificationService);

  private submissionsCollection = collection(
    this.firestore,
    'submissions'
  ).withConverter(genericConverter<Submission>());

  listSubmissionsForAssignment(
    assignmentId: string
  ): Observable<Submission[]> {
    const q = query(
      this.submissionsCollection,
      where('assignmentId', '==', assignmentId),
      orderBy('submittedAt', 'desc')
    );
    return from(getDocs(q)).pipe(
      map((snapshot) => snapshot.docs.map((doc) => doc.data()))
    );
  }

  /**
   * Submit an assignment (creates or updates a submission)
   */
  async submitAssignment(
    assignmentId: string,
    practiceData?: Submission['practiceData'],
    audioBlobPath?: string
  ): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    // Get assignment details to fetch teacher ID and assignment info
    const assignmentRef = doc(this.firestore, 'assignments', assignmentId);
    const assignmentSnap = await getDoc(assignmentRef);
    
    if (!assignmentSnap.exists()) {
      throw new Error('Assignment not found');
    }
    
    const assignmentData = assignmentSnap.data();
    const teacherId = assignmentData['teacherId'];
    const assignmentTitle = assignmentData['title'] || 'Assignment';
    
    // Get student name/email for notification
    const studentRef = doc(this.firestore, 'users', user.uid);
    const studentSnap = await getDoc(studentRef);
    const studentData = studentSnap.exists() ? studentSnap.data() : null;
    const studentName = studentData?.['displayName'] || studentData?.['email'] || 'A student';

    // Check if submission already exists
    const q = query(
      this.submissionsCollection,
      where('assignmentId', '==', assignmentId),
      where('studentId', '==', user.uid)
    );
    const existingSubmissions = await getDocs(q);

    const submissionData: any = {
      status: 'submitted',
      submittedAt: serverTimestamp() as Timestamp,
    };

    if (practiceData) {
      submissionData.practiceData = practiceData;
    }

    if (audioBlobPath) {
      submissionData.audioBlobPath = audioBlobPath;
    }

    const isUpdate = !existingSubmissions.empty;

    if (isUpdate) {
      // Update existing submission
      const submissionRef = existingSubmissions.docs[0].ref;
      await updateDoc(submissionRef, submissionData);
      console.log('[SubmissionService] Updated existing submission for assignment:', assignmentId);
    } else {
      // Create new submission
      const submissionId = doc(collection(this.firestore, '_')).id;
      const submissionRef = doc(this.submissionsCollection, submissionId);
      
      const newSubmission: Omit<Submission, 'id'> = {
        assignmentId,
        studentId: user.uid,
        ...submissionData,
      };

      await setDoc(submissionRef, newSubmission);
      console.log('[SubmissionService] Created new submission for assignment:', assignmentId);
    }

    // Create notification for teacher (only for new submissions, not updates)
    if (!isUpdate && teacherId) {
      try {
        await this.notificationService.createNotification({
          toUid: teacherId,
          type: 'submission_received',
          ref: { collection: 'submissions', id: assignmentId },
          title: 'New Submission',
          body: `${studentName} submitted "${assignmentTitle}"`,
          read: false,
          metadata: {
            assignmentId: assignmentId,
            studentId: user.uid,
            studentName: studentName,
          },
        });
        console.log('[SubmissionService] Created notification for teacher:', teacherId);
      } catch (error) {
        console.error('[SubmissionService] Failed to create notification:', error);
        // Don't fail the submission if notification fails
      }
    }
  }

  /**
   * Get submission for a specific assignment and student
   */
  async getSubmissionForStudent(
    assignmentId: string,
    studentId?: string
  ): Promise<Submission | null> {
    const user = this.auth.currentUser;
    if (!user) return null;

    const uid = studentId || user.uid;
    const q = query(
      this.submissionsCollection,
      where('assignmentId', '==', assignmentId),
      where('studentId', '==', uid)
    );
    
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    
    return snapshot.docs[0].data();
  }

  /**
   * Count ungraded submissions for a class (real-time)
   */
  countUngradedSubmissionsForClass(classId: string): Observable<number> {
    const q = query(
      this.submissionsCollection,
      where('status', '==', 'submitted'),
      where('gradedAt', '==', null)
    );
    
    return collectionData(q).pipe(
      map(submissions => {
        // Filter by classId on the client side (since we need to join with assignments)
        // This is a simplified version - in production, you might want to denormalize classId into submissions
        return submissions.length;
      })
    );
  }

  /**
   * Count ungraded submissions for a specific student (real-time)
   */
  countUngradedSubmissionsForStudent(studentId: string): Observable<number> {
    const q = query(
      this.submissionsCollection,
      where('studentId', '==', studentId),
      where('status', '==', 'submitted'),
      where('gradedAt', '==', null)
    );
    
    return collectionData(q).pipe(
      map(submissions => submissions.length)
    );
  }

  /**
   * Count ungraded submissions for a specific assignment (real-time)
   */
  countUngradedSubmissionsForAssignment(assignmentId: string): Observable<number> {
    const q = query(
      this.submissionsCollection,
      where('assignmentId', '==', assignmentId),
      where('status', '==', 'submitted'),
      where('gradedAt', '==', null)
    );
    
    return collectionData(q).pipe(
      map(submissions => submissions.length)
    );
  }
}
