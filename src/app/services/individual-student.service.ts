import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  deleteDoc,
  Timestamp,
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of, firstValueFrom } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { IndividualStudent } from '../models/classroom.models';
import { genericConverter } from '../models/firestore-converters';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class IndividualStudentService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private http = inject(HttpClient);

  private studentsCollection = collection(
    this.firestore,
    'individualStudents'
  ).withConverter(genericConverter<IndividualStudent>());

  /**
   * Add a student to the teacher's individual students list
   */
  async addStudent(studentEmail: string, studentName?: string, notes?: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    // Get ID token for authentication
    const token = await user.getIdToken();

    // Look up the user's UID by email via backend API
    let studentUid: string | null = null;
    
    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean; user: { uid: string; email: string; displayName?: string } }>(
          `${environment.apiUrl}/api/lookup/user-by-email`,
          { email: studentEmail.toLowerCase().trim() },
          { headers: { Authorization: `Bearer ${token}` } }
        )
      );
      
      if (response.success && response.user) {
        studentUid = response.user.uid;
        console.log('[IndividualStudentService] Found student UID:', studentUid, 'for email:', studentEmail);
      } else {
        throw new Error(`No user found with email: ${studentEmail}`);
      }
    } catch (error: any) {
      console.error('[IndividualStudentService] Error looking up student:', error);
      
      if (error.status === 404 || error.error?.error === 'No user found with that email') {
        throw new Error(`No user found with email: ${studentEmail}. Make sure the student has created an account first.`);
      }
      
      throw new Error(`Failed to look up student: ${error.message || 'Unknown error'}`);
    }

    if (!studentUid) {
      throw new Error('Could not determine student UID');
    }

    // Check if this student is already added
    const existingQuery = query(
      this.studentsCollection,
      where('teacherId', '==', user.uid),
      where('studentId', '==', studentUid)
    );
    
    const existingSnapshot = await getDocs(existingQuery);
    if (!existingSnapshot.empty) {
      throw new Error('This student has already been added');
    }
    
    const newStudent: Omit<IndividualStudent, 'id'> = {
      teacherId: user.uid,
      studentId: studentUid,
      studentEmail,
      studentName,
      addedAt: Timestamp.now(),
      notes,
    };

    await addDoc(this.studentsCollection, newStudent);
    console.log('[IndividualStudentService] Successfully added student:', studentUid);
  }

  /**
   * List all individual students for the current teacher
   */
  listMyStudents(): Observable<IndividualStudent[]> {
    const user = this.auth.currentUser;
    if (!user) return of([]);

    const q = query(
      this.studentsCollection,
      where('teacherId', '==', user.uid)
    );

    return from(getDocs(q)).pipe(
      map((snapshot) => snapshot.docs.map((doc) => doc.data()))
    );
  }

  /**
   * Remove a student from the individual students list
   */
  async removeStudent(studentId: string): Promise<void> {
    const studentRef = doc(this.studentsCollection, studentId);
    await deleteDoc(studentRef);
  }
}


