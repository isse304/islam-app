import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FirebaseAuthService } from '../../services/firebase-auth.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { Subscription, interval, filter } from 'rxjs';
import { take } from 'rxjs/operators';

// Define the type for active features
type ActiveFeature = 'tafsir' | 'dua-search' | 'dua-insights';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatDividerModule
  ]
})
export class LoginComponent implements OnInit, OnDestroy {
  loginForm: FormGroup;
  isLoading = false;
  hidePassword = true;
  private authSubscription?: Subscription;
  private autoRotateInterval: any; // Using 'any' for interval ID compatibility
  private isDestroyed = false; // Flag to prevent operations after destroy
  activeFeature: ActiveFeature = 'tafsir';
  private featureRotationInterval: Subscription | null = null;
  private returnUrl: string | null = null;
  private loginIntent: string | null = null; // Store the intent
  private routeSub: Subscription;

  constructor(
    private fb: FormBuilder,
    private authService: FirebaseAuthService,
    private router: Router,
    private snackBar: MatSnackBar,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    // Get the return URL and intent from route parameters
    this.routeSub = this.route.queryParams.subscribe(params => {
        // this.returnUrl = params['returnUrl']; // Keep if needed for other return scenarios
        this.loginIntent = params['intent'];
        // console.log(`[LoginComponent OnInit] Intent read: ${this.loginIntent}`);
    });
  }

  ngOnInit(): void {
    // Prioritize intent from localStorage, then check query params
    const storedIntent = localStorage.getItem('signupIntent');
    if (storedIntent) {
      this.loginIntent = storedIntent;
      // console.log(`[LoginComponent OnInit] Intent read from localStorage: ${this.loginIntent}`);
      // Optional: Clear it immediately after reading if only needed on init?
      // localStorage.removeItem('signupIntent'); 
    } else {
      this.routeSub = this.route.queryParams.subscribe(params => {
        this.loginIntent = params['intent'];
        // console.log(`[LoginComponent OnInit] Intent read from queryParams: ${this.loginIntent}`);
      });
    }

    // Check if user is already logged in (keep this)
    this.authSubscription = this.authService.user$.pipe(
      take(1) // Only check the initial state on load
    ).subscribe(user => {
      if (user && !this.isDestroyed) {
        // Determine redirect URL here based on intent if already logged in
        const initialRedirectUrl = (this.loginIntent === 'start_trial')
            ? '/subscription?initiateCheckout=true'
            : '/home'; // Default to home if already logged in without specific intent
        // console.log(`[LoginComponent OnInit] User already logged in, navigating to: ${initialRedirectUrl}`);
        this.zone.run(() => this.router.navigateByUrl(initialRedirectUrl));
      }
    });

    // Start other initializations like auto-rotate
    this.startAutoRotate();
  }

  ngOnDestroy(): void {
    this.isDestroyed = true; // Set flag first
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
    this.stopAutoRotate();
    this.routeSub?.unsubscribe();
  }

  // Helper function to handle navigation after successful login
  private async navigateOnLoginSuccess(): Promise<void> {
    try {
      // Wait for auth and user state confirmation
      await this.authService.waitForAuthReady();
      await new Promise<void>((resolve, reject) => {
        const sub = this.authService.user$.pipe(
          filter(user => !!user), // Ensure user object is not null
          take(1)
        ).subscribe({
          next: (user) => { resolve(); },
          error: (err) => reject(err),
          complete: () => { /* Optional: handle completion */ }
        });
        // Add timeout for safety
        setTimeout(() => {
          if (!sub.closed) {
            sub.unsubscribe();
            reject(new Error('Timeout waiting for user state confirmation post-login'));
          }
        }, 10000); // 10-second timeout
      });

      // Navigate based *directly* on loginIntent
      this.zone.run(() => {
        const targetUrl = (this.loginIntent === 'start_trial')
             ? '/subscription?initiateCheckout=true' // Go to subscription if intent matches
             : '/home'; // Default to home for all other cases
        // console.log(`[LoginComponent navigateOnLoginSuccess] Intent: '${this.loginIntent}'. Navigating to: ${targetUrl}`);

        // Clear the intent from localStorage AFTER determining the target URL
        localStorage.removeItem('signupIntent');

        this.router.navigateByUrl(targetUrl).catch(navError => {
          // console.error('[LoginComponent] Navigation error after login:', navError);
          this.router.navigate(['/home']); // Fallback to home on navigation error
        });
      });

    } catch (error) {
      // console.error('[LoginComponent] Error during post-login navigation setup:', error);
      this.snackBar.open('Login successful, but redirect failed. Please navigate manually.', 'Close', { duration: 5000 });
      this.zone.run(() => this.router.navigate(['/home'])); // Fallback on error
    } finally {
      // Ensure isLoading is turned off regardless of success/error
      if (this.isLoading) {
         this.zone.run(() => { this.isLoading = false; this.cdr.markForCheck(); });
      }
    }
  }

