import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FirebaseAuthService } from '../../services/firebase-auth.service';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss']
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