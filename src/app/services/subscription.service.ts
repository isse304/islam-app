import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { SubscriptionDialogComponent } from '../components/subscription-dialog/subscription-dialog.component';
import { AuthStateService } from './auth-state.service';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SubscriptionService {
  constructor(
    private dialog: MatDialog,
    private authStateService: AuthStateService
  ) {}

  async showSubscriptionDialog(feature: string): Promise<boolean> {
    const isPremium = await firstValueFrom(this.authStateService.isPremiumUser$);
    if (isPremium) return true;

    const dialogRef = this.dialog.open(SubscriptionDialogComponent, {
      width: '800px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: ['subscription-dialog', 'centered-dialog'],
      disableClose: false,
      autoFocus: false,
      data: { feature }
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    return !!result;
  }

  async checkPremiumAccess(feature: string): Promise<boolean> {
    const isPremium = await firstValueFrom(this.authStateService.isPremiumUser$);
    if (isPremium) return true;

    return this.showSubscriptionDialog(feature);
  }
} 