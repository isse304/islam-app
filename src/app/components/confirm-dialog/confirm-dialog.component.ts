import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common'; // <-- Import this
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog'; // <-- Import this
import { MatButtonModule } from '@angular/material/button'; // <-- Import this

// Define the expected structure of the data passed to the dialog
export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmButtonText?: string;
  confirmButtonColor?: 'primary' | 'accent' | 'warn'; // Use Material theme colors
}

@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.scss'],
  standalone: true, // <-- Make sure this is true
  imports: [         // <-- Make sure this array includes necessary modules
    CommonModule,
    MatDialogModule,
    MatButtonModule
  ]
})
export class ConfirmDialogComponent {

  constructor(
    public dialogRef: MatDialogRef<ConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData
  ) {}

  // Called when the user clicks the cancel button
  onNoClick(): void {
    this.dialogRef.close(false); // Close the dialog, return false
  }

  // Called when the user clicks the confirm button
  onYesClick(): void {
    this.dialogRef.close(true); // Close the dialog, return true
  }
}