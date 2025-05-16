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
  private routeSub?: Subscription; // Re-added for queryParams subscription

  constructor(
    
    private fb: FormBuilder,
    private authService: FirebaseAuthService,
    private router: Router,
    private snackBar: MatSnackBar,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {
    console.log('LOGIN COMPONENT CONSTRUCTOR - URL:', window.location.href); // ADD THIS
    debugger; // ADD THIS
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit(): void {
    console.log('LOGIN COMPONENT NGONINIT - URL:', window.location.href); // ADD THIS
    debugger; // ADD THIS
    console.log('[LoginComponent OnInit] Starting...');

    // Subscribe to queryParams to get returnUrl
    this.routeSub = this.route.queryParams.pipe(take(1)).subscribe(params => {
        console.log('[LoginComponent OnInit via subscribe] Full params object:', params);
        console.log('[LoginComponent OnInit via subscribe] Full route snapshot:', this.route.snapshot);
        const queryReturnUrl = params['returnUrl'];
        console.log(`[LoginComponent OnInit via queryParams.subscribe] returnUrl from params: '${queryReturnUrl}'`);

        if (queryReturnUrl && typeof queryReturnUrl === 'string') {
            this.returnUrl = queryReturnUrl;
            console.log(`[LoginComponent OnInit via subscribe] Attempting to set localStorage item 'redirectUrl' to: '${this.returnUrl}'`);
            localStorage.setItem('redirectUrl', this.returnUrl);
            console.log('[LoginComponent OnInit via subscribe] localStorage.setItem(\'redirectUrl\') CALLED.');
            const storedRedirectUrl = localStorage.getItem('redirectUrl');
            console.log(`[LoginComponent OnInit via subscribe] Value of 'redirectUrl' read back from localStorage: '${storedRedirectUrl}'`);
            // debugger; // PAUSE EXECUTION HERE TO INSPECT LOCALSTORAGE
        } else {
            console.log('[LoginComponent OnInit via subscribe] No returnUrl found in query params or not a string.');
        }

        // Handle loginIntent (can also be inside this subscription or use snapshot if preferred)
        const storedIntent = localStorage.getItem('signupIntent');
        if (storedIntent) {
            this.loginIntent = storedIntent;
            // console.log(`[LoginComponent OnInit via subscribe] Intent read from localStorage: ${this.loginIntent}`);
        } else {
            this.loginIntent = params['intent']; // Get intent from the same params
            // console.log(`[LoginComponent OnInit via subscribe] Intent read from query params: ${this.loginIntent}`);
        }
    });

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
    this.routeSub?.unsubscribe(); // Unsubscribe from queryParams
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

      // Clear the intent from localStorage AFTER determining the target URL or if redirectUrl is present
      localStorage.removeItem('signupIntent');

      // *** MODIFIED NAVIGATION LOGIC ***
      const intendedRedirectUrl = this.returnUrl || localStorage.getItem('redirectUrl_temp_login'); // Check component's returnUrl first
      // 'redirectUrl_temp_login' is used to avoid immediate clearing by auth service if it runs first

      if (this.loginIntent === 'start_trial') {
        // //console.log(`[LoginComponent navigateOnLoginSuccess] Intent is 'start_trial'. Navigating to /subscription.`);
        this.zone.run(() => {
            this.router.navigateByUrl('/subscription?initiateCheckout=true').catch(navError => {
                //console.error('[LoginComponent] Navigation error for start_trial intent:', navError);
                this.router.navigate(['/home']);
            });
        });
      } else if (intendedRedirectUrl) {
        // //console.log(`[LoginComponent navigateOnLoginSuccess] A returnUrl '${intendedRedirectUrl}' is present. FirebaseAuthService should handle this. LoginComponent will NOT navigate.`);
        // localStorage.removeItem('redirectUrl_temp_login'); // Clean up temp one if used
        // Do nothing here, let FirebaseAuthService.onAuthStateChanged handle it via 'redirectUrl' in localStorage.
      } else {
        // //console.log(`[LoginComponent navigateOnLoginSuccess] No specific intent or returnUrl. Navigating to /home.`);
        this.zone.run(() => {
            this.router.navigate(['/home']).catch(navError => {
                //console.error('[LoginComponent] Navigation error to /home:', navError);
            });
        });
      }

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
            // console.log('[LoginComponent] signInWithGoogle promise resolved. Credential:', credential); // Log credential
            if (credential && credential.user) {
              // console.log('[LoginComponent] Valid credential received from popup.');
              // Before calling navigateOnLoginSuccess, ensure 'redirectUrl' is in localStorage if it was in query
              // This is already handled by constructor/ngOnInit, but double check for Google flow
              if (this.returnUrl && !localStorage.getItem('redirectUrl')) {
                  localStorage.setItem('redirectUrl', this.returnUrl);
                  // console.log(`[LoginComponent loginWithGoogle success] Ensured returnUrl '${this.returnUrl}' is in localStorage.`);
              }
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