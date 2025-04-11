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

    // Get the return URL from route parameters or default to '/'
    this.routeSub = this.route.queryParams.subscribe(params => {
        this.returnUrl = params['returnUrl'] || '/'; // Default to root, which redirects to /home
    });
  }

  ngOnInit(): void {
    // Get return URL from query parameters FIRST
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/home';
    // console.log(`[LoginComponent OnInit] Target returnUrl: ${this.returnUrl}`);

    // Check if user is already logged in AFTER getting returnUrl
    this.authSubscription = this.authService.user$.pipe(
      take(1) // Only check the initial state on load
    ).subscribe(user => {
      if (user && !this.isDestroyed) {
        // User is already logged in, redirect to the returnUrl or /home
        // console.log(`[LoginComponent OnInit] User already logged in, navigating to: ${this.returnUrl}`);
        // Use navigateByUrl to handle absolute paths correctly
        this.zone.run(() => this.router.navigateByUrl(this.returnUrl!));
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
      // console.log('[LoginComponent] Waiting for auth ready...');
      await this.authService.waitForAuthReady();
      // console.log('[LoginComponent] Auth is ready. Waiting for user state...');
      // Wait for the user$ observable to emit an actual user object
      await new Promise<void>((resolve, reject) => {
        const sub = this.authService.user$.pipe(
          filter(user => !!user), // Ensure user is not null
          take(1) // Take the first non-null user
        ).subscribe({
          next: (user) => {
             // console.log(`[LoginComponent] User state confirmed: ${user?.email}. Navigating...`);
             resolve();
          },
          error: (err) => reject(err),
          complete: () => {} // No need to resolve on complete here
        });
        // Safety timeout
        setTimeout(() => {
          if (!sub.closed) {
            sub.unsubscribe();
            reject(new Error('Timeout waiting for user state confirmation'));
          }
        }, 10000); // 10 second timeout
      });

      // Run navigation inside Angular zone
      this.zone.run(() => {
        // console.log(`[LoginComponent] Navigating to: ${this.returnUrl}`);
        this.router.navigateByUrl(this.returnUrl || '/home').catch(navError => {
          // console.error('[LoginComponent] Navigation error:', navError);
          // Fallback navigation if the intended one fails
          this.router.navigate(['/home']);
        });
      });

    } catch (error) {
      // console.error('[LoginComponent] Error during post-login navigation setup:', error);
      this.snackBar.open('Login successful, but redirect failed. Please navigate manually.', 'Close', { duration: 5000 });
      // Attempt fallback navigation even on error
      this.zone.run(() => this.router.navigate(['/home']));
    } finally {
      // Ensure loading state is turned off if it was missed
      if (this.isLoading) {
         this.zone.run(() => { this.isLoading = false; });
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
        // No finally block needed here as navigateOnLoginSuccess handles it
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
              console.warn('[LoginComponent] signInWithGoogle resolved but credential/user is null/undefined. Redirect might be happening or popup closed.');
              // If popup closed early or redirect happened, we might need to reset loading state carefully.
              // Let's reset loading state here if no user credential was received.
              this.isLoading = false;
              this.cdr.markForCheck();
            }
          });
        })
        .catch(error => {
          // Bring error handling back into the Angular zone
          this.zone.run(() => {
            console.error('[LoginComponent] signInWithGoogle promise rejected. Error:', error); // Log error
            if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') { 
              this.snackBar.open('Google login failed. Please try again.', 'Close', {
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
    // Use detectChanges() after manual state change outside interval
     if (!this.isDestroyed) { // Use the existing component flag
        this.cdr.detectChanges();
     }
    this.startAutoRotate();
  }

  goToSignup(): void {
    this.router.navigate(['/auth/signup']);
  }

  goToForgotPassword(): void {
    this.router.navigate(['/auth/forgot-password']);
  }
} 