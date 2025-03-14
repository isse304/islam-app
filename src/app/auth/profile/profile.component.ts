import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { FirebaseAuthService, AppUser } from '../../services/firebase-auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit, OnDestroy {
  profileForm!: FormGroup;
  passwordForm!: FormGroup;
  user: AppUser | null = null;
  isLoading = true;
  isChangingPassword = false;
  hideCurrentPassword = true;
  hideNewPassword = true;
  hideConfirmPassword = true;
  private subscriptions: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private authService: FirebaseAuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    // Initialize forms immediately for a responsive UI
    this.initializeForms();
    
    // Pre-fill form with data from localStorage if available
    this.prefillFromCache();
  }

  private initializeForms() {
    this.profileForm = this.fb.group({
      firstName: ['', [Validators.required]],
      lastName: ['', [Validators.required]],
      email: [{ value: '', disabled: true }]
    });

    this.passwordForm = this.fb.group({
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    }, { validator: this.checkPasswords });
  }

  private prefillFromCache() {
    try {
      // Check if we have cached user info
      const cachedUserStr = localStorage.getItem('currentUser');
      if (cachedUserStr) {
        const cachedUser = JSON.parse(cachedUserStr);
        if (cachedUser) {
          // Pre-fill form with cached data for immediate display
          this.profileForm.patchValue({
            firstName: cachedUser.firstName || '',
            lastName: cachedUser.lastName || '',
            email: cachedUser.email || ''
          });
          
          // We can hide loading since we're showing cached data
          setTimeout(() => {
            this.isLoading = false;
          }, 100);
        }
      }
    } catch (error) {
      // Ignore cache errors, will load from auth service
    }
  }

  ngOnInit(): void {
    // Load user data in the background
    const userSub = this.authService.user$.subscribe(user => {
      if (user) {
        this.user = user;
        this.profileForm.patchValue({
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          email: user.email
        });
        
        // We've loaded the actual data, hide loading indicator
        this.isLoading = false;
      } else {
        // Not logged in, redirect to login
        this.router.navigate(['/auth/login']);
      }
    });
    
    this.subscriptions.push(userSub);
    
    // Ensure loading state doesn't stay forever if something goes wrong
    setTimeout(() => {
      this.isLoading = false;
    }, 2000);
  }
  
  ngOnDestroy(): void {
    // Clean up subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  // Custom validator to check if passwords match
  checkPasswords(group: FormGroup) {
    const password = group.get('newPassword')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    
    return password === confirmPassword ? null : { notMatching: true };
  }

  async updateProfile(): Promise<void> {
    if (this.profileForm.invalid) {
      return;
    }

    this.isLoading = true;
    const { firstName, lastName } = this.profileForm.value;
    const displayName = `${firstName} ${lastName}`;

    try {
      await this.authService.updateUserProfile({ displayName });
      this.snackBar.open('Profile updated successfully!', 'Close', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom'
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      this.snackBar.open('Failed to update profile. Please try again.', 'Close', {
        duration: 5000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom'
      });
    } finally {
      this.isLoading = false;
    }
  }

  async changePassword(): Promise<void> {
    if (this.passwordForm.invalid) {
      return;
    }

    this.isChangingPassword = true;
    const { currentPassword, newPassword } = this.passwordForm.value;

    try {
      await this.authService.changePassword(currentPassword, newPassword);
      this.snackBar.open('Password changed successfully!', 'Close', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom'
      });
      this.passwordForm.reset();
    } catch (error: any) {
      console.error('Error changing password:', error);
      let errorMessage = 'Failed to change password. Please try again.';
      
      if (error.code === 'auth/wrong-password') {
        errorMessage = 'Current password is incorrect.';
      }
      
      this.snackBar.open(errorMessage, 'Close', {
        duration: 5000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom'
      });
    } finally {
      this.isChangingPassword = false;
    }
  }

  async signOut(): Promise<void> {
    try {
      await this.authService.signOut();
      this.router.navigate(['/']);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }
} 