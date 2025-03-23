import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FirebaseAuthService } from './firebase-auth.service';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthStateService {
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  private readonly PREMIUM_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

  isAuthenticated$ = this.isAuthenticatedSubject.asObservable();

  constructor(private firebaseAuthService: FirebaseAuthService) {
    // Check for cached user first for immediate UI response
    this.checkCachedUser();
    
    // Then check formal auth status
    this.checkAuthStatus();
    
    // Update auth state periodically
    setInterval(() => {
      this.updateAuthState();
    }, 60000); // Check every minute

    // Subscribe to auth changes to recheck premium status
    this.firebaseAuthService.user$.subscribe(user => {
      // Update auth state when user state changes
      const isAuthenticated = !!user;
      this.setAuthenticated(isAuthenticated);
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
  }

  private checkAuthStatus() {
    const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
    this.setAuthenticated(isAuthenticated);
  }

  private async updateAuthState() {
    try {
      const token = await this.firebaseAuthService.getToken();
      const isAuthenticated = !!token;
      this.setAuthenticated(isAuthenticated);
    } catch (error) {
      // Reduce console noise
      console.log('Auth state update: User not authenticated');
      this.setAuthenticated(false);
    }
  }

  get isPremiumUser$(): Observable<boolean> {
    return this.firebaseAuthService.user$.pipe(
      map(user => {
        if (!user) return false;

        // Check cached premium status first
        const premiumStatus = localStorage.getItem('premium_status');
        const premiumTimestamp = localStorage.getItem('premium_status_timestamp');
        
        if (premiumStatus && premiumTimestamp) {
          const isPremiumValid = (Date.now() - parseInt(premiumTimestamp)) < this.PREMIUM_CACHE_DURATION;
          if (isPremiumValid) {
            return premiumStatus === 'true' || user.isPremium === true;
          }
        }

        // If cache is invalid or missing, use user object's premium status
        return user.isPremium === true;
      })
    );
  }
} 