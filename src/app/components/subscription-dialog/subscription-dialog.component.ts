import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { CommonModule } from '@angular/common';

interface PricingTier {
  name: string;
  price: number;
  interval: 'month';
  features: string[];
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
        'AI-Powered Dua Insights & Analysis',
        'Dua Recommendations based on emotional state',
        'Smart Quran Learning Assistant',
        'AI Tafsir Generation',
        'Personalized Learning Path',
        'Unlimited AI-Generated Reflections'
      ]
    }
  ];

  constructor(
    public dialogRef: MatDialogRef<SubscriptionDialogComponent>,
    private authService: AuthService,
    private notificationService: NotificationService,
    @Inject(MAT_DIALOG_DATA) public data: { feature: string }
  ) {
    this.selectedTier = this.pricingTiers[0];
  }

  close() {
    this.dialogRef.close(false);
  }

  async subscribe() {
    if (!this.selectedTier) return;
    
    this.loading = true;
    try {
      await this.authService.subscribe(this.selectedTier);
      this.notificationService.success('Successfully subscribed to premium!');
      this.dialogRef.close(true);
    } catch (error) {
      this.notificationService.error('Failed to process subscription. Please try again.');
    } finally {
      this.loading = false;
    }
  }
} 