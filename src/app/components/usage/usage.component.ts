import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CommonModule } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';

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
    MatProgressBarModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './usage.component.html',
  styleUrls: ['./usage.component.scss']
})
export class UsageComponent implements OnInit {
  usageLimits: UsageLimits | null = null;
  loading = false;
  error: string | null = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.fetchUsageLimits();
  }

  async fetchUsageLimits() {
    try {
      this.loading = true;
      this.error = null;
      const response = await firstValueFrom(this.http.get<UsageLimits>(`${environment.apiUrl}/api/usage/limits`));
      this.usageLimits = response;
    } catch (err: any) {
      console.error('Error fetching usage limits:', err);
      this.error = err.message || 'Failed to fetch usage limits. Please try again later.';
      this.usageLimits = null;
    } finally {
      this.loading = false;
    }
  }

  getStatusMessage(): string {
    if (!this.usageLimits) return '';
    
    switch (this.usageLimits.status) {
      case 'active':
        return 'Active Subscription';
      case 'free':
        return 'Free Plan';
      default:
        return '';
    }
  }

  getUsedRequests(): number {
    return this.usageLimits?.aiRequests?.used ?? 0;
  }

  getTotalRequests(): number {
    return this.usageLimits?.aiRequests?.total ?? 0;
  }

  getProgressWidth(): number {
    if (!this.usageLimits?.aiRequests) return 0;
    const { used, total } = this.usageLimits.aiRequests;
    return Math.min((used / total) * 100, 100);
  }

  subscribe() {
    window.location.href = '/subscription';
  }
} 