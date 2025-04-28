import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
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
import { take } from 'rxjs/operators';

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
  errorMessage: string | null = null;
  private signupIntent: string | null = null;

  constructor(
    private fb: FormBuilder,
    private authService: FirebaseAuthService,
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private route: ActivatedRoute
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
    this.route.queryParamMap.subscribe(params => {
      this.signupIntent = params.get('intent');
    });

    this.authService.user$.pipe(take(1)).subscribe(user => {
      if (user) {
        this.router.navigate(['/home']);
      }
    });
  }

  onSubmit(): void {
    if (this.signupForm.invalid) {
      this.markFormGroupTouched(this.signupForm);
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;
    const { email, password, firstName, lastName } = this.signupForm.value;

    this.authService.createUserWithEmailAndPassword(email, password)
      .then(result => {
        return this.authService.sendEmailVerification().then(() => result);
      })
      .then(result => {
        return this.authService.updateUserProfile({
          displayName: `${firstName} ${lastName}`
        });
      })
      .then(() => {
        this.isLoading = false;
        this.snackBar.open(
          'Account created! Please check your email to verify your account.',
          'Close',
          { duration: 7000 }
        );
        this.handleSignupSuccessRedirect();
      })
      .catch(error => {
        this.isLoading = false;
        if (error?.code === 'auth/too-many-requests') {
          this.errorMessage = 'Account created, but verification email limit reached. Please check inbox or verify later.';
          this.snackBar.open(this.errorMessage, 'Close', {
            duration: 7000,
            panelClass: ['warn-snackbar']
          });
          this.handleSignupSuccessRedirect();
        } else {
          this.errorMessage = error.message || 'An unexpected error occurred during signup.';
          if (this.errorMessage) {
            this.snackBar.open(this.errorMessage, 'Close', {
              duration: 5000,
              panelClass: ['error-snackbar']
            });
          }
          console.error('Signup error:', error);
        }
      });
  }

  signupWithGoogle(): void {
    this.isLoading = true;
    this.errorMessage = null;

    // Store the intent before starting the Google flow
    if (this.signupIntent) {
      localStorage.setItem('signupIntent', this.signupIntent);
    }

    this.authService.signInWithGoogle()
      .then(async () => {
        this.isLoading = false;
        this.snackBar.open('Account created/linked successfully!', 'Close', {
          duration: 5000,
          panelClass: ['success-snackbar']
        });
        // Redirect after successful Google Sign-In
        this.handleSignupSuccessRedirect(); 
      })
      .catch(error => {
        this.isLoading = false;
        // Clear the intent if Google Sign-In fails
        localStorage.removeItem('signupIntent'); 
        this.errorMessage = error.message || 'Google Sign-In failed.';
        if (this.errorMessage) {
          this.snackBar.open(this.errorMessage, 'Close', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
        }
        console.error('Google signup error:', error);
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

  private handleSignupSuccessRedirect(): void {
    // Prioritize intent from localStorage (set during Google Sign-In)
    const storedIntent = localStorage.getItem('signupIntent');
    const finalIntent = storedIntent || this.signupIntent;

    // Clear the stored intent after retrieving it
    if (storedIntent) {
      localStorage.removeItem('signupIntent');
    }

    // Determine target URL
    let targetUrl = '/home'; // Default to home for ALL successful signups/logins from this component
    if (finalIntent === 'start_trial') {
      targetUrl = '/subscription?initiateCheckout=true'; // Override if trial intent exists
    }

    // console.log(`[SignupComponent handleSignupSuccessRedirect] Final Intent: '${finalIntent}'. Navigating to: ${targetUrl}`);
    this.router.navigateByUrl(targetUrl);
  }

  // Helper to mark all fields as touched
  private markFormGroupTouched(formGroup: FormGroup) {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }
} 