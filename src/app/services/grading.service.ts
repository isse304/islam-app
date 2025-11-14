import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  Timestamp,
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Submission } from '../models/classroom.models';

export type GradePayload = Pick<
  Submission,
  'score' | 'rubric' | 'teacherComments'
>;

@Injectable({
  providedIn: 'root',
})
export class GradingService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  async gradeSubmission(
    submissionId: string,
    payload: Partial<GradePayload>
  ): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    // Filter out undefined values (Firebase doesn't accept them)
    const cleanPayload: any = {};
    if (payload.score !== undefined && payload.score !== null) {
      cleanPayload.score = payload.score;
    }
    if (payload.rubric !== undefined && payload.rubric !== null) {
      // Also clean up rubric nested fields
      const cleanRubric: any = {};
      if (payload.rubric.fluency !== undefined && payload.rubric.fluency !== null) {
        cleanRubric.fluency = payload.rubric.fluency;
      }
      if (payload.rubric.tajweed !== undefined && payload.rubric.tajweed !== null) {
        cleanRubric.tajweed = payload.rubric.tajweed;
      }
      if (payload.rubric.accuracy !== undefined && payload.rubric.accuracy !== null) {
        cleanRubric.accuracy = payload.rubric.accuracy;
      }
      if (payload.rubric.notes !== undefined && payload.rubric.notes !== null && payload.rubric.notes !== '') {
        cleanRubric.notes = payload.rubric.notes;
      }
      if (payload.rubric.tags !== undefined && payload.rubric.tags !== null) {
        cleanRubric.tags = payload.rubric.tags;
      }
      if (Object.keys(cleanRubric).length > 0) {
        cleanPayload.rubric = cleanRubric;
      }
    }

    const submissionRef = doc(
      this.firestore,
      `submissions/${submissionId}`
    );
    await updateDoc(submissionRef, {
      ...cleanPayload,
      gradedAt: serverTimestamp(),
      gradedBy: user.uid,
      status: 'graded',
    });
  }

  async addTeacherComment(
    submissionId: string,
    commentText: string
  ): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const submissionRef = doc(
      this.firestore,
      `submissions/${submissionId}`
    );
    await updateDoc(submissionRef, {
      teacherComments: arrayUnion({
        uid: user.uid,
        text: commentText,
        at: Timestamp.now(),
      }),
    });
  }
}
