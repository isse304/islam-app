import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-error-dialog',
  template: `
    <h2 mat-dialog-title>{{ title }}</h2>
    <mat-dialog-content>{{ message }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="close()">OK</button>
    </mat-dialog-actions>
  `,
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule
  ]
})
export class ErrorDialogComponent {
  title: string;
  message: string;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: { title: string; message: string },
    private dialogRef: MatDialogRef<ErrorDialogComponent>
  ) {
    this.title = data.title;
    this.message = data.message;
  }

  close(): void {
    this.dialogRef.close();
  }
} 