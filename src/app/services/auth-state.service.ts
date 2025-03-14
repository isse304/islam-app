import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FirebaseAuthService } from './firebase-auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthStateService {
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  private isPremiumSubject = new BehaviorSubject<boolean>(false);

  isAuthenticated$ = this.isAuthenticatedSubject.asObservable();
  isPremiumUser$ = this.isPremiumSubject.asObservable();

  constructor(private authService: FirebaseAuthService) {
    // Check for cached user first for immediate UI response
    this.checkCachedUser();
    
    // Then check formal auth status
    this.checkAuthStatus();
    this.checkPremiumStatus();
    
    // Update auth state periodically
    setInterval(() => {
      this.updateAuthState();
      this.checkPremiumStatus();
    }, 60000); // Check every minute

    // Subscribe to auth changes to recheck premium status
    this.authService.user$.subscribe(user => {
      // Update auth state when user state changes
      const isAuthenticated = !!user;
      this.setAuthenticated(isAuthenticated);
      this.checkPremiumStatus();
    });
  }

  // Check localStorage for cached user data (for immediate UI response)
  private checkCachedUser() {
    try {
      const cachedUser = localStorage.getItem('currentUser');
      if (cachedUser) {
        // We have a cached user, so we can assume authenticated state
        // This gives us immediate UI feedback before Firebase auth completes
        this.setAuthenticated(true);
      }
    } catch (error) {
      // Ignore errors when checking cache
    }
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
    this.isPremiumSubject.next(value);
    localStorage.setItem('isPremiumUser', value.toString());
  }

  async isPremiumUser(): Promise<boolean> {
    const isPremium = localStorage.getItem('isPremiumUser') === 'true';
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
        // Don't log this to reduce console noise
        this.setPremiumStatus(false);
        return;
      }

      // Then check premium status
      const hasPremium = await this.authService.isPremiumUser();
      this.setPremiumStatus(hasPremium);
    } catch (error) {
      // Reduce console noise for expected errors
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
      // Reduce console noise
      console.log('Auth state update: User not authenticated');
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
    this.setPremiumStatus(false);
    localStorage.removeItem('isPremiumUser');
  }
} 