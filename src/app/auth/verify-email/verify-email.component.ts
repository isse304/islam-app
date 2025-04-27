import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { FirebaseAuthService, AppUser } from '../../services/firebase-auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { Subscription, Subject, interval, timer } from 'rxjs';
import { takeUntil, finalize, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-verify-email',
  templateUrl: './verify-email.component.html',
  styleUrls: ['./verify-email.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatSnackBarModule,
    MatCardModule
  ]
})
export class VerifyEmailComponent implements OnInit, OnDestroy {
  user: AppUser | null = null;
  isLoading = false;
  isCheckingStatus = false;
  isResending = false;
  private destroy$ = new Subject<void>();
  private userSubscription: Subscription | null = null;
  private pollingSubscription: Subscription | null = null;
  private verificationIntent: string | null = null;

  constructor(
    private authService: FirebaseAuthService,
    private router: Router,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.verificationIntent = params.get('intent');
      // console.log(`[VerifyEmailComponent] Intent read: ${this.verificationIntent}`);
    });

    this.isLoading = true;
    this.userSubscription = this.authService.user$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.user = user;
        this.isLoading = false;
        if (!user) {
          this.navigateToApp();
        } else if (user.emailVerified) {
          // If already verified when landing here, navigate immediately
          // console.warn('[VerifyEmailComponent] User already verified. Navigating...');
          this.navigateToApp();
        } else {
          this.startPollingForVerification();
        }
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.userSubscription?.unsubscribe();
    this.pollingSubscription?.unsubscribe();
  }

  private startPollingForVerification(): void {
    this.pollingSubscription?.unsubscribe();

    this.pollingSubscription = timer(2000, 5000) // Poll every 5 seconds after 2 initial seconds
      .pipe(
        takeUntil(this.destroy$),
        switchMap(async () => {
          // Only poll if not currently checking manually or resending, and user exists but is not verified
          if (!this.isCheckingStatus && !this.isResending && this.user && !this.user.emailVerified) {
            try {
              // console.log('[Polling] Reloading user state...');
              await this.authService.reloadCurrentUser();
              // console.log('[Polling] User state reloaded.');

              // Directly check status AFTER reload
              const latestUser = this.authService.getCurrentUser(); // Use synchronous getter after reload
              const isVerified = !!latestUser?.emailVerified;
              // console.log(`[Polling] Verification status after reload: ${isVerified}`);

              if (isVerified) {
                // console.log('[Polling] Verified! Navigating to app...');
                this.navigateToApp(); // This will unsubscribe polling
                // No need to manually unsubscribe here, navigateToApp handles it.
              }
            } catch (error) {
              console.error('[Polling] Error reloading user:', error);
              // Optional: Show a subtle error or stop polling on persistent errors
            }
          } else {
             // console.log(`[Polling] Skipping poll (isCheckingStatus: ${this.isCheckingStatus}, isResending: ${this.isResending}, userVerified: ${this.user?.emailVerified})`);
          }
        })
      )
      .subscribe({
         error: (err) => console.error('[Polling] Uncaught error in polling stream:', err) // Catch errors in the stream itself
      });
  }

  async resendVerificationEmail(): Promise<void> {
    if (this.isResending) return;
    this.isResending = true;
    this.cdr.markForCheck();
    this.pollingSubscription?.unsubscribe();
    try {
      await this.authService.sendEmailVerification();
      this.snackBar.open('Verification email resent. Please check your inbox (and spam folder).', 'Close', {
        duration: 5000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom'
      });
    } catch (error: any) {
      this.snackBar.open(`Error resending email: ${error.message || 'Please try again.'}`, 'Close', {
        duration: 5000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isResending = false;
      this.cdr.markForCheck();
      if (this.user && !this.user.emailVerified) {
        this.startPollingForVerification();
      }
    }
  }

  async checkVerificationStatus(): Promise<void> {
    // Prevent concurrent checks or checks while resending
    if (this.isCheckingStatus || this.isResending) {
      // console.log('[VerifyEmail] Check skipped (already checking or resending).');
      return;
    }

    // console.log('[VerifyEmail] Starting manual checkVerificationStatus...');
    this.isCheckingStatus = true;
    this.cdr.markForCheck(); // Show spinner for the button
    this.pollingSubscription?.unsubscribe(); // Pause background polling

    try {
      // console.log('[VerifyEmail] Reloading user state...');
      await this.authService.reloadCurrentUser();
      // console.log('[VerifyEmail] User state reload complete.');

      // Fetch the latest user state AFTER reload
      const latestUser = this.authService.getCurrentUser(); // Use synchronous getter
      const isVerified = !!latestUser?.emailVerified;
      // console.log(`[VerifyEmail] Reloaded user status - Verified: ${isVerified}`);

      if (isVerified) {
        // console.log('[VerifyEmail] Verification SUCCESSFUL via manual check. Navigating...');
        this.snackBar.open('Email successfully verified! Redirecting...', 'Close', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
          panelClass: ['success-snackbar']
        });
        // Let navigateToApp handle unsubscription and navigation
        this.navigateToApp();
        // Don't need to reset isCheckingStatus here as we are navigating away
        return; // Exit the function early on success
      } else {
        // console.log('[VerifyEmail] Verification FAILED via manual check (still not verified). Showing message.');
        this.snackBar.open('Email is still not verified. Please ensure you clicked the link in the email.', 'Close', {
          duration: 6000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom'
        });
        // Verification failed, explicitly reset the state and restart polling *before* finally
        this.isCheckingStatus = false;
        this.cdr.markForCheck(); // Update UI now
        // console.log('[VerifyEmail] Restarting polling after failed manual check.');
        this.startPollingForVerification();
      }

    } catch (error: any) {
      // console.error('[VerifyEmail] Error during manual checkVerificationStatus:', error);
      this.snackBar.open(`Error checking verification status: ${error.message || 'Please try again.'}`, 'Close', {
        duration: 5000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
        panelClass: ['error-snackbar']
      });
       // Reset state and restart polling even after error *before* finally
       this.isCheckingStatus = false;
       this.cdr.markForCheck(); // Update UI now
       // console.log('[VerifyEmail] Restarting polling after error during manual check.');
       this.startPollingForVerification();

    } finally {
       // The finally block might not be strictly needed anymore if state is reset above,
       // but it's a safeguard. Ensure it doesn't interfere if navigation happened.
       if (this.isCheckingStatus) { // Only reset if it wasn't reset above (e.g., during navigation)
         // console.log('[VerifyEmail] Entering finally block (should only happen if navigation did not occur).');
         this.isCheckingStatus = false;
         this.cdr.markForCheck();
         // console.log('[VerifyEmail] checkVerificationStatus finally block finished.');
       }
    }
  }

  navigateToApp(): void {
    this.pollingSubscription?.unsubscribe();
    // ++ Determine redirect based on stored intent ++ 
    const targetUrl = (this.verificationIntent === 'start_trial')
      ? '/subscription?initiateCheckout=true'
      : this.authService.redirectUrl || '/home'; // Keep fallback to authService.redirectUrl or /home
    
    // console.log(`[VerifyEmailComponent] Navigating to app. Intent: '${this.verificationIntent}', Target URL: ${targetUrl}`);
    
    this.authService.redirectUrl = null; // Clear any potentially conflicting global redirect
    this.router.navigateByUrl(targetUrl);
  }

  async signOut(): Promise<void> {
    this.isLoading = true;
    this.cdr.markForCheck();
    this.pollingSubscription?.unsubscribe();
    await this.authService.signOut();
  }
} 