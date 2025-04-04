import { Component, Inject } from '@angular/core';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { FirebaseAuthService } from '../../../services/firebase-auth.service';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-delete-confirmation-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './delete-confirmation-dialog.component.html',
  styleUrls: ['./delete-confirmation-dialog.component.scss']
})
export class DeleteConfirmationDialogComponent {
  isPremium = false;

  constructor(
    public dialogRef: MatDialogRef<DeleteConfirmationDialogComponent>,
    private authService: FirebaseAuthService
  ) {
    this.authService.user$.pipe(take(1)).subscribe(user => {
      this.isPremium = user?.isPremium ?? false;
    });
  }

  onCancel(): void {
    this.dialogRef.close(false); // Close dialog, return false (not confirmed)
  }

  onConfirm(): void {
    this.dialogRef.close(true); // Close dialog, return true (confirmed)
  }
} 