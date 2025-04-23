import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-premium-features-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './premium-features-dialog.component.html',
  styleUrls: ['./premium-features-dialog.component.scss']
})
export class PremiumFeaturesDialogComponent {

  constructor(
    public dialogRef: MatDialogRef<PremiumFeaturesDialogComponent>,
  ) {}

  onNoClick(): void {
    this.dialogRef.close(false);
  }

  onConfirmClick(): void {
    // This signals that the user wants to proceed to subscription
    this.dialogRef.close(true);
  }
} 