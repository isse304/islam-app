import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { SubscriptionDialogComponent } from '../components/subscription-dialog/subscription-dialog.component';
import { AuthStateService } from './auth-state.service';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class SubscriptionService {
  constructor(
    private dialog: MatDialog,
    private authStateService: AuthStateService,
    private router: Router
  ) {}

  async showSubscriptionDialog(feature: string, returnUrl?: string): Promise<boolean> {
    const isPremium = await firstValueFrom(this.authStateService.isPremiumUser$);
    if (isPremium) return true;

    const dialogRef = this.dialog.open(SubscriptionDialogComponent, {
      width: '800px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: ['subscription-dialog', 'centered-dialog'],
      disableClose: false,
      autoFocus: false,
      data: { feature, returnUrl }
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      // User clicked upgrade
      this.router.navigate(['/premium'], {
        queryParams: {
          feature,
          returnUrl: returnUrl || this.router.url
        }
      });
      return false;
    }
    
    // User cancelled
    if (returnUrl) {
      this.router.navigate(['/']);
    }
    return false;
  }

  async checkPremiumAccess(feature: string, returnUrl?: string): Promise<boolean> {
    // First check if user is authenticated
    const isAuthenticated = await firstValueFrom(this.authStateService.isAuthenticated());
    if (!isAuthenticated) {
      console.log('User not authenticated, redirecting to login');
      this.router.navigate(['/login'], {
        queryParams: {
          returnUrl: returnUrl || this.router.url
        }
      });
      return false;
    }

    // Then check premium status
    const isPremium = await firstValueFrom(this.authStateService.isPremiumUser$);
    console.log('Checking premium access for', feature, ':', isPremium);
    
    if (isPremium) {
      return true;
    }

    // Show subscription dialog if not premium
    return this.showSubscriptionDialog(feature, returnUrl);
  }

  // Force reset premium status (for testing/debugging)
  async resetPremiumAccess() {
    await this.authStateService.resetPremiumStatus();
  }
} 