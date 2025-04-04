import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CommonModule } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterModule } from '@angular/router';
import { firstValueFrom, Subscription, interval } from 'rxjs';
import { FirebaseAuthService } from '../../services/firebase-auth.service';

interface UsageLimits {
  status: 'free' | 'active';
  aiRequests: {
    total: number;
    used: number;
    remaining: number;
  };
}

@Component({
  selector: 'app-usage',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatProgressBarModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './usage.component.html',
  styleUrls: ['./usage.component.scss']
})
export class UsageComponent implements OnInit, OnDestroy {
  usageLimits: UsageLimits | null = null;
  isPremiumUser = false;
  loading = true;
  error: string | null = null;
  resetTimeRemaining: string | null = null;
  private userSubscription: Subscription | null = null;
  private resetTimerInterval: any = null;

  constructor(
    private http: HttpClient,
    private authService: FirebaseAuthService
  ) {}

  ngOnInit() {
    this.loading = true;
    this.userSubscription = this.authService.user$.subscribe(user => {
      this.isPremiumUser = user?.isPremium || false;
      if (this.isPremiumUser) {
        this.fetchUsageLimits();
      } else {
        this.loading = false;
        this.usageLimits = null;
        this.clearResetTimer();
      }
    });
  }

  ngOnDestroy(): void {
    this.userSubscription?.unsubscribe();
    this.clearResetTimer();
  }

  async fetchUsageLimits() {
    try {
      this.loading = true;
      this.error = null;
      this.clearResetTimer();
      const response = await firstValueFrom(this.http.get<UsageLimits>(`${environment.apiUrl}/api/usage/limits`));
      this.usageLimits = response;

      if (this.usageLimits && this.usageLimits.aiRequests.used >= this.usageLimits.aiRequests.total && this.usageLimits.aiRequests.total > 0) {
        this.startResetTimer();
      }

    } catch (err: any) {
      console.error('Error fetching usage limits:', err);
      if (err.status === 403) {
         this.error = 'Usage information is only available for premium users.';
         this.isPremiumUser = false;
      } else {
         this.error = err.message || 'Failed to fetch usage limits. Please try again later.';
      }
      this.usageLimits = null;
      this.clearResetTimer();
    } finally {
      this.loading = false;
    }
  }

  private startResetTimer(): void {
    this.clearResetTimer();
    this.updateResetTimer();
    this.resetTimerInterval = setInterval(() => {
      this.updateResetTimer();
    }, 1000);
  }

  private updateResetTimer(): void {
    const msUntilReset = this.calculateMsUntilNextMidnight();

    if (msUntilReset <= 0) {
      this.clearResetTimer();
      this.fetchUsageLimits();
    } else {
      this.resetTimeRemaining = this.formatTimeRemaining(msUntilReset);
    }
  }

  private calculateMsUntilNextMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  }

  private formatTimeRemaining(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num: number) => num.toString().padStart(2, '0');

    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  private clearResetTimer(): void {
    if (this.resetTimerInterval) {
      clearInterval(this.resetTimerInterval);
      this.resetTimerInterval = null;
    }
    this.resetTimeRemaining = null;
  }

  getStatusMessage(): string {
    if (!this.isPremiumUser) return 'Free Plan';
    if (!this.usageLimits) return '';
    
    switch (this.usageLimits.status) {
      case 'active':
        return 'Active Subscription';
      default:
        return 'Free Plan';
    }
  }

  getUsedRequests(): number {
    return this.usageLimits?.aiRequests?.used ?? 0;
  }

  getTotalRequests(): number {
    return this.usageLimits?.aiRequests?.total ?? 0;
  }

  getProgressWidth(): number {
    if (!this.usageLimits?.aiRequests || this.usageLimits.aiRequests.total <= 0) return 0;
    const { used, total } = this.usageLimits.aiRequests;
    return Math.min((used / total) * 100, 100);
  }

  subscribe() {
    window.location.href = '/subscription';
  }
} 