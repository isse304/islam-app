import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { VideoCallService } from '../../services/video-call.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-start-call-button',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule
  ],
  template: `
    <button mat-mini-fab
            [color]="color"
            [matTooltip]="tooltipText"
            [disabled]="isLoading"
            (click)="startCall()"
            class="call-btn">
      <mat-icon *ngIf="!isLoading">{{ icon }}</mat-icon>
      <mat-icon *ngIf="isLoading" class="spinning">sync</mat-icon>
    </button>
  `,
  styles: [`
    .call-btn {
      box-shadow: 0 4px 12px rgba(183, 165, 122, 0.3);
      transition: all 0.3s ease;
      
      &:hover:not(:disabled) {
        transform: translateY(-2px) scale(1.05);
        box-shadow: 0 6px 20px rgba(183, 165, 122, 0.4);
      }
      
      &:active:not(:disabled) {
        transform: scale(0.95);
      }
    }
    
    .spinning {
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `]
})
export class StartCallButtonComponent {
  @Input() userId!: string; // User to call (student or teacher)
  @Input() userName?: string; // Name of the user
  @Input() subject?: string; // Call subject (e.g., "Math Help")
  @Input() message?: string; // Optional message
  @Input() classId?: string; // Optional class context
  @Input() assignmentId?: string; // Optional assignment context
  @Input() icon: string = 'videocam'; // Icon to display
  @Input() color: 'primary' | 'accent' | 'warn' = 'primary'; // Button color
  @Input() tooltipText: string = 'Start video call'; // Tooltip

  private videoCallService = inject(VideoCallService);
  private toastService = inject(ToastService);
  private router = inject(Router);

  isLoading = false;

  async startCall(): Promise<void> {
    if (!this.userId) {
      this.toastService.error('Cannot start call: User ID is required');
      return;
    }

    this.isLoading = true;

    try {
      console.log('[StartCallButton] Starting call to:', this.userName || this.userId);

      const callSession = await this.videoCallService.createCall({
        participantIds: [this.userId],
        callType: 'one-on-one',
        subject: this.subject,
        message: this.message,
        classId: this.classId,
        assignmentId: this.assignmentId
      });

      console.log('[StartCallButton] Call created:', callSession.id);
      this.toastService.success(`Call invitation sent to ${this.userName || 'user'}`);
      
      // Navigate teacher to call page
      console.log('[StartCallButton] 📍 Navigating to call page');
      this.router.navigate(['/call', callSession.id]);

    } catch (error) {
      console.error('[StartCallButton] Error creating call:', error);
      this.toastService.error('Failed to start call. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }
}
