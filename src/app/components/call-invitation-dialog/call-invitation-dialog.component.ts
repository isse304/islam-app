import { Component, inject, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CallInvitation } from '../../models/video-call.models';

@Component({
  selector: 'app-call-invitation-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ],
  template: `
    <div class="invitation-dialog">
      <div class="dialog-header">
        <div class="caller-avatar">
          <img *ngIf="invitation.fromUserPhoto" 
               [src]="invitation.fromUserPhoto" 
               [alt]="invitation.fromUserName">
          <mat-icon *ngIf="!invitation.fromUserPhoto">account_circle</mat-icon>
        </div>
        
        <h2 class="caller-name">{{ invitation.fromUserName }}</h2>
        <p class="call-type">{{ getCallTypeText() }}</p>
        
        <div class="ringing-animation">
          <div class="ring"></div>
          <div class="ring"></div>
          <div class="ring"></div>
        </div>
      </div>

      <div class="dialog-content">
        <p class="call-subject" *ngIf="invitation.subject">
          <mat-icon>topic</mat-icon>
          {{ invitation.subject }}
        </p>
        
        <p class="call-message" *ngIf="invitation.message">
          {{ invitation.message }}
        </p>
        
        <div class="call-info">
          <span *ngIf="invitation.estimatedDuration">
            <mat-icon>schedule</mat-icon>
            {{ invitation.estimatedDuration }} min
          </span>
        </div>
      </div>

      <div class="dialog-actions">
        <button mat-fab 
                color="warn" 
                class="decline-btn"
                (click)="decline()"
                [disabled]="isProcessing">
          <mat-icon>call_end</mat-icon>
        </button>
        
        <button mat-fab 
                color="primary" 
                class="accept-btn"
                (click)="accept()"
                [disabled]="isProcessing">
          <mat-icon>call</mat-icon>
        </button>
      </div>

      <div class="auto-dismiss-timer" *ngIf="!isProcessing">
        Auto-dismiss in {{ remainingSeconds }}s
      </div>
    </div>
  `,
  styles: [`
    .invitation-dialog {
      padding: 0;
      width: 400px;
      max-width: 90vw;
      background: linear-gradient(135deg, #1A365D 0%, #0F2847 100%);
      color: white;
      border-radius: 24px;
      overflow: hidden;
      position: relative;
      
      &::before {
        content: '';
        position: absolute;
        inset: 0;
        background: url('/assets/islamic-pattern-2.png');
        background-size: 200px;
        opacity: 0.05;
        pointer-events: none;
      }
    }

    .dialog-header {
      padding: 2.5rem 2rem 2rem;
      text-align: center;
      position: relative;
      z-index: 1;
      
      .caller-avatar {
        width: 100px;
        height: 100px;
        margin: 0 auto 1.5rem;
        border-radius: 50%;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(212, 197, 160, 0.3);
        border: 4px solid rgba(212, 197, 160, 0.5);
        position: relative;
        
        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        mat-icon {
          font-size: 100px;
          width: 100px;
          height: 100px;
          color: #D4C5A0;
        }
      }
      
      .caller-name {
        font-size: 1.75rem;
        font-weight: 600;
        margin: 0 0 0.5rem;
        color: #D4C5A0;
      }
      
      .call-type {
        font-size: 1rem;
        color: rgba(255, 255, 255, 0.8);
        margin: 0;
      }
    }

    .ringing-animation {
      position: absolute;
      top: 2.5rem;
      left: 50%;
      transform: translateX(-50%);
      width: 100px;
      height: 100px;
      
      .ring {
        position: absolute;
        inset: 0;
        border: 2px solid rgba(212, 197, 160, 0.5);
        border-radius: 50%;
        animation: ring-pulse 1.5s ease-out infinite;
        
        &:nth-child(2) {
          animation-delay: 0.5s;
        }
        
        &:nth-child(3) {
          animation-delay: 1s;
        }
      }
    }

    @keyframes ring-pulse {
      0% {
        transform: scale(1);
        opacity: 1;
      }
      100% {
        transform: scale(1.8);
        opacity: 0;
      }
    }

    .dialog-content {
      padding: 0 2rem 1.5rem;
      position: relative;
      z-index: 1;
      
      .call-subject {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: rgba(212, 197, 160, 0.15);
        padding: 0.75rem 1rem;
        border-radius: 12px;
        margin-bottom: 1rem;
        
        mat-icon {
          color: #D4C5A0;
          font-size: 20px;
          width: 20px;
          height: 20px;
        }
      }
      
      .call-message {
        color: rgba(255, 255, 255, 0.9);
        font-size: 0.95rem;
        line-height: 1.5;
        margin-bottom: 1rem;
      }
      
      .call-info {
        display: flex;
        justify-content: center;
        gap: 1rem;
        color: rgba(255, 255, 255, 0.7);
        font-size: 0.9rem;
        
        span {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          
          mat-icon {
            font-size: 18px;
            width: 18px;
            height: 18px;
          }
        }
      }
    }

    .dialog-actions {
      display: flex;
      justify-content: center;
      gap: 3rem;
      padding: 0 2rem 2rem;
      position: relative;
      z-index: 1;
      
      button {
        width: 72px;
        height: 72px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        
        mat-icon {
          font-size: 32px;
          width: 32px;
          height: 32px;
        }
        
        &:disabled {
          opacity: 0.5;
        }
      }
      
      .decline-btn {
        background: linear-gradient(135deg, #EF4444, #DC2626);
        
        &:hover:not(:disabled) {
          background: linear-gradient(135deg, #DC2626, #B91C1C);
          transform: scale(1.05);
        }
      }
      
      .accept-btn {
        background: linear-gradient(135deg, #10B981, #059669);
        
        &:hover:not(:disabled) {
          background: linear-gradient(135deg, #059669, #047857);
          transform: scale(1.05);
        }
      }
    }

    .auto-dismiss-timer {
      text-align: center;
      padding: 0 2rem 1.5rem;
      font-size: 0.85rem;
      color: rgba(255, 255, 255, 0.6);
      position: relative;
      z-index: 1;
    }

    /* Dark mode (already dark by default) */
    :host-context(.dark) {
      .invitation-dialog {
        background: linear-gradient(135deg, #0A1628 0%, #152238 100%);
      }
    }
  `]
})
export class CallInvitationDialogComponent {
  private dialogRef = inject(MatDialogRef<CallInvitationDialogComponent>);
  
  invitation: CallInvitation;
  isProcessing = false;
  remainingSeconds = 60;
  private timer: any;

  constructor(@Inject(MAT_DIALOG_DATA) public data: { invitation: CallInvitation }) {
    this.invitation = data.invitation;
    this.startTimer();
  }

  ngOnDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private startTimer() {
    this.timer = setInterval(() => {
      this.remainingSeconds--;
      
      if (this.remainingSeconds <= 0) {
        this.autoDismiss();
      }
    }, 1000);
  }

  getCallTypeText(): string {
    if (this.invitation.fromUserRole === 'teacher') {
      return 'Teacher calling...';
    } else if (this.invitation.fromUserRole === 'student') {
      return 'Student calling...';
    }
    return 'Incoming call...';
  }

  accept() {
    this.isProcessing = true;
    this.dialogRef.close({ action: 'accept', invitation: this.invitation });
  }

  decline() {
    this.isProcessing = true;
    this.dialogRef.close({ action: 'decline', invitation: this.invitation });
  }

  private autoDismiss() {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.dialogRef.close({ action: 'timeout', invitation: this.invitation });
  }
}