  onSubmit(): void {
    if (this.loginForm.valid && !this.isLoading) {
      this.isLoading = true;
      const { email, password } = this.loginForm.value;

      this.authService.signInWithEmailAndPassword(email, password)
        .then(async () => { // Make the success handler async
          this.snackBar.open('Login successful!', 'Close', { duration: 3000 });
          await this.navigateOnLoginSuccess(); // Wait for navigation logic
        })
        .catch(error => {
          // Error handling remains the same
          let errorMessage = 'An error occurred during sign in';
          if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            errorMessage = 'Invalid email or password';
          } else if (error.code === 'auth/user-disabled') {
            errorMessage = 'This account has been disabled';
          } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Too many unsuccessful login attempts. Please try again later';
          }
          this.snackBar.open(errorMessage, 'Close', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
           this.zone.run(() => { this.isLoading = false; }); // Turn off loading on error
        });
    }
  }

  loginWithGoogle(): void {
    if (this.isLoading) {
      console.log('[LoginComponent] loginWithGoogle called while already loading. Aborting.');
      return;
    }
    console.log('[LoginComponent] loginWithGoogle initiated.'); // Log start
    this.isLoading = true;
    this.cdr.markForCheck(); // Update UI for loading state

    // Store the intent before starting the Google flow
    const intentToStore = this.loginIntent || localStorage.getItem('signupIntent');
    if (intentToStore) {
      localStorage.setItem('signupIntent', intentToStore);
      // console.log(`[LoginComponent loginWithGoogle] Stored intent: ${intentToStore}`);
    }

    // Run the Firebase call outside Angular zone
    this.zone.runOutsideAngular(() => {
      this.authService.signInWithGoogle()
        .then(async (credential) => { // Make the success handler async
          // Bring the result handling back into the Angular zone
          this.zone.run(async () => {
            console.log('[LoginComponent] signInWithGoogle promise resolved. Credential:', credential); // Log credential
            if (credential && credential.user) {
              console.log('[LoginComponent] Valid credential received from popup.');
              this.snackBar.open('Login successful!', 'Close', { duration: 3000 });
              await this.navigateOnLoginSuccess(); // Wait for navigation logic
            } else {
              // Handle case where credential or user is missing (shouldn't happen often)
              localStorage.removeItem('signupIntent'); // Clear intent on unexpected issue
              console.warn('[LoginComponent] Google Sign-In succeeded but credential/user missing in result.');
              this.snackBar.open('Login successful, but encountered an issue. Redirecting home.', 'Close', { duration: 5000 });
              this.router.navigate(['/home']);
            }
          });
        })
        .catch(error => {
          // Bring error handling back into the Angular zone
          this.zone.run(() => {
            localStorage.removeItem('signupIntent'); // Clear intent on error
            console.error('[LoginComponent] signInWithGoogle failed:', error);
            this.isLoading = false;
            let errorMessage = 'Google Sign-In failed.';
            if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') { 
              errorMessage = 'Google login failed. Please try again.';
              this.snackBar.open(errorMessage, 'Close', {
                  duration: 5000,
                  panelClass: ['error-snackbar']
              });
            } else {
              console.log('[LoginComponent] Google Sign-In popup closed by user.');
            }
            // Always reset loading state on error or popup close
            this.isLoading = false;
            this.cdr.markForCheck(); // Update UI
          });
        });
    });
       // No finally block here, handle isLoading in then/catch inside the zone
  }

  private startAutoRotate() {
    if (this.isDestroyed) return;

    this.stopAutoRotate(); // Clear any existing interval

    this.autoRotateInterval = setInterval(() => {
      if (this.isDestroyed) {
        this.stopAutoRotate();
        return;
      }

      try {
        const features: ActiveFeature[] = ['tafsir', 'dua-search', 'dua-insights'];
        const currentIndex = features.indexOf(this.activeFeature);
        const nextIndex = (currentIndex + 1) % features.length;
        this.activeFeature = features[nextIndex];
        // Use detectChanges() for more robust change detection triggering
        if (!this.isDestroyed) { // Use the existing component flag
            this.cdr.detectChanges();
        }
      } catch (error) {
        console.error('Error during auto-rotation:', error);
        this.stopAutoRotate();
      }
    }, 6000); // Rotate every 6 seconds
  }

  private stopAutoRotate() {
    if (this.autoRotateInterval) {
      clearInterval(this.autoRotateInterval);
      this.autoRotateInterval = null;
    }
  }

  showFeature(feature: ActiveFeature) {
    if (this.isDestroyed) return;

    this.stopAutoRotate();
    this.activeFeature = feature;
    // Use detectChanges() for more robust change detection triggering
    this.cdr.detectChanges();
    this.startAutoRotate(); // Restart timer after manual selection
  }

  goToSignup(): void {
    this.router.navigate(['/auth/signup'], { queryParamsHandling: 'preserve' }); // Preserve intent
  }

  goToForgotPassword(): void {
    this.router.navigate(['/auth/forgot-password']);
  }
} 