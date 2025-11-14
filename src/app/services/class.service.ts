import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  arrayUnion,
  arrayRemove,
  updateDoc,
  getDoc,
} from '@angular/fire/firestore';
import { Auth, user } from '@angular/fire/auth';
import { Class } from '../models/classroom.models';
import { genericConverter } from '../models/firestore-converters';
import { filter, switchMap } from 'rxjs/operators';
import { of } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ClassService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private user$ = user(this.auth);

  private classesCollection = collection(this.firestore, 'classes').withConverter(
    genericConverter<Class>()
  );

  async createClass(name: string): Promise<string> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const classId = doc(collection(this.firestore, '_')).id;
    const classRef = doc(this.classesCollection, classId);

    await setDoc(classRef, {
      id: classId,
      name,
      ownerId: user.uid,
      createdAt: serverTimestamp(),
      memberIds: [user.uid], // Teacher is a member by default
      code: this.generateJoinCode(),
    });
    return classId;
  }

  listMyClasses() {
    return this.user$.pipe(
      filter((user) => !!user),
      switchMap((user) => {
        if (!user) return of([]);
        const q = query(
          this.classesCollection,
          where('memberIds', 'array-contains', user.uid)
        );
        return getDocs(q).then((snapshot) =>
          snapshot.docs
            .map((doc) => doc.data())
            .filter((cls) => !(cls as any).deleted) // Filter out soft-deleted classes
        );
      })
    );
  }

  async joinClassByCode(code: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    // Find class by code
    const q = query(this.classesCollection, where('code', '==', code));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      throw new Error('Class not found. Please check the code and try again.');
    }

    const classDoc = querySnapshot.docs[0];
    const classData = classDoc.data();
    const classRef = doc(this.classesCollection, classDoc.id);

    // Check if user is already a member
    if (classData.memberIds?.includes(user.uid)) {
      throw new Error('You are already a member of this class.');
    }

    // Add user to class
    await updateDoc(classRef, {
      memberIds: arrayUnion(user.uid),
    });
  }

  /**
   * Remove a student from a class (Teacher only)
   */
  async removeStudentFromClass(classId: string, studentId: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const classRef = doc(this.classesCollection, classId);
    const classSnap = await getDoc(classRef);

    if (!classSnap.exists()) {
      throw new Error('Class not found');
    }

    const classData = classSnap.data();

    // Only the teacher (owner) can remove students
    if (classData.ownerId !== user.uid) {
      throw new Error('Only the teacher can remove students from the class');
    }

    // Cannot remove the teacher themselves
    if (studentId === user.uid) {
      throw new Error('Teachers cannot remove themselves from their own class');
    }

    // Remove student from class
    await updateDoc(classRef, {
      memberIds: arrayRemove(studentId),
    });
  }

  /**
   * Get class details by ID
   */
  async getClassById(classId: string): Promise<Class | null> {
    const classRef = doc(this.classesCollection, classId);
    const classSnap = await getDoc(classRef);

    if (!classSnap.exists()) {
      return null;
    }

    return classSnap.data();
  }

  /**
   * Check if user is the owner of a class
   */
  async isClassOwner(classId: string): Promise<boolean> {
    const user = this.auth.currentUser;
    if (!user) return false;

    const classData = await this.getClassById(classId);
    return classData?.ownerId === user.uid;
  }

  /**
   * Delete a class (Owner only)
   * This will delete the class document. Assignments and submissions are handled separately.
   */
  async deleteClass(classId: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    // Check if user is the owner
    const isOwner = await this.isClassOwner(classId);
    if (!isOwner) {
      throw new Error('Only the class owner can delete the class');
    }

    const classRef = doc(this.classesCollection, classId);
    
    // Delete the class document
    await updateDoc(classRef, {
      deleted: true,
      deletedAt: serverTimestamp(),
      deletedBy: user.uid
    } as any);
    
    // Note: To truly delete, use deleteDoc from '@angular/fire/firestore'
    // For now, we're soft-deleting by marking as deleted
    // This preserves data for potential recovery and maintains referential integrity
  }

  private generateJoinCode(length: number = 8): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
