import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface PremiumPromptData {
  featureName: string;
  mode?: 'prompt' | 'greeting';
}

@Component({
  selector: 'app-premium-prompt-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './premium-prompt-dialog.component.html',
  styleUrls: ['./premium-prompt-dialog.component.scss']
})
export class PremiumPromptDialogComponent {
  isGreetingMode: boolean;

  constructor(
    public dialogRef: MatDialogRef<PremiumPromptDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PremiumPromptData
  ) {
    this.isGreetingMode = data.mode === 'greeting';
  }

  onNoClick(): void {
    this.dialogRef.close(false);
  }

  onConfirmClick(): void {
    this.dialogRef.close(true);
  }
} 