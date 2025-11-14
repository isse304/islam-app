import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  serverTimestamp,
  updateDoc,
  increment,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Progress } from '../models/classroom.models';
import { genericConverter } from '../models/firestore-converters';

@Injectable({
  providedIn: 'root',
})
export class ProgressService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  private progressCollection = collection(
    this.firestore,
    'progress'
  ).withConverter(genericConverter<Progress>());

  private getProgressDocId(assignmentId: string, ayahKey: string): string {
    const userId = this.auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');
    // Create a predictable ID to avoid duplicate progress docs for the same user/assignment/ayah
    return `${userId}_${assignmentId}_${ayahKey.replace(':', '-')}`;
  }

  async incrementAttempt(
    assignmentId: string,
    ayahKey: string
  ): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const progressId = this.getProgressDocId(assignmentId, ayahKey);
    const progressRef = doc(this.progressCollection, progressId);
    const progressSnap = await getDoc(progressRef);

    if (progressSnap.exists()) {
      await updateDoc(progressRef, {
        attempts: increment(1),
        lastHeardAt: serverTimestamp(),
      });
    } else {
      await setDoc(progressRef, {
        id: progressId,
        studentId: user.uid,
        assignmentId,
        ayahKey,
        attempts: 1,
        lastHeardAt: serverTimestamp() as Timestamp,
        completion: 0,
      });
    }
  }

  async markCompletion(
    assignmentId: string,
    ayahKey: string,
    completion: number
  ): Promise<void> {
    if (completion < 0 || completion > 100) {
      throw new Error('Completion must be between 0 and 100');
    }

    const progressId = this.getProgressDocId(assignmentId, ayahKey);
    const progressRef = doc(this.progressCollection, progressId);

    await updateDoc(progressRef, {
      completion,
    });
  }

  /**
   * Record progress when a student practices an ayah
   * (Alias for incrementAttempt with completion marking)
   */
  async recordProgress(
    assignmentId: string,
    ayahKey: string,
    score?: number
  ): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const progressId = this.getProgressDocId(assignmentId, ayahKey);
    const progressRef = doc(this.progressCollection, progressId);
    const progressSnap = await getDoc(progressRef);

    if (progressSnap.exists()) {
      const updateData: any = {
        attempts: increment(1),
        lastHeardAt: serverTimestamp(),
      };
      
      if (score !== undefined) {
        updateData.lastScore = score;
      }
      
      await updateDoc(progressRef, updateData);
    } else {
      const newProgress: Omit<Progress, 'id'> = {
        studentId: user.uid,
        assignmentId,
        ayahKey,
        attempts: 1,
        lastHeardAt: serverTimestamp() as Timestamp,
        completion: 0,
      };
      
      if (score !== undefined) {
        newProgress.lastScore = score;
      }
      
      await setDoc(progressRef, { id: progressId, ...newProgress });
    }
  }

  /**
   * Get aggregated practice progress for an assignment
   */
  async getAggregatedProgress(
    assignmentId: string,
    studentId?: string
  ): Promise<{
    totalAttempts: number;
    versesCompleted: number;
    perVerseAttempts: { [ayahKey: string]: number };
    lastPracticedAt?: Timestamp;
  } | null> {
    const user = this.auth.currentUser;
    if (!user && !studentId) throw new Error('User not authenticated');

    const uid = studentId || user!.uid;

    // Query all progress records for this assignment and student
    const q = query(
      this.progressCollection,
      where('assignmentId', '==', assignmentId),
      where('studentId', '==', uid)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null; // No practice data
    }

    let totalAttempts = 0;
    const perVerseAttempts: { [ayahKey: string]: number } = {};
    let lastPracticedAt: Timestamp | undefined;

    snapshot.docs.forEach((doc) => {
      const progress = doc.data();
      totalAttempts += progress.attempts || 0;
      perVerseAttempts[progress.ayahKey] = progress.attempts || 0;

      // Track the most recent practice time
      if (progress.lastHeardAt) {
        if (!lastPracticedAt || progress.lastHeardAt.seconds > lastPracticedAt.seconds) {
          lastPracticedAt = progress.lastHeardAt;
        }
      }
    });

    const versesCompleted = Object.keys(perVerseAttempts).length;

    return {
      totalAttempts,
      versesCompleted,
      perVerseAttempts,
      lastPracticedAt,
    };
  }
}
