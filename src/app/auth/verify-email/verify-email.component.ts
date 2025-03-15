import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FirebaseAuthService } from '../../services/firebase-auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-verify-email',
  templateUrl: './verify-email.component.html',
  styleUrls: ['./verify-email.component.scss'],
  standalone: true,
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
export class VerifyEmailComponent implements OnInit {
  userEmail: string | null = null;
  isLoading = false;

  constructor(
    private authService: FirebaseAuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    // Get current user's email
    this.authService.user$.subscribe(user => {
      this.userEmail = user?.email || null;
      
      // If user is verified or no user is logged in, redirect to home
      if (!user || user.emailVerified) {
        this.router.navigate(['/']);
      }
    });
  }

  async resendVerificationEmail(): Promise<void> {
    this.isLoading = true;
    
    try {
      // This would need to be implemented in the auth service
      // Firebase doesn't expose this directly in the client SDK
      // You'd need to create a custom endpoint or use Firebase Functions
      await this.authService.sendEmailVerification();
      
      this.snackBar.open('Verification email sent. Please check your inbox.', 'Close', {
        duration: 5000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom'
      });
    } catch (error) {
      console.error('Error sending verification email:', error);
      this.snackBar.open('Failed to send verification email. Please try again.', 'Close', {
        duration: 5000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom'
      });
    } finally {
      this.isLoading = false;
    }
  }

  goToLogin(): void {
    this.router.navigate(['/auth/login']);
  }
} 