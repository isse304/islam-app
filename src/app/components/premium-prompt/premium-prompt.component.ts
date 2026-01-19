import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';

export interface PremiumPromptData {
  feature: string;
  benefits?: string[];
}

/**
 * Premium Prompt Component
 * 
 * A reusable modal that prompts users to upgrade to premium
 * when they try to access premium-only features.
 */
@Component({
  selector: 'app-premium-prompt',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="premium-prompt">
      <div class="text-center">
        <!-- Premium Icon -->
        <div class="flex justify-center mb-4">
          <mat-icon class="text-[#B7A57A] text-7xl">workspace_premium</mat-icon>
        </div>

        <!-- Title -->
        <h2 mat-dialog-title class="text-2xl font-bold text-gray-800 dark:text-white mb-2">
          {{ data.feature }}
        </h2>
        
        <p class="text-gray-600 dark:text-gray-300 mb-6">
          This is a premium feature. Upgrade to unlock all premium benefits!
        </p>

        <!-- Benefits List -->
        <div *ngIf="data.benefits && data.benefits.length > 0" class="text-left mb-6 bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <h3 class="font-semibold text-gray-800 dark:text-white mb-3">Premium Includes:</h3>
          <ul class="space-y-2">
            <li *ngFor="let benefit of data.benefits" class="flex items-start gap-2">
              <mat-icon class="text-[#B7A57A] text-xl mt-0.5">check_circle</mat-icon>
              <span class="text-gray-700 dark:text-gray-300">{{ benefit }}</span>
            </li>
          </ul>
        </div>

        <!-- Default Benefits if none provided -->
        <div *ngIf="!data.benefits || data.benefits.length === 0" class="text-left mb-6 bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <h3 class="font-semibold text-gray-800 dark:text-white mb-3">Premium Includes:</h3>
          <ul class="space-y-2">
            <li class="flex items-start gap-2">
              <mat-icon class="text-[#B7A57A] text-xl mt-0.5">check_circle</mat-icon>
              <span class="text-gray-700 dark:text-gray-300">AI-powered Tafsir Chat</span>
            </li>
            <li class="flex items-start gap-2">
              <mat-icon class="text-[#B7A57A] text-xl mt-0.5">check_circle</mat-icon>
              <span class="text-gray-700 dark:text-gray-300">Emotional Dua Search</span>
            </li>
            <li class="flex items-start gap-2">
              <mat-icon class="text-[#B7A57A] text-xl mt-0.5">check_circle</mat-icon>
              <span class="text-gray-700 dark:text-gray-300">Deep Dua Insights</span>
            </li>
            <li class="flex items-start gap-2">
              <mat-icon class="text-[#B7A57A] text-xl mt-0.5">check_circle</mat-icon>
              <span class="text-gray-700 dark:text-gray-300">Advanced Progress Tracking</span>
            </li>
            <li class="flex items-start gap-2">
              <mat-icon class="text-[#B7A57A] text-xl mt-0.5">check_circle</mat-icon>
              <span class="text-gray-700 dark:text-gray-300">Classroom Features (for Teachers)</span>
            </li>
          </ul>
        </div>

        <!-- Pricing -->
        <p class="text-lg font-bold text-[#B7A57A] mb-6">
          Starting at just $4.99/month
        </p>
      </div>

      <!-- Actions -->
      <mat-dialog-actions class="flex flex-col gap-3">
        <button mat-raised-button color="primary" 
                (click)="upgrade()"
                class="w-full py-3 bg-[#B7A57A] hover:bg-[#9b8a65] text-white font-semibold rounded-lg transition-colors">
          Upgrade to Premium
        </button>
        <button mat-button 
                (click)="close()"
                class="w-full py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
          Maybe Later
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .premium-prompt {
      padding: 24px;
      max-width: 500px;
    }

    ::ng-deep .mat-mdc-dialog-container {
      border-radius: 16px;
    }

    mat-dialog-actions {
      padding: 0;
      margin-top: 16px;
      justify-content: center;
    }
  `]
})
export class PremiumPromptComponent {
  constructor(
    public dialogRef: MatDialogRef<PremiumPromptComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PremiumPromptData,
    private router: Router
  ) {}

  close(): void {
    this.dialogRef.close();
  }

  upgrade(): void {
    this.dialogRef.close();
    this.router.navigate(['/subscription'], { 
      queryParams: { feature: this.data.feature } 
    });
  }
}
