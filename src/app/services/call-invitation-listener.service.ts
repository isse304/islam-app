import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { 
  Firestore, 
  collection, 
  query, 
  where, 
  collectionData,
  doc,
  updateDoc,
  Timestamp
} from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import { CallInvitation, InvitationStatus } from '../models/video-call.models';
import { FirebaseAuthService } from './firebase-auth.service';
import { VideoCallService } from './video-call.service';
import { ToastService } from './toast.service';
import { CallInvitationDialogComponent } from '../components/call-invitation-dialog/call-invitation-dialog.component';

@Injectable({
  providedIn: 'root'
})
export class CallInvitationListenerService {
  private firestore = inject(Firestore);
  private authService = inject(FirebaseAuthService);
  private videoCallService = inject(VideoCallService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private toastService = inject(ToastService);

  private invitationsCollection = collection(this.firestore, 'callInvitations');
  private invitationSubscription?: Subscription;
  private processedInvitations = new Set<string>();

  /**
   * Start listening for incoming call invitations
   */
  startListening(): void {
    console.log('[CallInvitationListener] Starting to listen for invitations...');

    this.invitationSubscription = this.authService.user$.subscribe(user => {
      if (!user?.uid) {
        this.stopListening();
        return;
      }

      // Query for pending invitations to current user
      const q = query(
        this.invitationsCollection,
        where('toUserId', '==', user.uid),
        where('status', '==', 'pending')
      );

      collectionData(q, { idField: 'id' }).subscribe(
        (invitations: any[]) => {
          invitations.forEach(invitation => {
            this.handleIncomingInvitation(invitation as CallInvitation);
          });
        },
        error => {
          console.error('[CallInvitationListener] Error listening for invitations:', error);
        }
      );
    });
  }

  /**
   * Stop listening for invitations
   */
  stopListening(): void {
    if (this.invitationSubscription) {
      this.invitationSubscription.unsubscribe();
      this.invitationSubscription = undefined;
    }
    this.processedInvitations.clear();
    console.log('[CallInvitationListener] Stopped listening for invitations');
  }

  /**
   * Handle incoming call invitation
   */
  private handleIncomingInvitation(invitation: CallInvitation): void {
    // Avoid showing the same invitation multiple times
    if (this.processedInvitations.has(invitation.id)) {
      return;
    }

    console.log('[CallInvitationListener] Incoming call from:', invitation.fromUserName);
    this.processedInvitations.add(invitation.id);

    // Check if invitation is expired
    const now = Date.now();
    const expiresAt = invitation.expiresAt.toMillis();
    
    if (now >= expiresAt) {
      console.log('[CallInvitationListener] Invitation already expired');
      this.markAsExpired(invitation.id);
      return;
    }

    // Play notification sound
    this.playNotificationSound();

    // Show invitation dialog
    const dialogRef = this.dialog.open(CallInvitationDialogComponent, {
      data: { invitation },
      disableClose: true,
      panelClass: 'call-invitation-dialog',
      hasBackdrop: true,
      backdropClass: 'call-invitation-backdrop'
    });

    // Handle dialog result
    dialogRef.afterClosed().subscribe(result => {
      if (!result) return;

      switch (result.action) {
        case 'accept':
          this.handleAccept(invitation);
          break;
        case 'decline':
          this.handleDecline(invitation);
          break;
        case 'timeout':
          this.handleTimeout(invitation);
          break;
      }
    });
  }

  /**
   * Handle accept action
   */
  private async handleAccept(invitation: CallInvitation): Promise<void> {
    try {
      console.log('[CallInvitationListener] Accepting invitation:', invitation.id);
      
      // Update invitation status
      await this.videoCallService.acceptInvitation(invitation.id);
      
      // Note: acceptInvitation already joins the call and navigates
      console.log('[CallInvitationListener] Invitation accepted, joining call...');
      
    } catch (error: any) {
      console.error('[CallInvitationListener] ❌ Error accepting invitation:', error);
      
      // The VideoCallService already shows a toast and navigates away
      // No need to do anything here as cleanup is handled in the service
    }
  }

  /**
   * Handle decline action
   */
  private async handleDecline(invitation: CallInvitation): Promise<void> {
    try {
      console.log('[CallInvitationListener] Declining invitation:', invitation.id);
      
      // Update invitation status
      await this.videoCallService.rejectInvitation(invitation.id, 'User declined');
      
    } catch (error) {
      console.error('[CallInvitationListener] Error declining invitation:', error);
    }
  }

  /**
   * Handle timeout action
   */
  private async handleTimeout(invitation: CallInvitation): Promise<void> {
    try {
      console.log('[CallInvitationListener] Invitation timed out:', invitation.id);
      
      // Mark as expired
      await this.markAsExpired(invitation.id);
      
    } catch (error) {
      console.error('[CallInvitationListener] Error handling timeout:', error);
    }
  }

  /**
   * Mark invitation as expired
   */
  private async markAsExpired(invitationId: string): Promise<void> {
    try {
      await updateDoc(doc(this.invitationsCollection, invitationId), {
        status: 'expired' as InvitationStatus,
        respondedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('[CallInvitationListener] Error marking invitation as expired:', error);
    }
  }

  /**
   * Play notification sound
   */
  private playNotificationSound(): void {
    try {
      const audio = new Audio('/assets/sounds/incoming-call.mp3');
      audio.volume = 0.5;
      audio.play().catch(err => {
        console.log('[CallInvitationListener] Could not play sound:', err);
      });
    } catch (error) {
      // Silently fail if sound doesn't exist
    }
  }
}
