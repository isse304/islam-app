import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { 
  Firestore, 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  query, 
  where, 
  orderBy,
  Timestamp,
  collectionData,
  docData
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Observable, BehaviorSubject, Subject, Subscription, from, of } from 'rxjs';
import { map, switchMap, take, catchError } from 'rxjs/operators';
import AgoraRTC, {
  IAgoraRTCClient,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
  IRemoteVideoTrack,
  IRemoteAudioTrack,
  IAgoraRTCRemoteUser,
  UID,
  NetworkQuality as AgoraNetworkQuality
} from 'agora-rtc-sdk-ng';
import {
  CallSession,
  CallParticipant,
  CallInvitation,
  CallStatus,
  CreateCallRequest,
  AgoraTokenRequest,
  AgoraTokenResponse,
  CallChatMessage,
  UserPresence,
  CallSettings,
  CallEvent,
  InvitationStatus,
  CallHistoryEntry
} from '../models/video-call.models';
import { FirebaseAuthService } from './firebase-auth.service';
import { ToastService } from './toast.service';

@Injectable({
  providedIn: 'root'
})
export class VideoCallService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);
  private storage = inject(Storage);
  private authService = inject(FirebaseAuthService);
  private toastService = inject(ToastService);
  private router = inject(Router);

  // Agora Client
  private client: IAgoraRTCClient | null = null;
  private localVideoTrack: ICameraVideoTrack | null = null;
  private localAudioTrack: IMicrophoneAudioTrack | null = null;
  private screenShareTrack: any = null; // Can be ILocalVideoTrack or array of tracks
  
  // Recording
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isRecording$ = new BehaviorSubject<boolean>(false);

  // State Management
  private currentCallSession$ = new BehaviorSubject<CallSession | null>(null);
  private localVideoEnabled$ = new BehaviorSubject<boolean>(true);
  private localAudioEnabled$ = new BehaviorSubject<boolean>(true);
  private isScreenSharing$ = new BehaviorSubject<boolean>(false);
  private remoteUsers$ = new BehaviorSubject<Map<UID, IAgoraRTCRemoteUser>>(new Map());
  private networkQuality$ = new BehaviorSubject<AgoraNetworkQuality | null>(null);
  private callEvents$ = new Subject<CallEvent>();
  private callEndedByRemote$ = new Subject<string>(); // Emits reason when the OTHER side ends the call
  private callSessionFirestoreSub: Subscription | null = null;
  private isLeavingCall = false; // Prevent double-leave

  // Collections
  private callSessionsCollection = collection(this.firestore, 'callSessions');
  private callInvitationsCollection = collection(this.firestore, 'callInvitations');
  private callParticipantsCollection = collection(this.firestore, 'callParticipants');
  private userPresenceCollection = collection(this.firestore, 'userPresence');
  private callChatCollection = collection(this.firestore, 'callChat');
  private callHistoryCollection = collection(this.firestore, 'callHistory');

  constructor() {
    // Initialize Agora client
    this.initializeAgoraClient();
    
    // Set up user presence tracking
    this.setupPresenceTracking();
  }

  /**
   * Initialize Agora RTC Client
   */
  private initializeAgoraClient(): void {
    try {
      this.client = AgoraRTC.createClient({
        mode: 'rtc',
        codec: 'vp8'
      });

      // Set up client event listeners
      this.setupClientEventListeners();
    } catch (error) {
      console.error('[VideoCallService] Failed to initialize Agora client:', error);
      this.logCallEvent('error', { error, stage: 'client_initialization' });
    }
  }

  /**
   * Set up Agora client event listeners
   */
  private setupClientEventListeners(): void {
    if (!this.client) return;

    // User published (remote user started sending media)
    this.client.on('user-published', async (user, mediaType) => {
      console.log(`[VideoCallService] 📡 Remote user ${user.uid} published ${mediaType}`);
      await this.client!.subscribe(user, mediaType);

      // Auto-play remote audio immediately
      if (mediaType === 'audio' && user.audioTrack) {
        user.audioTrack.play();
        console.log(`[VideoCallService] 🔊 Playing remote audio for user ${user.uid}`);
      }

      // Update remote users map (triggers re-render in component)
      const remoteUsers = new Map(this.remoteUsers$.value);
      remoteUsers.set(user.uid, user);
      this.remoteUsers$.next(remoteUsers);

      this.logCallEvent('join', { userId: user.uid, mediaType });
    });

    // User unpublished (remote user stopped sending media)
    this.client.on('user-unpublished', (user, mediaType) => {
      console.log(`[VideoCallService] 📡 Remote user ${user.uid} unpublished ${mediaType}`);
      // Emit updated map so component re-renders
      const remoteUsers = new Map(this.remoteUsers$.value);
      remoteUsers.set(user.uid, user);
      this.remoteUsers$.next(remoteUsers);
      this.logCallEvent('leave', { userId: user.uid, mediaType });
    });

    // User left
    this.client.on('user-left', (user) => {
      const remoteUsers = new Map(this.remoteUsers$.value);
      remoteUsers.delete(user.uid);
      this.remoteUsers$.next(remoteUsers);

      this.logCallEvent('leave', { userId: user.uid });
    });

    // Network quality
    this.client.on('network-quality', (quality) => {
      this.networkQuality$.next(quality);
      this.logCallEvent('quality-change', { quality });
    });

    // Connection state changed
    this.client.on('connection-state-change', (curState, prevState) => {
      console.log(`[VideoCallService] Connection state: ${prevState} -> ${curState}`);
      // Log as a generic event (no specific type for connection state change)
    });

    // Error
    this.client.on('error', (error: any) => {
      console.error('[VideoCallService] Agora error:', error);
      this.logCallEvent('error', { error });
    });
  }

  /**
   * Create a new call session
   */
  async createCall(request: CreateCallRequest): Promise<CallSession> {
    const currentUser = await this.authService.user$.pipe(take(1)).toPromise();
    if (!currentUser || !currentUser.uid) {
      throw new Error('User must be authenticated to create a call');
    }

    const channelName = `call_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const callSessionId = doc(this.callSessionsCollection).id;

    const callSession: CallSession = {
      id: callSessionId,
      channelName,
      callType: request.callType,
      hostId: currentUser.uid,
      participantIds: request.participantIds,
      status: request.scheduledAt ? 'scheduled' : 'waiting',
      scheduledAt: request.scheduledAt ? Timestamp.fromDate(request.scheduledAt) : undefined,
      isVideoEnabled: true,
      isAudioEnabled: true,
      isRecording: false,
      isScreenSharing: false,
      subject: request.subject,
      purpose: request.purpose,
      classId: request.classId,
      assignmentId: request.assignmentId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    // Remove undefined values before saving to Firestore
    const cleanedCallSession = Object.fromEntries(
      Object.entries(callSession).filter(([_, value]) => value !== undefined)
    );

    // Save to Firestore
    await setDoc(doc(this.callSessionsCollection, callSessionId), cleanedCallSession);

    // Create invitations for each participant
    for (const participantId of request.participantIds) {
      await this.createCallInvitation({
        fromUserId: currentUser.uid,
        toUserId: participantId,
        callSessionId,
        channelName,
        message: request.message,
        subject: request.subject,
        estimatedDuration: request.estimatedDuration
      });
    }

    return callSession;
  }

  /**
   * Create call invitation
   */
  private async createCallInvitation(data: Partial<CallInvitation>): Promise<void> {
    const currentUser = await this.authService.user$.pipe(take(1)).toPromise();
    if (!currentUser) return;

    const invitationId = doc(this.callInvitationsCollection).id;
    const expiresAt = Timestamp.fromMillis(Date.now() + 60000); // 60 seconds

    const invitation: CallInvitation = {
      id: invitationId,
      fromUserId: data.fromUserId!,
      fromUserName: currentUser.displayName || 'User',
      fromUserPhoto: currentUser.photoURL,
      fromUserRole: (currentUser.role === 'teacher' || currentUser.role === 'student') ? currentUser.role : 'student',
      toUserId: data.toUserId!,
      toUserName: '', // Will be populated from user profile
      callSessionId: data.callSessionId!,
      channelName: data.channelName!,
      callType: 'one-on-one',
      status: 'pending',
      createdAt: Timestamp.now(),
      expiresAt,
      message: data.message,
      subject: data.subject,
      estimatedDuration: data.estimatedDuration
    };

    // Remove undefined values before saving to Firestore
    const cleanedInvitation = Object.fromEntries(
      Object.entries(invitation).filter(([_, value]) => value !== undefined)
    );

    await setDoc(doc(this.callInvitationsCollection, invitationId), cleanedInvitation);
  }

  /**
   * Check and request camera/microphone permissions
   */
  async checkDevicePermissions(): Promise<{ video: boolean; audio: boolean }> {
    const result = { video: false, audio: false };
    
    try {
      // Check if devices are available
      const devices = await AgoraRTC.getDevices();
      const hasCamera = devices.some(d => d.kind === 'videoinput');
      const hasMicrophone = devices.some(d => d.kind === 'audioinput');
      
      console.log('[VideoCallService] Available devices:', {
        cameras: devices.filter(d => d.kind === 'videoinput').length,
        microphones: devices.filter(d => d.kind === 'audioinput').length
      });
      
      result.video = hasCamera;
      result.audio = hasMicrophone;
      
      if (!hasCamera && !hasMicrophone) {
        console.warn('[VideoCallService] ⚠️ No camera or microphone detected');
        console.log('[VideoCallService] 💡 You can still join the call in view-only mode');
      }
    } catch (error) {
      console.error('[VideoCallService] Error checking devices:', error);
    }
    
    return result;
  }

  /**
   * Join a call session
   */
  async joinCall(callSessionId: string): Promise<void> {
    const currentUser = await this.authService.user$.pipe(take(1)).toPromise();
    if (!currentUser) {
      throw new Error('User must be authenticated to join a call');
    }

    try {
      // Get call session
      const callSessionDoc = await docData(doc(this.callSessionsCollection, callSessionId))
        .pipe(take(1))
        .toPromise() as CallSession;

      if (!callSessionDoc) {
        throw new Error('Call session not found');
      }

      // Generate Agora token
      const tokenRequest: AgoraTokenRequest = {
        channelName: callSessionDoc.channelName,
        uid: this.generateNumericUid(currentUser?.uid || 'unknown'),
        role: 'publisher'
      };

      const tokenResponse = await this.generateAgoraToken(tokenRequest);

      // Try to create local tracks with timeout (don't hang forever)
      console.log('[VideoCallService] 🎥 Creating local media tracks...');
      
      await this.createLocalTracks();

      // Join channel
      await this.client!.join(
        tokenResponse.appId || '',
        tokenResponse.channelName,
        tokenResponse.token,
        tokenResponse.uid
      );

      // Publish local tracks if available
      const tracksToPublish = [];
      if (this.localAudioTrack) tracksToPublish.push(this.localAudioTrack);
      if (this.localVideoTrack) tracksToPublish.push(this.localVideoTrack);
      
      if (tracksToPublish.length > 0) {
        await this.client!.publish(tracksToPublish);
        console.log('[VideoCallService] Published', tracksToPublish.length, 'track(s)');
      } else {
        console.log('[VideoCallService] Joined in view-only mode (no local tracks)');
      }

      // Update call session status
      if (callSessionDoc.status === 'waiting') {
        await updateDoc(doc(this.callSessionsCollection, callSessionId), {
          status: 'active',
          startedAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        });
      }

      // Create participant record
      if (currentUser?.uid) {
        await this.addParticipant(callSessionId, currentUser.uid);
      }

      // Set current call and start real-time Firestore listener
      this.currentCallSession$.next(callSessionDoc);
      this.startCallSessionListener(callSessionId);

      this.logCallEvent('join', { callSessionId, userId: currentUser?.uid });
    } catch (error: any) {
      console.error('[VideoCallService] ❌ Failed to join call:', error);
      this.logCallEvent('error', { error, stage: 'join_call' });
      
      // Clean up any resources
      await this.cleanupFailedCall();
      
      // Show user-friendly error message
      let errorMessage = 'Unable to join the call. ';
      if (error.message?.includes('token')) {
        errorMessage += 'Invalid token or expired session.';
      } else if (error.message?.includes('network')) {
        errorMessage += 'Network connection failed.';
      } else if (error.message?.includes('permission')) {
        errorMessage += 'Camera/microphone permissions denied.';
      } else {
        errorMessage += 'Please try again or contact support.';
      }
      
      this.toastService.error(errorMessage);
      
      // Navigate away from call page
      this.router.navigate(['/home']);
      
      throw error;
    }
  }

  /**
   * Start real-time listener on the call session document.
   * When the other party ends the call, we detect it and auto-leave.
   */
  private startCallSessionListener(callSessionId: string): void {
    // Clean up any existing listener
    this.stopCallSessionListener();

    console.log('[VideoCallService] 👂 Starting real-time call session listener:', callSessionId);

    this.callSessionFirestoreSub = (docData(doc(this.callSessionsCollection, callSessionId)) as Observable<CallSession>)
      .subscribe(session => {
        if (!session) return;

        // Update the local BehaviorSubject so the component always has fresh data
        this.currentCallSession$.next(session);

        // If the call was ended remotely, auto-leave
        if (session.status === 'ended' || session.status === 'cancelled') {
          if (!this.isLeavingCall) {
            console.log('[VideoCallService] 📞 Call ended by the other party');
            this.callEndedByRemote$.next(
              session.status === 'cancelled' ? 'Call was cancelled' : 'The other person ended the call'
            );
            this.forceLeaveCall();
          }
        }
      });
  }

  /**
   * Stop the Firestore listener on the call session
   */
  private stopCallSessionListener(): void {
    if (this.callSessionFirestoreSub) {
      this.callSessionFirestoreSub.unsubscribe();
      this.callSessionFirestoreSub = null;
    }
  }

  /**
   * Force-leave when the OTHER side ends the call.
   * Cleans up local resources without writing to Firestore again.
   */
  private async forceLeaveCall(): Promise<void> {
    if (this.isLeavingCall) return;
    this.isLeavingCall = true;

    console.log('[VideoCallService] 🧹 Force-leaving call (ended remotely)...');

    try {
      // Stop recording first (needs currentCallSession$ which is still set)
      if (this.isRecording$.value) {
        await this.stopRecording();
      }

      // Stop call session listener
      this.stopCallSessionListener();

      // Close all local tracks
      this.closeAllLocalTracks();

      // Leave Agora channel
      if (this.client) {
        try { await this.client.leave(); } catch (_) {}
      }

      // Clear state
      this.currentCallSession$.next(null);
      this.remoteUsers$.next(new Map());
      this.localVideoEnabled$.next(true);
      this.localAudioEnabled$.next(true);
      this.isScreenSharing$.next(false);

    } catch (error) {
      console.error('[VideoCallService] Error in forceLeaveCall:', error);
    } finally {
      this.isLeavingCall = false;
    }
  }

  /**
   * Close all local tracks (video, audio, screen share)
   */
  private closeAllLocalTracks(): void {
    if (this.localVideoTrack) {
      try { this.localVideoTrack.stop(); this.localVideoTrack.close(); } catch (_) {}
      this.localVideoTrack = null;
    }
    if (this.localAudioTrack) {
      try { this.localAudioTrack.stop(); this.localAudioTrack.close(); } catch (_) {}
      this.localAudioTrack = null;
    }
    if (this.screenShareTrack) {
      const tracks = Array.isArray(this.screenShareTrack) ? this.screenShareTrack : [this.screenShareTrack];
      tracks.forEach(t => { try { t.close(); } catch (_) {} });
      this.screenShareTrack = null;
    }
  }

  /**
   * Create local audio and video tracks with fallback
   */
  private async createLocalTracks(): Promise<void> {
    // Close any existing tracks first
    if (this.localVideoTrack) {
      try { this.localVideoTrack.close(); } catch (_) {}
      this.localVideoTrack = null;
    }
    if (this.localAudioTrack) {
      try { this.localAudioTrack.close(); } catch (_) {}
      this.localAudioTrack = null;
    }

    try {
      const tracksPromise = AgoraRTC.createMicrophoneAndCameraTracks();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Track creation timeout')), 5000)
      );

      [this.localAudioTrack, this.localVideoTrack] =
        await Promise.race([tracksPromise, timeoutPromise]) as any;
      console.log('[VideoCallService] ✅ Created audio and video tracks');

      this.localVideoEnabled$.next(true);
      this.localAudioEnabled$.next(true);

      // Attach track-ended handlers for recovery
      this.attachTrackEndedHandlers();

    } catch (error: any) {
      console.warn('[VideoCallService] ⚠️ Failed to create video+audio tracks:', error.message);

      // Fallback: audio only
      try {
        const audioPromise = AgoraRTC.createMicrophoneAudioTrack();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Audio track timeout')), 3000)
        );

        this.localAudioTrack = await Promise.race([audioPromise, timeoutPromise]) as any;
        console.log('[VideoCallService] ✅ Created audio track only (no camera)');
        this.localVideoEnabled$.next(false);
        this.localAudioEnabled$.next(true);

        if (this.localAudioTrack) {
          this.localAudioTrack.on('track-ended', () => {
            console.warn('[VideoCallService] ⚠️ Local audio track ended unexpectedly');
            this.localAudioEnabled$.next(false);
          });
        }

      } catch (audioError: any) {
        console.warn('[VideoCallService] ⚠️ Failed to create audio track:', audioError.message);
        console.log('[VideoCallService] 👁️ Joining in view-only mode');
        this.localAudioEnabled$.next(false);
        this.localVideoEnabled$.next(false);
      }
    }
  }

  /**
   * Attach track-ended handlers to detect when tracks die (e.g. PC lock)
   */
  private attachTrackEndedHandlers(): void {
    if (this.localVideoTrack) {
      this.localVideoTrack.on('track-ended', () => {
        console.warn('[VideoCallService] ⚠️ Local video track ended (PC locked or device lost)');
        this.localVideoEnabled$.next(false);
      });
    }
    if (this.localAudioTrack) {
      this.localAudioTrack.on('track-ended', () => {
        console.warn('[VideoCallService] ⚠️ Local audio track ended (PC locked or device lost)');
        this.localAudioEnabled$.next(false);
      });
    }
  }

  /**
   * Recover tracks after PC lock/unlock or tab switch.
   * Re-creates dead tracks and re-publishes them.
   */
  async recoverTracks(): Promise<void> {
    if (!this.client || !this.currentCallSession$.value) {
      return;
    }

    console.log('[VideoCallService] 🔄 Attempting track recovery...');

    const videoTrackDead = !this.localVideoTrack || this.localVideoTrack.getMediaStreamTrack()?.readyState === 'ended';
    const audioTrackDead = !this.localAudioTrack || this.localAudioTrack.getMediaStreamTrack()?.readyState === 'ended';

    if (!videoTrackDead && !audioTrackDead) {
      console.log('[VideoCallService] ✅ All tracks still alive, no recovery needed');
      return;
    }

    console.log('[VideoCallService] 🔄 Dead tracks detected:', {
      videoDead: videoTrackDead,
      audioDead: audioTrackDead
    });

    try {
      // Unpublish old dead tracks
      const tracksToUnpublish = [];
      if (this.localVideoTrack && videoTrackDead) {
        tracksToUnpublish.push(this.localVideoTrack);
      }
      if (this.localAudioTrack && audioTrackDead) {
        tracksToUnpublish.push(this.localAudioTrack);
      }

      if (tracksToUnpublish.length > 0) {
        try {
          await this.client.unpublish(tracksToUnpublish);
        } catch (_) {}
        tracksToUnpublish.forEach(t => { try { t.close(); } catch (_) {} });
      }

      // Recreate tracks
      await this.createLocalTracks();

      // Re-publish new tracks
      const tracksToPublish = [];
      if (this.localAudioTrack) tracksToPublish.push(this.localAudioTrack);
      if (this.localVideoTrack) tracksToPublish.push(this.localVideoTrack);

      if (tracksToPublish.length > 0) {
        await this.client.publish(tracksToPublish);
        console.log('[VideoCallService] ✅ Recovered and re-published', tracksToPublish.length, 'track(s)');
        this.toastService.success('Camera and microphone recovered');
      }
    } catch (error: any) {
      console.error('[VideoCallService] ❌ Track recovery failed:', error);
      this.toastService.error('Could not recover camera/microphone. Try toggling them manually.');
    }
  }

  /**
   * Clean up resources after a failed call attempt
   */
  private async cleanupFailedCall(): Promise<void> {
    try {
      this.stopCallSessionListener();
      this.closeAllLocalTracks();
      
      if (this.client) {
        try { await this.client.leave(); } catch (_) {}
      }
      
      this.currentCallSession$.next(null);
      this.localVideoEnabled$.next(true);
      this.localAudioEnabled$.next(true);
      this.isScreenSharing$.next(false);
      this.remoteUsers$.next(new Map());
      
      console.log('[VideoCallService] ✅ Cleaned up failed call resources');
    } catch (error) {
      console.error('[VideoCallService] Error during cleanup:', error);
    }
  }

  /**
   * Leave current call (user-initiated)
   */
  async leaveCall(): Promise<void> {
    if (this.isLeavingCall) return;
    this.isLeavingCall = true;

    const currentCall = this.currentCallSession$.value;
    const currentUser = await this.authService.user$.pipe(take(1)).toPromise();

    if (!currentCall || !currentUser) {
      this.isLeavingCall = false;
      return;
    }

    try {
      console.log('[VideoCallService] 📞 Leaving call:', currentCall.id);

      // 1. Stop recording FIRST (needs currentCallSession$ to still be set)
      if (this.isRecording$.value) {
        await this.stopRecording();
      }

      // 2. Stop Firestore listener (so we don't react to our own status update)
      this.stopCallSessionListener();

      // 3. Close all local tracks (video, audio, screen share)
      this.closeAllLocalTracks();

      // 4. Leave Agora channel
      if (this.client) {
        try { await this.client.leave(); } catch (_) {}
      }

      // 5. Update participant record
      if (currentUser.uid) {
        try { await this.updateParticipantLeftTime(currentCall.id, currentUser.uid); } catch (_) {}
      }

      // 6. Update call session in Firestore - ALWAYS mark as ended for 1-on-1 calls
      const duration = this.calculateDuration(currentCall.startedAt);
      try {
        await updateDoc(doc(this.callSessionsCollection, currentCall.id), {
          status: 'ended' as CallStatus,
          endedAt: Timestamp.now(),
          duration,
          updatedAt: Timestamp.now()
        });
      } catch (_) {}

      // 7. Save to call history (host or initiator)
      try { await this.saveCallHistory(currentCall, duration); } catch (_) {}

      // 8. Clear state
      this.currentCallSession$.next(null);
      this.remoteUsers$.next(new Map());
      this.localVideoEnabled$.next(true);
      this.localAudioEnabled$.next(true);
      this.isScreenSharing$.next(false);

      console.log('[VideoCallService] ✅ Left call successfully');
    } catch (error) {
      console.error('[VideoCallService] Failed to leave call:', error);
    } finally {
      this.isLeavingCall = false;
    }
  }

  /**
   * Save call history when call ends
   */
  private async saveCallHistory(callSession: CallSession, duration: number): Promise<void> {
    try {
      console.log('[VideoCallService] 📝 Saving call history...');

      const currentUser = await this.authService.user$.pipe(take(1)).toPromise();
      if (!currentUser) return;

      // Get participant details from Firestore
      const participantDocs = await Promise.all(
        callSession.participantIds.map(async (participantId) => {
          const participantRef = doc(this.callParticipantsCollection, `${callSession.id}_${participantId}`);
          return docData(participantRef).pipe(take(1)).toPromise();
        })
      );

      const participantNames = participantDocs
        .filter(p => p)
        .map((p: any) => p.displayName || 'Unknown');

      const historyEntry: CallHistoryEntry = {
        id: `${callSession.id}_history`,
        callSessionId: callSession.id,
        channelName: callSession.channelName,
        callType: callSession.callType,
        
        hostId: callSession.hostId,
        hostName: currentUser.displayName || 'Unknown',
        hostPhoto: currentUser.photoURL,
        participantIds: callSession.participantIds,
        participantNames,
        
        startedAt: callSession.startedAt || Timestamp.now(),
        endedAt: Timestamp.now(),
        duration,
        
        wasVideoEnabled: callSession.isVideoEnabled,
        wasAudioEnabled: callSession.isAudioEnabled,
        wasRecorded: callSession.isRecording,
        wasScreenShared: callSession.isScreenSharing,
        recordingUrl: callSession.recordingUrl,
        
        callStatus: callSession.status,
        subject: callSession.subject,
        
        createdAt: Timestamp.now()
      };

      await setDoc(doc(this.callHistoryCollection, historyEntry.id), historyEntry);
      console.log('[VideoCallService] ✅ Call history saved');
    } catch (error) {
      console.error('[VideoCallService] ❌ Failed to save call history:', error);
    }
  }

  /**
   * Get call history for a user
   */
  getCallHistory(userId: string, limit: number = 50): Observable<CallHistoryEntry[]> {
    const q = query(
      this.callHistoryCollection,
      where('participantIds', 'array-contains', userId),
      orderBy('endedAt', 'desc')
    );
    
    return collectionData(q, { idField: 'id' }) as Observable<CallHistoryEntry[]>;
  }

  /**
   * Get call history by host
   */
  getCallHistoryByHost(hostId: string, limit: number = 50): Observable<CallHistoryEntry[]> {
    const q = query(
      this.callHistoryCollection,
      where('hostId', '==', hostId),
      orderBy('endedAt', 'desc')
    );
    
    return collectionData(q, { idField: 'id' }) as Observable<CallHistoryEntry[]>;
  }

  /**
   * Toggle local microphone
   */
  async toggleMicrophone(): Promise<boolean> {
    // If no track exists, try to create one
    if (!this.localAudioTrack) {
      try {
        console.log('[VideoCallService] 🎤 Creating new microphone track...');
        this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        if (this.localAudioTrack) {
          this.localAudioTrack.on('track-ended', () => {
            console.warn('[VideoCallService] ⚠️ Local audio track ended unexpectedly');
            this.localAudioEnabled$.next(false);
          });
        }
        if (this.client) {
          await this.client.publish([this.localAudioTrack]);
        }
        this.localAudioEnabled$.next(true);
        this.toastService.success('Microphone enabled');
        this.logCallEvent('unmute', {});
        return true;
      } catch (error: any) {
        console.error('[VideoCallService] ❌ Failed to create audio track:', error);
        this.toastService.error('Could not enable microphone');
        return false;
      }
    }

    // If track exists but is dead, recreate it
    if (this.localAudioTrack.getMediaStreamTrack()?.readyState === 'ended') {
      try {
        console.log('[VideoCallService] 🎤 Audio track dead, recreating...');
        if (this.client) {
          try { await this.client.unpublish([this.localAudioTrack]); } catch (_) {}
        }
        this.localAudioTrack.close();
        this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        if (this.localAudioTrack) {
          this.localAudioTrack.on('track-ended', () => {
            console.warn('[VideoCallService] ⚠️ Local audio track ended unexpectedly');
            this.localAudioEnabled$.next(false);
          });
        }
        if (this.client) {
          await this.client.publish([this.localAudioTrack]);
        }
        this.localAudioEnabled$.next(true);
        this.toastService.success('Microphone recovered');
        this.logCallEvent('unmute', {});
        return true;
      } catch (error: any) {
        console.error('[VideoCallService] ❌ Failed to recreate audio track:', error);
        this.localAudioTrack = null;
        this.localAudioEnabled$.next(false);
        this.toastService.error('Could not recover microphone');
        return false;
      }
    }

    // Normal toggle
    const newState = !this.localAudioTrack.enabled;
    await this.localAudioTrack.setEnabled(newState);
    this.localAudioEnabled$.next(newState);

    this.logCallEvent(newState ? 'unmute' : 'mute', {});
    return newState;
  }

  /**
   * Toggle local camera
   */
  async toggleCamera(): Promise<boolean> {
    // If no track exists, try to create one
    if (!this.localVideoTrack) {
      try {
        console.log('[VideoCallService] 📹 Creating new camera track...');
        this.localVideoTrack = await AgoraRTC.createCameraVideoTrack();
        this.attachTrackEndedHandlers();
        if (this.client) {
          await this.client.publish([this.localVideoTrack]);
        }
        this.localVideoEnabled$.next(true);
        this.toastService.success('Camera enabled');
        this.logCallEvent('camera-on', {});
        return true;
      } catch (error: any) {
        console.error('[VideoCallService] ❌ Failed to create camera track:', error);
        this.toastService.error('Could not enable camera');
        return false;
      }
    }

    // If track exists but is dead, recreate it
    if (this.localVideoTrack.getMediaStreamTrack()?.readyState === 'ended') {
      try {
        console.log('[VideoCallService] 📹 Camera track dead, recreating...');
        if (this.client) {
          try { await this.client.unpublish([this.localVideoTrack]); } catch (_) {}
        }
        this.localVideoTrack.close();
        this.localVideoTrack = await AgoraRTC.createCameraVideoTrack();
        this.attachTrackEndedHandlers();
        if (this.client) {
          await this.client.publish([this.localVideoTrack]);
        }
        this.localVideoEnabled$.next(true);
        this.toastService.success('Camera recovered');
        this.logCallEvent('camera-on', {});
        return true;
      } catch (error: any) {
        console.error('[VideoCallService] ❌ Failed to recreate camera track:', error);
        this.localVideoTrack = null;
        this.localVideoEnabled$.next(false);
        this.toastService.error('Could not recover camera');
        return false;
      }
    }

    // Normal toggle
    const newState = !this.localVideoTrack.enabled;
    await this.localVideoTrack.setEnabled(newState);
    this.localVideoEnabled$.next(newState);

    this.logCallEvent(newState ? 'camera-on' : 'camera-off', {});
    return newState;
  }

  /**
   * Start screen sharing
   */
  async startScreenShare(): Promise<void> {
    if (!this.client || this.isScreenSharing$.value) {
      console.warn('[VideoCallService] Cannot start screen share: no client or already sharing');
      return;
    }

    try {
      console.log('[VideoCallService] 🖥️ Starting screen share...');
      
      // Create screen share track
      this.screenShareTrack = await AgoraRTC.createScreenVideoTrack({
        encoderConfig: '1080p_1',
        optimizationMode: 'detail'
      }, 'auto');

      // Handle when user clicks "Stop Sharing" in browser
      if (this.screenShareTrack) {
        const track = Array.isArray(this.screenShareTrack) ? this.screenShareTrack[0] : this.screenShareTrack;
        track.on('track-ended', () => {
          console.log('[VideoCallService] Screen share ended by user');
          this.stopScreenShare();
        });

        // Unpublish camera if active, publish screen share
        if (this.localVideoTrack) {
          await this.client.unpublish([this.localVideoTrack]);
        }

        // Publish screen share track
        const tracksToPublish = Array.isArray(this.screenShareTrack) ? this.screenShareTrack : [this.screenShareTrack];
        await this.client.publish(tracksToPublish);

        this.isScreenSharing$.next(true);
        this.logCallEvent('screen-share-start', {});
        this.toastService.success('Screen sharing started');

        // Update call session
        const currentCall = this.currentCallSession$.value;
        if (currentCall) {
          await updateDoc(doc(this.callSessionsCollection, currentCall.id), {
            isScreenSharing: true
          });
        }

        console.log('[VideoCallService] ✅ Screen share started successfully');
      }
    } catch (error: any) {
      console.error('[VideoCallService] ❌ Failed to start screen share:', error);
      this.toastService.error('Failed to start screen sharing');
      this.logCallEvent('error', { error: error.message, stage: 'start_screen_share' });
    }
  }

  /**
   * Stop screen sharing
   */
  async stopScreenShare(): Promise<void> {
    if (!this.client || !this.screenShareTrack) {
      return;
    }

    try {
      console.log('[VideoCallService] 🖥️ Stopping screen share...');

      const tracksToUnpublish = Array.isArray(this.screenShareTrack) ? this.screenShareTrack : [this.screenShareTrack];
      
      // Unpublish and close screen share tracks
      await this.client.unpublish(tracksToUnpublish);
      tracksToUnpublish.forEach(track => track.close());
      
      this.screenShareTrack = null;
      this.isScreenSharing$.next(false);

      // Re-publish camera if it exists
      if (this.localVideoTrack) {
        await this.client.publish([this.localVideoTrack]);
      }

      this.logCallEvent('screen-share-stop', {});
      this.toastService.info('Screen sharing stopped');

      // Update call session
      const currentCall = this.currentCallSession$.value;
      if (currentCall) {
        await updateDoc(doc(this.callSessionsCollection, currentCall.id), {
          isScreenSharing: false
        });
      }

      console.log('[VideoCallService] ✅ Screen share stopped');
    } catch (error: any) {
      console.error('[VideoCallService] ❌ Failed to stop screen share:', error);
      this.logCallEvent('error', { error: error.message, stage: 'stop_screen_share' });
    }
  }

  /**
   * Start call recording
   */
  async startRecording(): Promise<void> {
    if (this.mediaRecorder || !this.client) {
      console.warn('[VideoCallService] Cannot start recording');
      return;
    }

    try {
      console.log('[VideoCallService] 🎥 Starting call recording...');

      // Get all audio tracks (local + remote)
      const audioTracks: MediaStreamTrack[] = [];
      
      // Add local audio
      if (this.localAudioTrack) {
        const localAudio = this.localAudioTrack.getMediaStreamTrack();
        if (localAudio) audioTracks.push(localAudio);
      }

      // Add remote audio
      this.remoteUsers$.value.forEach(user => {
        if (user.audioTrack) {
          const remoteAudio = user.audioTrack.getMediaStreamTrack();
          if (remoteAudio) audioTracks.push(remoteAudio);
        }
      });

      // Create mixed audio stream
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      
      audioTracks.forEach(track => {
        const source = audioContext.createMediaStreamSource(new MediaStream([track]));
        source.connect(destination);
      });

      // Add video track (local or screen share)
      let videoTrack: MediaStreamTrack | null = null;
      if (this.screenShareTrack) {
        const track = Array.isArray(this.screenShareTrack) ? this.screenShareTrack[0] : this.screenShareTrack;
        videoTrack = track.getMediaStreamTrack();
      } else if (this.localVideoTrack) {
        videoTrack = this.localVideoTrack.getMediaStreamTrack();
      }

      // Create combined stream
      const recordedStream = new MediaStream([
        ...destination.stream.getAudioTracks(),
        ...(videoTrack ? [videoTrack] : [])
      ]);

      // Initialize MediaRecorder
      this.mediaRecorder = new MediaRecorder(recordedStream, {
        mimeType: 'video/webm;codecs=vp8,opus',
        videoBitsPerSecond: 2500000 // 2.5 Mbps
      });

      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(1000); // Collect data every second
      this.isRecording$.next(true);
      this.logCallEvent('recording-start', {});
      this.toastService.success('Recording started');

      // Update call session
      const currentCall = this.currentCallSession$.value;
      if (currentCall) {
        await updateDoc(doc(this.callSessionsCollection, currentCall.id), {
          isRecording: true,
          recordingStartedAt: Timestamp.now()
        });
      }

      console.log('[VideoCallService] ✅ Recording started successfully');
    } catch (error: any) {
      console.error('[VideoCallService] ❌ Failed to start recording:', error);
      this.toastService.error('Failed to start recording');
      this.logCallEvent('error', { error: error.message, stage: 'start_recording' });
    }
  }

  /**
   * Stop call recording and save to Firebase Storage
   */
  async stopRecording(): Promise<string | null> {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      console.warn('[VideoCallService] No active recording to stop');
      return null;
    }

    return new Promise((resolve) => {
      this.mediaRecorder!.onstop = async () => {
        try {
          console.log('[VideoCallService] 🎥 Processing recording...');

          // Create blob from recorded chunks
          const recordingBlob = new Blob(this.recordedChunks, { type: 'video/webm' });
          const currentCall = this.currentCallSession$.value;
          
          if (!currentCall) {
            console.error('[VideoCallService] No active call session');
            resolve(null);
            return;
          }

          // Generate filename
          const timestamp = Date.now();
          const filename = `recordings/${currentCall.id}_${timestamp}.webm`;

          // Upload to Firebase Storage
          const storageRef = ref(this.storage, filename);
          await uploadBytes(storageRef, recordingBlob);
          const downloadUrl = await getDownloadURL(storageRef);

          console.log('[VideoCallService] ✅ Recording uploaded:', downloadUrl);

          // Update call session with recording URL
          await updateDoc(doc(this.callSessionsCollection, currentCall.id), {
            isRecording: false,
            recordingUrl: downloadUrl,
            recordingEndedAt: Timestamp.now()
          });

          this.isRecording$.next(false);
          this.logCallEvent('recording-stop', { recordingUrl: downloadUrl });
          this.toastService.success('Recording saved successfully');

          // Clean up
          this.recordedChunks = [];
          this.mediaRecorder = null;

          resolve(downloadUrl);
        } catch (error: any) {
          console.error('[VideoCallService] ❌ Failed to save recording:', error);
          this.toastService.error('Failed to save recording');
          this.logCallEvent('error', { error: error.message, stage: 'stop_recording' });
          resolve(null);
        }
      };

      this.mediaRecorder!.stop();
    });
  }

  /**
   * Get recording status observable
   */
  get isRecordingObservable(): Observable<boolean> {
    return this.isRecording$.asObservable();
  }

  /**
   * Generate Agora token via Cloud Function
   */
  private async generateAgoraToken(request: AgoraTokenRequest): Promise<any> {
    try {
      console.log('[VideoCallService] 🔑 Requesting Agora token for:', request);
      const generateToken = httpsCallable(this.functions, 'generateAgoraToken');
      const result = await generateToken(request);
      
      console.log('[VideoCallService] ✅ Received token response:', result.data);
      
      // Validate response
      const data = result.data as any;
      if (!data || !data.token) {
        console.error('[VideoCallService] ❌ Invalid token response:', result.data);
        throw new Error('Failed to generate Agora token: Invalid response from server');
      }
      
      return data;
    } catch (error) {
      console.error('[VideoCallService] ❌ Error generating Agora token:', error);
      throw error;
    }
  }

  /**
   * Generate numeric UID from string user ID
   */
  private generateNumericUid(userId: string): number {
    // Simple hash function to convert string to number
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Add participant to call
   */
  private async addParticipant(callSessionId: string, userId: string): Promise<void> {
    const participantId = `${callSessionId}_${userId}`;
    const currentUser = await this.authService.user$.pipe(take(1)).toPromise();

    // Ensure userRole is either 'teacher' or 'student'
    const userRole = currentUser?.role === 'teacher' || currentUser?.role === 'student' 
      ? currentUser.role 
      : 'student';

    const participant: Partial<CallParticipant> = {
      userId,
      callSessionId,
      role: 'participant',
      joinedAt: Timestamp.now(),
      isVideoEnabled: true,
      isAudioEnabled: true,
      isScreenSharing: false,
      displayName: currentUser?.displayName || 'Unknown',
      photoURL: currentUser?.photoURL,
      userRole
    };

    // Remove undefined values before saving to Firestore
    const cleanedParticipant = Object.fromEntries(
      Object.entries(participant).filter(([_, value]) => value !== undefined)
    );

    await setDoc(doc(this.callParticipantsCollection, participantId), cleanedParticipant);
  }

  /**
   * Update participant left time
   */
  private async updateParticipantLeftTime(callSessionId: string, userId: string): Promise<void> {
    const participantId = `${callSessionId}_${userId}`;
    await updateDoc(doc(this.callParticipantsCollection, participantId), {
      leftAt: Timestamp.now()
    });
  }

  /**
   * Calculate call duration
   */
  private calculateDuration(startedAt?: Timestamp): number {
    if (!startedAt) return 0;
    const now = Date.now();
    const start = startedAt.toMillis();
    return Math.floor((now - start) / 1000); // seconds
  }

  /**
   * Set up user presence tracking
   */
  private setupPresenceTracking(): void {
    this.authService.user$.subscribe(user => {
      if (user) {
        this.updatePresence('online');
      }
    });

    // Update presence to offline on window unload
    window.addEventListener('beforeunload', () => {
      this.updatePresence('offline');
    });
  }

  /**
   * Update user presence
   */
  private async updatePresence(status: UserPresence['status']): Promise<void> {
    const currentUser = await this.authService.user$.pipe(take(1)).toPromise();
    if (!currentUser) return;

    const presence: Partial<UserPresence> = {
      userId: currentUser.uid,
      status,
      lastSeen: Timestamp.now(),
      availableForCalls: status === 'online',
      currentCallSessionId: this.currentCallSession$.value?.id
    };

    // Remove undefined values before saving to Firestore
    const cleanedPresence = Object.fromEntries(
      Object.entries(presence).filter(([_, value]) => value !== undefined)
    );

    await setDoc(doc(this.userPresenceCollection, currentUser.uid), cleanedPresence, { merge: true });
  }

  /**
   * Log call event
   */
  private logCallEvent(
    type: CallEvent['type'],
    data: any,
    severity: CallEvent['severity'] = 'info'
  ): void {
    const currentCall = this.currentCallSession$.value;
    if (!currentCall) return;

    const event: Partial<CallEvent> = {
      callSessionId: currentCall.id,
      type,
      data,
      timestamp: Timestamp.now(),
      severity
    };

    this.callEvents$.next(event as CallEvent);
  }

  // ========== Observables for Components ==========

  get currentCall$(): Observable<CallSession | null> {
    return this.currentCallSession$.asObservable();
  }

  get remoteUsers$Observable(): Observable<Map<UID, IAgoraRTCRemoteUser>> {
    return this.remoteUsers$.asObservable();
  }

  get isVideoEnabled$(): Observable<boolean> {
    return this.localVideoEnabled$.asObservable();
  }

  get isAudioEnabled$(): Observable<boolean> {
    return this.localAudioEnabled$.asObservable();
  }

  get isScreenSharing$Observable(): Observable<boolean> {
    return this.isScreenSharing$.asObservable();
  }

  get networkQuality$Observable(): Observable<AgoraNetworkQuality | null> {
    return this.networkQuality$.asObservable();
  }

  get callEvents$Observable(): Observable<CallEvent> {
    return this.callEvents$.asObservable();
  }

  get callEndedByRemote$Observable(): Observable<string> {
    return this.callEndedByRemote$.asObservable();
  }

  /**
   * Get local video track for rendering
   */
  getLocalVideoTrack(): ICameraVideoTrack | null {
    return this.localVideoTrack;
  }

  /**
   * Get local audio track
   */
  getLocalAudioTrack(): IMicrophoneAudioTrack | null {
    return this.localAudioTrack;
  }

  /**
   * Get call invitations for current user
   */
  getMyInvitations(): Observable<CallInvitation[]> {
    return this.authService.user$.pipe(
      switchMap(user => {
        if (!user) return of([]);

        const q = query(
          this.callInvitationsCollection,
          where('toUserId', '==', user.uid),
          where('status', '==', 'pending'),
          orderBy('createdAt', 'desc')
        );

        return collectionData(q, { idField: 'id' }) as Observable<CallInvitation[]>;
      })
    );
  }

  /**
   * Accept call invitation
   */
  async acceptInvitation(invitationId: string): Promise<void> {
    await updateDoc(doc(this.callInvitationsCollection, invitationId), {
      status: 'accepted' as InvitationStatus,
      respondedAt: Timestamp.now()
    });

    // Get invitation to join call
    const invitation = await docData(doc(this.callInvitationsCollection, invitationId))
      .pipe(take(1))
      .toPromise() as CallInvitation;

    if (invitation) {
      // Navigate to call page - VideoCallComponent will handle joining
      console.log('[VideoCallService] 📍 Navigating to call page:', invitation.callSessionId);
      this.router.navigate(['/call', invitation.callSessionId]);
    }
  }

  /**
   * Reject call invitation
   */
  async rejectInvitation(invitationId: string, reason?: string): Promise<void> {
    const updateData: any = {
      status: 'rejected' as InvitationStatus,
      respondedAt: Timestamp.now()
    };
    
    if (reason) {
      updateData.rejectionReason = reason;
    }
    
    await updateDoc(doc(this.callInvitationsCollection, invitationId), updateData);
  }
}
