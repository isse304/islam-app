import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { CommonModule } from '@angular/common';

interface PricingTier {
  name: string;
  price: number;
  interval: 'month' | 'year';
  features: string[];
  recommended?: boolean;
}

@Component({
  selector: 'app-subscription-dialog',
  templateUrl: './subscription-dialog.component.html',
  styleUrls: ['./subscription-dialog.component.scss'],
  standalone: true,
  imports: [CommonModule]
})
export class SubscriptionDialogComponent {
  loading = false;
  selectedTier: PricingTier | null = null;
  
  pricingTiers: PricingTier[] = [
    {
      name: 'Monthly Premium',
      price: 9.99,
      interval: 'month',
      features: [
        'AI-Powered Tafsir Insights',
        'Personalized Dua Recommendations',
        'Smart Learning Assistant',
        'Priority Support'
      ]
    },
    {
      name: 'Yearly Premium',
      price: 99.99,
      interval: 'year',
      recommended: true,
      features: [
        'All Monthly Premium Features',
        '2 Months Free',
        'Advanced Analytics',
        'Offline Access',
        'Family Sharing (Up to 3 members)'
      ]
    }
  ];

  constructor(
    private dialogRef: MatDialogRef<SubscriptionDialogComponent>,
    private authService: AuthService,
    private notificationService: NotificationService,
    @Inject(MAT_DIALOG_DATA) public data: { feature: string }
  ) {}

  selectTier(tier: PricingTier) {
    this.selectedTier = tier;
  }

  async subscribe() {
    if (!this.selectedTier) return;
    
    this.loading = true;
    try {
      // Implement your subscription logic here
      // This is a placeholder - replace with actual payment processing
      await this.authService.subscribe(this.selectedTier);
      this.notificationService.success('Successfully subscribed to premium!');
      this.dialogRef.close(true);
    } catch (error) {
      this.notificationService.error('Failed to process subscription. Please try again.');
    } finally {
      this.loading = false;
    }
  }

  close() {
    this.dialogRef.close();
  }
} 