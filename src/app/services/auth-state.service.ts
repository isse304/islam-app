import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthStateService {
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  private isPremiumSubject = new BehaviorSubject<boolean>(false);

  isAuthenticated$ = this.isAuthenticatedSubject.asObservable();
  isPremiumUser$ = this.isPremiumSubject.asObservable();

  constructor(private authService: AuthService) {
    this.checkAuthStatus();
    this.checkPremiumStatus();
    
    // Update auth state periodically
    setInterval(() => {
      this.updateAuthState();
      this.checkPremiumStatus();
    }, 60000); // Check every minute

    // Subscribe to auth changes to recheck premium status
    this.authService.user$.subscribe(() => {
      this.checkPremiumStatus();
    });
  }

  setAuthenticated(value: boolean) {
    this.isAuthenticatedSubject.next(value);
    localStorage.setItem('isAuthenticated', value.toString());
    if (!value) {
      // If user is not authenticated, they can't be premium
      this.setPremiumStatus(false);
    }
  }

  setPremiumStatus(value: boolean) {
    console.log('Setting premium status:', value);
    this.isPremiumSubject.next(value);
    localStorage.setItem('isPremiumUser', value.toString());
  }

  async isPremiumUser(): Promise<boolean> {
    const isPremium = localStorage.getItem('isPremiumUser') === 'true';
    console.log('Checking premium status from storage:', isPremium);
    return isPremium;
  }

  private checkAuthStatus() {
    const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
    this.setAuthenticated(isAuthenticated);
  }

  private async checkPremiumStatus() {
    try {
      // First check if user is authenticated
      const isAuthenticated = await this.authService.isAuthenticated();
      if (!isAuthenticated) {
        console.log('User not authenticated, setting premium to false');
        this.setPremiumStatus(false);
        return;
      }

      // Then check premium status
      const hasPremium = await this.authService.isPremiumUser();
      console.log('Premium status checked:', hasPremium);
      this.setPremiumStatus(hasPremium);
    } catch (error) {
      console.error('Error checking premium status:', error);
      this.setPremiumStatus(false);
    }
  }

  private async updateAuthState() {
    try {
      const token = await this.authService.getToken();
      const isAuthenticated = !!token;
      this.setAuthenticated(isAuthenticated);
      
      if (!isAuthenticated) {
        this.setPremiumStatus(false);
      }
    } catch (error) {
      console.error('Error updating auth state:', error);
      this.setAuthenticated(false);
      this.setPremiumStatus(false);
    }
  }

  async refreshPremiumStatus() {
    await this.checkPremiumStatus();
  }

  // Helper method to check if authenticated
  isAuthenticated(): Observable<boolean> {
    return this.isAuthenticated$;
  }

  // Force reset premium status (for testing/debugging)
  resetPremiumStatus() {
    console.log('Resetting premium status');
    this.setPremiumStatus(false);
    localStorage.removeItem('isPremiumUser');
  }
} 