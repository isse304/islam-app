import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface ErrorDialogData {
  title: string;
  message: string;
}

@Component({
  selector: 'app-error-dialog',
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="close()">Close</button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2 { color: #e53935; }
    p { margin: 16px 0; }
  `]
})
export class ErrorDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: ErrorDialogData,
    private dialogRef: MatDialogRef<ErrorDialogComponent>
  ) {}

  close(): void {
    this.dialogRef.close();
  }
} 