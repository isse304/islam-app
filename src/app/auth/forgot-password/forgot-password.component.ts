import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FirebaseAuthService } from '../../services/firebase-auth.service';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatCardModule
  ]
})
export class ForgotPasswordComponent implements OnInit {
  resetForm: FormGroup;
  isLoading = false;
  resetEmailSent = false;

  constructor(
    private fb: FormBuilder,
    private authService: FirebaseAuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    this.resetForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  ngOnInit(): void {
    // Check if user is already logged in
    this.authService.user$.subscribe(user => {
      if (user) {
        this.router.navigate(['/']);
      }
    });
  }

  onSubmit(): void {
    if (this.resetForm.valid) {
      this.isLoading = true;
      const email = this.resetForm.get('email')?.value;

      this.authService.sendPasswordResetEmail(email)
        .then(() => {
          this.resetEmailSent = true;
        })
        .catch(error => {
          let errorMessage = 'An error occurred sending the password reset email';
          
          if (error.code === 'auth/user-not-found') {
            errorMessage = 'No account found with this email address';
          } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address';
          }
          
          this.snackBar.open(errorMessage, 'Close', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
          console.error('Password reset error:', error);
        })
        .finally(() => {
          this.isLoading = false;
        });
    }
  }

  goToLogin(): void {
    this.router.navigate(['/auth/login']);
  }
} 