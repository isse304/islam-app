import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ClassService } from '../../../services/class.service';
import { ToastService } from '../../../services/toast.service';

export interface AssignmentAccessDeniedData {
  message: string;
  classCode?: string;
}

@Component({
  selector: 'app-assignment-access-denied-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <div class="p-6">
      <div class="flex items-start gap-4 mb-4">
        <mat-icon class="text-red-500 text-4xl">lock</mat-icon>
        <div class="flex-1">
          <h2 class="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p class="text-gray-700">{{ data.message }}</p>
        </div>
      </div>

      <!-- Show join form if class code is provided -->
      <div *ngIf="data.classCode && showJoinForm" class="mt-4 p-4 bg-blue-50 rounded-lg">
        <h3 class="text-sm font-semibold text-blue-900 mb-2">Join this class to access the assignment</h3>
        <p class="text-xs text-blue-700 mb-3">Class code: <strong>{{ data.classCode }}</strong></p>
        <form [formGroup]="joinForm" (ngSubmit)="joinClass()" class="space-y-3">
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Confirm class code</mat-label>
            <input matInput formControlName="code" placeholder="Enter class code" />
          </mat-form-field>
          <div class="flex gap-2">
            <button type="submit" mat-raised-button color="primary" [disabled]="joinForm.invalid || isJoining">
              {{ isJoining ? 'Joining...' : 'Join Class' }}
            </button>
            <button type="button" mat-button (click)="showJoinForm = false">Cancel</button>
          </div>
        </form>
      </div>

      <!-- Action buttons -->
      <div class="flex justify-end gap-2 mt-6">
        <button *ngIf="data.classCode && !showJoinForm" mat-raised-button color="primary" (click)="showJoinForm = true">
          Join Class
        </button>
        <button mat-button (click)="goToAssignments()">Go to My Assignments</button>
        <button mat-button mat-dialog-close>Close</button>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
    mat-icon {
      width: 48px;
      height: 48px;
      font-size: 48px;
    }
  `],
})
export class AssignmentAccessDeniedDialogComponent {
  private router = inject(Router);
  private classService = inject(ClassService);
  private toastService = inject(ToastService);
  private fb = inject(FormBuilder);

  showJoinForm = false;
  isJoining = false;
  joinForm: FormGroup;

  constructor(
    public dialogRef: MatDialogRef<AssignmentAccessDeniedDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AssignmentAccessDeniedData
  ) {
    this.joinForm = this.fb.group({
      code: [data.classCode || '', Validators.required],
    });
  }

  async joinClass(): Promise<void> {
    if (this.joinForm.invalid) return;

    this.isJoining = true;
    const code = this.joinForm.value.code.trim();

    try {
      await this.classService.joinClassByCode(code);
      this.toastService.success('✓ Successfully joined class! You can now access the assignment.');
      this.dialogRef.close();
      // Reload the current page to re-check access
      window.location.reload();
    } catch (error: any) {
      this.toastService.error(error.message || 'Failed to join class. Please check the code.');
      this.isJoining = false;
    }
  }

  goToAssignments(): void {
    this.dialogRef.close();
    this.router.navigate(['/s/assignments']);
  }
}

