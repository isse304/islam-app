import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription } from 'rxjs';
import { VideoCallService } from '../../services/video-call.service';
import { FirebaseAuthService } from '../../services/firebase-auth.service';
import { CallHistoryEntry } from '../../models/video-call.models';

@Component({
  selector: 'app-call-history',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatTooltipModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './call-history.component.html',
  styleUrls: ['./call-history.component.scss']
})
export class CallHistoryComponent implements OnInit, OnDestroy {
  private videoCallService = inject(VideoCallService);
  private authService = inject(FirebaseAuthService);

  callHistory: CallHistoryEntry[] = [];
  filteredHistory: CallHistoryEntry[] = [];
  isLoading = true;
  filterType: 'all' | 'outgoing' | 'incoming' = 'all';
  
  private subscriptions: Subscription[] = [];

  ngOnInit(): void {
    this.loadCallHistory();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private async loadCallHistory(): Promise<void> {
    this.isLoading = true;
    
    const currentUser = await this.authService.user$.toPromise();
    if (!currentUser?.uid) {
      this.isLoading = false;
      return;
    }

    this.subscriptions.push(
      this.videoCallService.getCallHistory(currentUser.uid).subscribe(history => {
        this.callHistory = history;
        this.applyFilter();
        this.isLoading = false;
      })
    );
  }

  applyFilter(): void {
    const currentUserId = this.authService.getCurrentUser()?.uid;
    
    if (this.filterType === 'all') {
      this.filteredHistory = this.callHistory;
    } else if (this.filterType === 'outgoing') {
      this.filteredHistory = this.callHistory.filter(h => h.hostId === currentUserId);
    } else {
      this.filteredHistory = this.callHistory.filter(h => h.hostId !== currentUserId);
    }
  }

  setFilter(filter: 'all' | 'outgoing' | 'incoming'): void {
    this.filterType = filter;
    this.applyFilter();
  }

  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  }

  formatDate(timestamp: any): string {
    const date = timestamp.toDate();
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'long' }) + ' at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  }

  downloadRecording(recordingUrl: string): void {
    window.open(recordingUrl, '_blank');
  }

  getCallTypeIcon(entry: CallHistoryEntry): string {
    const currentUserId = this.authService.getCurrentUser()?.uid;
    return entry.hostId === currentUserId ? 'call_made' : 'call_received';
  }

  getCallTypeLabel(entry: CallHistoryEntry): string {
    const currentUserId = this.authService.getCurrentUser()?.uid;
    return entry.hostId === currentUserId ? 'Outgoing' : 'Incoming';
  }

  getParticipantsDisplay(entry: CallHistoryEntry): string {
    if (entry.participantNames.length === 0) {
      return 'No participants';
    } else if (entry.participantNames.length === 1) {
      return entry.participantNames[0];
    } else if (entry.participantNames.length === 2) {
      return entry.participantNames.join(' and ');
    } else {
      return `${entry.participantNames[0]} and ${entry.participantNames.length - 1} others`;
    }
  }
}
