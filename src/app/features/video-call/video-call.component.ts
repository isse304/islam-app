import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription } from 'rxjs';
import { VideoCallService } from '../../services/video-call.service';
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
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

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

  ngOnInit(): void {
    // Get call session ID from route
    const callSessionId = this.route.snapshot.paramMap.get('id');
    if (!callSessionId) {
      console.error('[VideoCallComponent] No call session ID provided');
      this.router.navigate(['/']);
      return;
    }

    // Join the call
    this.joinCall(callSessionId);

    // Subscribe to call state
    this.setupSubscriptions();
  }

  ngAfterViewInit(): void {
    // Play local video track
    setTimeout(() => {
      this.playLocalVideo();
    }, 1000);
  }

  ngOnDestroy(): void {
    // Clean up
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
    }
    
    // Leave call
    this.videoCallService.leaveCall();
  }

  /**
   * Join the call session
   */
  private async joinCall(callSessionId: string): Promise<void> {
    try {
      this.isConnecting = true;
      this.cdr.detectChanges();
      
      await this.videoCallService.joinCall(callSessionId);
      
      this.isConnecting = false;
      this.cdr.detectChanges();
      console.log('[VideoCallComponent] 🎥 Call joined, UI should now be visible');
      
      // Start duration counter
      this.startDurationCounter();
    } catch (error) {
      console.error('[VideoCallComponent] Failed to join call:', error);
      this.isConnecting = false;
      this.cdr.detectChanges();
      // Error is already handled in VideoCallService with toast
      this.router.navigate(['/dashboard']);
    }
  }

  /**
   * Set up subscriptions to service observables
   */
  private setupSubscriptions(): void {
    // Current call session
    this.subscriptions.push(
      this.videoCallService.currentCall$.subscribe(session => {
        this.callSession = session;
        // Hide connecting overlay when call session is established
        if (session) {
          this.isConnecting = false;
          console.log('[VideoCallComponent] ✅ Call session established, hiding connecting overlay');
          this.cdr.detectChanges();
        }
      })
    );

    // Video enabled state
    this.subscriptions.push(
      this.videoCallService.isVideoEnabled$.subscribe((enabled: boolean) => {
        this.isVideoEnabled = enabled;
      })
    );

    // Audio enabled state
    this.subscriptions.push(
      this.videoCallService.isAudioEnabled$.subscribe((enabled: boolean) => {
        this.isAudioEnabled = enabled;
      })
    );

    // Screen sharing state
    this.subscriptions.push(
      this.videoCallService.isScreenSharing$Observable.subscribe((sharing: boolean) => {
        this.isScreenSharing = sharing;
      })
    );

    // Recording state
    this.subscriptions.push(
      this.videoCallService.isRecordingObservable.subscribe((recording: boolean) => {
        this.isRecording = recording;
        this.cdr.detectChanges();
      })
    );

    // Remote users
    this.subscriptions.push(
      this.videoCallService.remoteUsers$Observable.subscribe((users: Map<UID, IAgoraRTCRemoteUser>) => {
        this.remoteUsers = users;
        this.playRemoteVideos();
        this.cdr.detectChanges();
      })
    );

    // Network quality
    this.subscriptions.push(
      this.videoCallService.networkQuality$Observable.subscribe((quality: any) => {
        if (quality) {
          this.networkQuality = this.getNetworkQualityText(quality.uplinkNetworkQuality);
        }
      })
    );
  }

  /**
   * Play local video in container
   */
  private playLocalVideo(): void {
    const localTrack = this.videoCallService.getLocalVideoTrack();
    if (localTrack && this.localVideoContainer) {
      localTrack.play(this.localVideoContainer.nativeElement);
    }
  }

  /**
   * Play remote videos in container
   */
  private playRemoteVideos(): void {
    if (!this.remoteVideoContainer) return;

    // Clear existing remote videos
    this.remoteVideoContainer.nativeElement.innerHTML = '';

    // Play each remote user's video
    this.remoteUsers.forEach((user, uid) => {
      if (user.videoTrack) {
        const playerDiv = document.createElement('div');
        playerDiv.id = `remote-${uid}`;
        playerDiv.className = 'remote-player';
        this.remoteVideoContainer.nativeElement.appendChild(playerDiv);
        
        user.videoTrack.play(playerDiv);
      }
    });
  }

  /**
   * Toggle microphone
   */
  async toggleMicrophone(): Promise<void> {
    const newState = await this.videoCallService.toggleMicrophone();
    this.isAudioEnabled = newState;
  }

  /**
   * Toggle camera
   */
  async toggleCamera(): Promise<void> {
    const newState = await this.videoCallService.toggleCamera();
    this.isVideoEnabled = newState;
  }

  /**
   * Toggle screen share
   */
  async toggleScreenShare(): Promise<void> {
    if (this.isScreenSharing) {
      await this.videoCallService.stopScreenShare();
    } else {
      await this.videoCallService.startScreenShare();
    }
  }

  /**
   * Toggle recording
   */
  async toggleRecording(): Promise<void> {
    if (this.isRecording) {
      await this.videoCallService.stopRecording();
    } else {
      await this.videoCallService.startRecording();
    }
  }

  /**
   * End the call
   */
  async endCall(): Promise<void> {
    if (confirm('Are you sure you want to end the call?')) {
      await this.videoCallService.leaveCall();
      this.router.navigate(['/']);
    }
  }

  /**
   * Start call duration counter
   */
  private startDurationCounter(): void {
    this.durationInterval = setInterval(() => {
      this.callDuration++;
    }, 1000);
  }

  /**
   * Get formatted call duration
   */
  get formattedDuration(): string {
    const hours = Math.floor(this.callDuration / 3600);
    const minutes = Math.floor((this.callDuration % 3600) / 60);
    const seconds = this.callDuration % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Get network quality text
   */
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

  /**
   * Get network quality icon
   */
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

  /**
   * Get remote user count
   */
  get remoteUserCount(): number {
    return this.remoteUsers.size;
  }
}
