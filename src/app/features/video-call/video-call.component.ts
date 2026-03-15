import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, inject, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription } from 'rxjs';
import { VideoCallService } from '../../services/video-call.service';
import { ToastService } from '../../services/toast.service';
import { CallSession } from '../../models/video-call.models';
import { UID, IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';

@Component({
  selector: 'app-video-call',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './video-call.component.html',
  styleUrls: ['./video-call.component.scss']
})
export class VideoCallComponent implements OnInit, OnDestroy, AfterViewInit {
  private videoCallService = inject(VideoCallService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  @ViewChild('localVideoContainer') localVideoContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('remoteVideoContainer') remoteVideoContainer!: ElementRef<HTMLDivElement>;

  // State
  callSession: CallSession | null = null;
  isVideoEnabled = true;
  isAudioEnabled = true;
  isScreenSharing = false;
  isRecording = false;
  isConnecting = true;
  remoteUsers = new Map<UID, IAgoraRTCRemoteUser>();
  callDuration = 0;
  networkQuality: string = 'Excellent';

  // Subscriptions
  private subscriptions: Subscription[] = [];
  private durationInterval: any;
  private viewReady = false;
  private callJoined = false;
  private visibilityHandler: (() => void) | null = null;

  ngOnInit(): void {
    const callSessionId = this.route.snapshot.paramMap.get('id');
    if (!callSessionId) {
      console.error('[VideoCallComponent] No call session ID provided');
      this.router.navigate(['/']);
      return;
    }

    this.joinCall(callSessionId);
    this.setupSubscriptions();
    this.setupVisibilityHandler();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    // If call already joined before view was ready, play now
    if (this.callJoined) {
      this.safePlayLocalVideo();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    // leaveCall() is idempotent and guards against double-leave
    this.videoCallService.leaveCall();
  }

  /**
   * Handle PC lock/unlock and tab switching via visibilitychange
   */
  private setupVisibilityHandler(): void {
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible' && this.callJoined) {
        console.log('[VideoCallComponent] 👁️ Page became visible, recovering tracks...');
        this.ngZone.run(async () => {
          await this.videoCallService.recoverTracks();
          // Re-play local video after recovery
          setTimeout(() => {
            this.safePlayLocalVideo();
            this.playRemoteVideos();
            this.cdr.detectChanges();
          }, 500);
        });
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  /**
   * Join the call session
   */
  private async joinCall(callSessionId: string): Promise<void> {
    try {
      this.isConnecting = true;
      this.cdr.detectChanges();

      await this.videoCallService.joinCall(callSessionId);

      this.callJoined = true;
      this.isConnecting = false;
      this.cdr.detectChanges();
      console.log('[VideoCallComponent] 🎥 Call joined successfully');

      // Play local video after a frame so the container is rendered
      setTimeout(() => this.safePlayLocalVideo(), 100);

      this.startDurationCounter();
    } catch (error) {
      console.error('[VideoCallComponent] Failed to join call:', error);
      this.isConnecting = false;
      this.cdr.detectChanges();
      this.router.navigate(['/home']);
    }
  }

  /**
   * Set up subscriptions to service observables
   */
  private setupSubscriptions(): void {
    this.subscriptions.push(
      this.videoCallService.currentCall$.subscribe(session => {
        this.callSession = session;
        if (session) {
          this.isConnecting = false;
          this.cdr.detectChanges();
        }
      })
    );

    this.subscriptions.push(
      this.videoCallService.isVideoEnabled$.subscribe((enabled: boolean) => {
        const changed = this.isVideoEnabled !== enabled;
        this.isVideoEnabled = enabled;
        this.cdr.detectChanges();
        // When camera turns back on, re-play into the container
        if (changed && enabled) {
          setTimeout(() => this.safePlayLocalVideo(), 100);
        }
      })
    );

    this.subscriptions.push(
      this.videoCallService.isAudioEnabled$.subscribe((enabled: boolean) => {
        this.isAudioEnabled = enabled;
        this.cdr.detectChanges();
      })
    );

    this.subscriptions.push(
      this.videoCallService.isScreenSharing$Observable.subscribe((sharing: boolean) => {
        this.isScreenSharing = sharing;
        this.cdr.detectChanges();
      })
    );

    this.subscriptions.push(
      this.videoCallService.isRecordingObservable.subscribe((recording: boolean) => {
        this.isRecording = recording;
        this.cdr.detectChanges();
      })
    );

    this.subscriptions.push(
      this.videoCallService.remoteUsers$Observable.subscribe((users: Map<UID, IAgoraRTCRemoteUser>) => {
        this.remoteUsers = users;
        this.playRemoteVideos();
        this.cdr.detectChanges();
      })
    );

    this.subscriptions.push(
      this.videoCallService.networkQuality$Observable.subscribe((quality: any) => {
        if (quality) {
          this.networkQuality = this.getNetworkQualityText(quality.uplinkNetworkQuality);
          this.cdr.detectChanges();
        }
      })
    );

    // Listen for call ended by the other party
    this.subscriptions.push(
      this.videoCallService.callEndedByRemote$Observable.subscribe((reason: string) => {
        console.log('[VideoCallComponent] 📞 Call ended remotely:', reason);
        this.toastService.info(reason);
        if (this.durationInterval) {
          clearInterval(this.durationInterval);
        }
        this.router.navigate(['/home']);
      })
    );
  }

  /**
   * Safely play local video - checks that both the view and track are ready
   */
  private safePlayLocalVideo(): void {
    if (!this.viewReady || !this.localVideoContainer) {
      console.log('[VideoCallComponent] ⏳ View not ready for local video');
      return;
    }

    const localTrack = this.videoCallService.getLocalVideoTrack();
    if (!localTrack) {
      console.log('[VideoCallComponent] ⏳ No local video track available');
      return;
    }

    try {
      // Stop any existing playback first
      try { localTrack.stop(); } catch (_) {}

      localTrack.play(this.localVideoContainer.nativeElement);
      console.log('[VideoCallComponent] ✅ Local video playing');
    } catch (error) {
      console.error('[VideoCallComponent] ❌ Failed to play local video:', error);
    }
  }

  /**
   * Play remote videos in container
   */
  private playRemoteVideos(): void {
    if (!this.remoteVideoContainer) return;

    this.remoteVideoContainer.nativeElement.innerHTML = '';

    this.remoteUsers.forEach((user, uid) => {
      // Play video
      if (user.videoTrack) {
        const playerDiv = document.createElement('div');
        playerDiv.id = `remote-${uid}`;
        playerDiv.className = 'remote-player';
        this.remoteVideoContainer.nativeElement.appendChild(playerDiv);
        user.videoTrack.play(playerDiv);
      }

      // Play audio (critical - was missing!)
      if (user.audioTrack) {
        user.audioTrack.play();
      }
    });
  }

  async toggleMicrophone(): Promise<void> {
    const newState = await this.videoCallService.toggleMicrophone();
    this.isAudioEnabled = newState;
    this.cdr.detectChanges();
  }

  async toggleCamera(): Promise<void> {
    const newState = await this.videoCallService.toggleCamera();
    this.isVideoEnabled = newState;
    this.cdr.detectChanges();
    // Re-play into container when turning camera back on
    if (newState) {
      setTimeout(() => this.safePlayLocalVideo(), 100);
    }
  }

  async toggleScreenShare(): Promise<void> {
    if (this.isScreenSharing) {
      await this.videoCallService.stopScreenShare();
    } else {
      await this.videoCallService.startScreenShare();
    }
  }

  async toggleRecording(): Promise<void> {
    if (this.isRecording) {
      await this.videoCallService.stopRecording();
    } else {
      await this.videoCallService.startRecording();
    }
  }

  async endCall(): Promise<void> {
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
    }
    await this.videoCallService.leaveCall();
    this.toastService.info('Call ended');
    this.router.navigate(['/home']);
  }

  private startDurationCounter(): void {
    this.durationInterval = setInterval(() => {
      this.callDuration++;
      this.cdr.detectChanges();
    }, 1000);
  }

  get formattedDuration(): string {
    const hours = Math.floor(this.callDuration / 3600);
    const minutes = Math.floor((this.callDuration % 3600) / 60);
    const seconds = this.callDuration % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  private getNetworkQualityText(quality: number): string {
    switch (quality) {
      case 0: return 'Unknown';
      case 1: return 'Excellent';
      case 2: return 'Good';
      case 3: return 'Fair';
      case 4: return 'Poor';
      case 5: return 'Very Poor';
      case 6: return 'Disconnected';
      default: return 'Unknown';
    }
  }

  get networkQualityIcon(): string {
    switch (this.networkQuality) {
      case 'Excellent':
      case 'Good':
        return 'signal_wifi_4_bar';
      case 'Fair':
        return 'signal_wifi_3_bar';
      case 'Poor':
        return 'signal_wifi_2_bar';
      case 'Very Poor':
        return 'signal_wifi_1_bar';
      default:
        return 'signal_wifi_off';
    }
  }

  get remoteUserCount(): number {
    return this.remoteUsers.size;
  }
}
