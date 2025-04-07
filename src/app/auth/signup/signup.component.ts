import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { FirebaseAuthService } from '../../services/firebase-auth.service';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';

// Password matching validator
function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password');
  const confirmPassword = control.get('confirmPassword');

  if (password && confirmPassword && password.value !== confirmPassword.value) {
    confirmPassword.setErrors({ mustMatch: true });
    return { mustMatch: true };
  }
  
  return null;
}

@Component({
  selector: 'app-signup',
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.scss'],
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
    MatCheckboxModule,
    MatSnackBarModule,
    MatCardModule,
    MatDividerModule
  ]
})
export class SignupComponent implements OnInit {
  signupForm: FormGroup;
  isLoading = false;
  hidePassword = true;
  hideConfirmPassword = true;

  constructor(
    private fb: FormBuilder,
    private authService: FirebaseAuthService,
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.signupForm = this.fb.group({
      firstName: ['', [Validators.required]],
      lastName: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    }, {
      validators: passwordMatchValidator
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
    if (this.signupForm.valid) {
      this.isLoading = true;
      const { email, password, firstName, lastName } = this.signupForm.value;

      this.authService.createUserWithEmailAndPassword(email, password)
        .then(result => {
          return this.authService.updateUserProfile({
            displayName: `${firstName} ${lastName}`
          });
        })
        .then(() => {
          this.snackBar.open(
            'Account created! Please check your email to verify your account.',
            'Close',
            { duration: 7000 }
          );
          this.router.navigate(['/auth/login']);
        })
        .catch(error => {
          let errorMessage = 'An error occurred during registration';
          
          if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'This email is already in use';
          } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address';
          } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password is too weak';
          }
          
          this.snackBar.open(errorMessage, 'Close', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
          console.error('Signup error:', error);
        })
        .finally(() => {
          this.isLoading = false;
        });
    }
  }

  signupWithGoogle(): void {
    this.isLoading = true;
    this.authService.signInWithGoogle()
      .then(() => {
        this.snackBar.open('Account created successfully!', 'Close', {
          duration: 5000,
          panelClass: ['success-snackbar']
        });
        this.router.navigate(['/']);
      })
      .catch(error => {
        this.snackBar.open('Error signing up with Google', 'Close', {
          duration: 5000,
          panelClass: ['error-snackbar']
        });
        console.error('Google signup error:', error);
      })
      .finally(() => {
        this.isLoading = false;
      });
  }

  goToLogin(): void {
    this.router.navigate(['/auth/login']);
  }

  openTermsAndConditions(): void {
    // You can implement a dialog or navigate to terms page here
    // For now, just open a simple alert
    alert('Terms and Conditions would be displayed here.');
    
    /* Example with dialog (uncomment when you have a dialog component)
    this.dialog.open(TermsDialogComponent, {
      width: '600px',
      maxHeight: '80vh'
    });
    */
  }
} 