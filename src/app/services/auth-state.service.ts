import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { FirebaseAuthService } from './firebase-auth.service';
import { map, switchMap } from 'rxjs/operators';
import { User } from 'firebase/auth';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

@Injectable({
  providedIn: 'root'
})
export class AuthStateService {
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  private isPremiumSubject = new BehaviorSubject<boolean>(false);
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  private readonly PREMIUM_CACHE_DURATION = 60 * 60 * 1000; // 1 hour
  private auth = getAuth();

  isAuthenticated$ = this.isAuthenticatedSubject.asObservable();
  isPremiumUser$ = this.isPremiumSubject.asObservable();
  currentUser$ = this.currentUserSubject.asObservable();

  constructor(private firebaseAuthService: FirebaseAuthService) {
    // Initialize with cached state for immediate UI response
    this.checkCachedState();
    
    // Set up real-time auth state monitoring
    onAuthStateChanged(this.auth, async (user) => {
      console.log('Auth state changed:', { isAuthenticated: !!user, userId: user?.uid });
      
      // Update current user subject
      this.currentUserSubject.next(user);
      
      // Update authentication state
      this.isAuthenticatedSubject.next(!!user);
      
      if (user) {
        // User is signed in
        localStorage.setItem('currentUser', JSON.stringify({
          uid: user.uid,
          email: user.email,
          timestamp: Date.now()
        }));
        localStorage.setItem('isAuthenticated', 'true');
        
        // Check premium status
        await this.checkPremiumStatus(user);
      } else {
        // User is signed out
        localStorage.removeItem('currentUser');
        localStorage.removeItem('isAuthenticated');
        localStorage.removeItem('premium_status');
        localStorage.removeItem('premium_status_timestamp');
        this.isPremiumSubject.next(false);
      }
    });

    // Periodic token refresh and state verification
    setInterval(async () => {
      const user = this.auth.currentUser;
      if (user) {
        try {
          await user.getIdToken(true); // Force token refresh
          await this.checkPremiumStatus(user);
        } catch (error) {
          console.error('Error refreshing token:', error);
          this.handleAuthError();
        }
      }
    }, 5 * 60 * 1000); // Check every 5 minutes
  }

  private async checkPremiumStatus(user: User) {
    try {
      console.log('Checking premium status for user:', user.uid);
      const tokenResult = await user.getIdTokenResult(true);
      const claims = tokenResult.claims as Record<string, any>;
      
      console.log('Token claims:', {
        premium: claims['premium'],
        features: claims['features'],
        exp: tokenResult.expirationTime
      });

      const isPremium = claims['premium'] === true;
      console.log('Premium status determined:', isPremium);
      
      this.isPremiumSubject.next(isPremium);
      localStorage.setItem('premium_status', String(isPremium));
      localStorage.setItem('premium_status_timestamp', String(Date.now()));
    } catch (error) {
      console.error('Error checking premium status:', error);
      this.isPremiumSubject.next(false);
    }
  }

  private checkCachedState() {
    try {
      const cachedUser = localStorage.getItem('currentUser');
      const cachedAuth = localStorage.getItem('isAuthenticated') === 'true';
      const cachedPremium = localStorage.getItem('premium_status') === 'true';
      
      if (cachedUser && cachedAuth) {
        this.isAuthenticatedSubject.next(true);
        this.isPremiumSubject.next(cachedPremium);
      } else {
        this.handleAuthError();
      }
    } catch (error) {
      this.handleAuthError();
    }
  }

  private handleAuthError() {
    this.isAuthenticatedSubject.next(false);
    this.isPremiumSubject.next(false);
    this.currentUserSubject.next(null);
    localStorage.removeItem('currentUser');
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('premium_status');
    localStorage.removeItem('premium_status_timestamp');
  }

  async refreshAuthState() {
    const user = this.auth.currentUser;
    if (user) {
      try {
        await user.getIdToken(true);
        await this.checkPremiumStatus(user);
      } catch (error) {
        console.error('Error refreshing auth state:', error);
        this.handleAuthError();
      }
    } else {
      this.handleAuthError();
    }
  }
} 