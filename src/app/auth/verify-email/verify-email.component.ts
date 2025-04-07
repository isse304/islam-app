import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
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

  constructor(
    private authService: FirebaseAuthService,
    private router: Router,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.isLoading = true;
    this.userSubscription = this.authService.user$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.user = user;
        this.isLoading = false;
        if (!user || user.emailVerified) {
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

    this.pollingSubscription = timer(2000, 5000)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(async () => {
          if (!this.isCheckingStatus && !this.isResending && this.user && !this.user.emailVerified) {
            console.log('[Polling] Checking verification status...');
            await this.authService.reloadCurrentUser();
          }
        })
      )
      .subscribe();
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
      console.log('[VerifyEmail] Check skipped (already checking or resending).');
      return;
    }

    console.log('[VerifyEmail] Starting manual checkVerificationStatus...');
    this.isCheckingStatus = true;
    this.cdr.markForCheck(); // Show spinner for the button
    this.pollingSubscription?.unsubscribe(); // Pause background polling

    try {
      console.log('[VerifyEmail] Reloading user state...');
      await this.authService.reloadCurrentUser();
      console.log('[VerifyEmail] User state reload complete.');

      // Fetch the latest user state AFTER reload
      const latestUser = this.authService.getCurrentUser(); // Use synchronous getter
      const isVerified = !!latestUser?.emailVerified;
      console.log(`[VerifyEmail] Reloaded user status - Verified: ${isVerified}`);

      if (isVerified) {
        console.log('[VerifyEmail] Verification SUCCESSFUL via manual check. Navigating...');
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
        console.log('[VerifyEmail] Verification FAILED via manual check (still not verified). Showing message.');
        this.snackBar.open('Email is still not verified. Please ensure you clicked the link in the email.', 'Close', {
          duration: 6000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom'
        });
        // Verification failed, explicitly reset the state and restart polling *before* finally
        this.isCheckingStatus = false;
        this.cdr.markForCheck(); // Update UI now
        console.log('[VerifyEmail] Restarting polling after failed manual check.');
        this.startPollingForVerification();
      }

    } catch (error: any) {
      console.error('[VerifyEmail] Error during manual checkVerificationStatus:', error);
      this.snackBar.open(`Error checking verification status: ${error.message || 'Please try again.'}`, 'Close', {
        duration: 5000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
        panelClass: ['error-snackbar']
      });
       // Reset state and restart polling even after error *before* finally
       this.isCheckingStatus = false;
       this.cdr.markForCheck(); // Update UI now
       console.log('[VerifyEmail] Restarting polling after error during manual check.');
       this.startPollingForVerification();

    } finally {
       // The finally block might not be strictly needed anymore if state is reset above,
       // but it's a safeguard. Ensure it doesn't interfere if navigation happened.
       if (this.isCheckingStatus) { // Only reset if it wasn't reset above (e.g., during navigation)
         console.log('[VerifyEmail] Entering finally block (should only happen if navigation did not occur).');
         this.isCheckingStatus = false;
         this.cdr.markForCheck();
         console.log('[VerifyEmail] checkVerificationStatus finally block finished.');
       }
    }
  }

  navigateToApp(): void {
    this.pollingSubscription?.unsubscribe();
    const redirectUrl = this.authService.redirectUrl || '/home';
    this.authService.redirectUrl = null;
    this.router.navigate([redirectUrl]);
  }

  async signOut(): Promise<void> {
    this.isLoading = true;
    this.cdr.markForCheck();
    this.pollingSubscription?.unsubscribe();
    await this.authService.signOut();
  }
} 