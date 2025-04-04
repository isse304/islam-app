import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon'; // Import MatIconModule

@Component({
  selector: 'app-reauth-password-dialog',
  template: `
    <h2 mat-dialog-title>Re-authenticate Required</h2>
    <mat-dialog-content>
      <p>For your security, please enter your current password to proceed.</p>
      <form [formGroup]="passwordForm">
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Current Password</mat-label>
          <input matInput [type]="hidePassword ? 'password' : 'text'" formControlName="password" required>
          <button mat-icon-button matSuffix (click)="hidePassword = !hidePassword" [attr.aria-label]="'Hide password'" [attr.aria-pressed]="hidePassword">
            <mat-icon>{{hidePassword ? 'visibility_off' : 'visibility'}}</mat-icon>
          </button>
          <mat-error *ngIf="passwordForm.controls['password'].hasError('required')">
            Password is required
          </mat-error>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-raised-button color="warn" [disabled]="passwordForm.invalid" (click)="onSubmit()">Confirm</button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-form-field { margin-top: 1rem; }
  `],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule // Add MatIconModule here
  ]
})
export class ReauthDialogComponent {
  passwordForm: FormGroup;
  hidePassword = true;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<ReauthDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any // Optional: if you need to pass data
  ) {
    this.passwordForm = this.fb.group({
      password: ['', Validators.required]
    });
  }

  onCancel(): void {
    this.dialogRef.close(); // Close without returning data signifies cancellation
  }

  onSubmit(): void {
    if (this.passwordForm.valid) {
      this.dialogRef.close(this.passwordForm.value.password); // Close and return the password
    }
  }
}