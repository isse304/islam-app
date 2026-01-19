import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';

export interface PremiumFeaturePreviewData {
  featureName: string;
  featureIcon: string;
  description: string;
  benefits: string[];
  previewImage?: string;
  mockupContent?: {
    type: 'chat' | 'search' | 'analysis';
    items: any[];
  };
  isAuthenticated: boolean;
  ctaText?: string;
}

@Component({
  selector: 'app-premium-feature-preview',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './premium-feature-preview.component.html',
  styleUrls: ['./premium-feature-preview.component.scss'],
  animations: [
    trigger('fadeInScale', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.9)' }),
        animate('400ms cubic-bezier(0.35, 0, 0.25, 1)', 
          style({ opacity: 1, transform: 'scale(1)' }))
      ])
    ]),
    trigger('slideInUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px)' }),
        animate('300ms 100ms cubic-bezier(0.35, 0, 0.25, 1)', 
          style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class PremiumFeaturePreviewComponent {
  constructor(
    public dialogRef: MatDialogRef<PremiumFeaturePreviewComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PremiumFeaturePreviewData,
    private router: Router
  ) {}

  onUpgrade(): void {
    this.dialogRef.close();
    if (this.data.isAuthenticated) {
      // User is logged in but not premium
      this.router.navigate(['/subscription'], { 
        queryParams: { feature: this.data.featureName } 
      });
    } else {
      // Anonymous user
      this.router.navigate(['/auth/signup'], { 
        queryParams: { returnUrl: '/dua', feature: this.data.featureName } 
      });
    }
  }

  onSignIn(): void {
    this.dialogRef.close();
    this.router.navigate(['/auth/login'], { 
      queryParams: { returnUrl: '/dua', feature: this.data.featureName } 
    });
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
