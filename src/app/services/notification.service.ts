import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  updateDoc,
  doc,
  collectionData,
  onSnapshot,
  deleteDoc,
  addDoc,
  serverTimestamp,
  Timestamp,
} from '@angular/fire/firestore';
import { Observable, from, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { Notification } from '../models/classroom.models';
import { genericConverter } from '../models/firestore-converters';
import { Auth } from '@angular/fire/auth';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  private notificationsCollection = collection(
    this.firestore,
    'notifications'
  ).withConverter(genericConverter<Notification>());

  /**
   * Get notifications (one-time fetch) - DEPRECATED, use listenToMyNotifications instead
   */
  listMyNotifications(limitCount: number = 20): Observable<Notification[]> {
    const user = this.auth.currentUser;
    if (!user) return from([]);

    const q = query(
      this.notificationsCollection,
      where('toUid', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    return from(getDocs(q)).pipe(
      map((snapshot) => snapshot.docs.map((doc) => doc.data()))
    );
  }

  /**
   * Listen to notifications in real-time
   */
  listenToMyNotifications(limitCount: number = 20): Observable<Notification[]> {
    const user = this.auth.currentUser;
    if (!user) return of([]);

    const q = query(
      this.notificationsCollection,
      where('toUid', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    
    return collectionData(q, { idField: 'id' }) as Observable<Notification[]>;
  }

  /**
   * Get unread notification count in real-time
   */
  getUnreadCount(): Observable<number> {
    const user = this.auth.currentUser;
    if (!user) return of(0);

    const q = query(
      this.notificationsCollection,
      where('toUid', '==', user.uid),
      where('read', '==', false)
    );
    
    return collectionData(q).pipe(
      map(notifications => notifications.length)
    );
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    const notificationRef = doc(this.notificationsCollection, notificationId);
    await updateDoc(notificationRef, { read: true });
  }

  /**
   * Mark all notifications as read for current user
   */
  async markAllAsRead(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;

    const q = query(
      this.notificationsCollection,
      where('toUid', '==', user.uid),
      where('read', '==', false)
    );
    
    const snapshot = await getDocs(q);
    
    // Update each notification individually
    const updatePromises = snapshot.docs.map((docSnap) => 
      updateDoc(docSnap.ref, { read: true })
    );
    
    await Promise.all(updatePromises);
  }

  /**
   * Delete a single notification
   */
  async deleteNotification(notificationId: string): Promise<void> {
    const notificationRef = doc(this.notificationsCollection, notificationId);
    await deleteDoc(notificationRef);
  }

  /**
   * Clear all notifications for current user
   */
  async clearAllNotifications(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;

    const q = query(
      this.notificationsCollection,
      where('toUid', '==', user.uid)
    );
    
    const snapshot = await getDocs(q);
    
    // Delete each notification individually
    const deletePromises = snapshot.docs.map((docSnap) => 
      deleteDoc(docSnap.ref)
    );
    
    await Promise.all(deletePromises);
  }

  /**
   * Create a new notification
   */
  async createNotification(notification: Omit<Notification, 'id' | 'createdAt'>): Promise<string> {
    const notificationData = {
      ...notification,
      createdAt: serverTimestamp() as Timestamp,
    };
    
    const docRef = await addDoc(this.notificationsCollection, notificationData);
    console.log('[NotificationService] Created notification:', docRef.id, notificationData);
    return docRef.id;
  }
}
