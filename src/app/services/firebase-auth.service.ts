import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, of, from, throwError } from 'rxjs';
import { catchError, map, switchMap, take, tap } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

// Firebase imports
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  User as FirebaseUser,
  UserCredential,
  GoogleAuthProvider,
  signInWithRedirect,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateEmail,
  deleteUser,
  sendEmailVerification,
  signInWithPopup,
  getRedirectResult,
} from 'firebase/auth';

import { UserInfo } from '@angular/fire/auth';

export interface AppUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  emailVerified: boolean;
  createdAt: Date;
  lastSignInAt?: Date;
  preferences?: {
    selectedReciter?: number;
    selectedTranslation?: string;
    fontSize?: number;
    darkMode?: boolean;
    bookmarks?: string[];
    subscriptionStatus?: string;
  };
  isAdmin: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class FirebaseAuthService {
  private _user = new BehaviorSubject<AppUser | null>(null);
  user$ = this._user.asObservable();
  isLoggedIn$ = this.user$.pipe(map(user => !!user));

  // Firebase app and auth instances
  private firebaseApp = initializeApp(environment.firebase);
  private auth = getAuth(this.firebaseApp);
  
  // Property to store the URL that the user tried to access before authentication
  redirectUrl: string | null = null;
  private readonly LAST_ROUTE_KEY = 'lastRoute';
  private readonly ROUTE_STATE_KEY = 'routeState';

  constructor(
    private router: Router,
    private http: HttpClient
  ) {
    // Initialize user state from localStorage immediately for faster UI response
    this.initFromCache();
    
    // Then listen for Firebase auth state changes
    onAuthStateChanged(this.auth, (firebaseUser) => {
      console.log('Firebase auth state changed:', !!firebaseUser);
      if (firebaseUser) {
        this.handleUserSignedIn(firebaseUser);
      } else {
        // Clear localStorage and update user state
        localStorage.removeItem('currentUser');
        localStorage.removeItem('isAuthenticated');
        this._user.next(null);
      }
    });
  }

  /**
   * Initialize user state from localStorage cache for immediate UI response
   */
  private initFromCache() {
    try {
      const cachedUserJson = localStorage.getItem('currentUser');
      if (cachedUserJson) {
        const cachedUser = JSON.parse(cachedUserJson);
        // Update the BehaviorSubject with cached data immediately
        this._user.next({
          ...cachedUser,
          preferences: {}, // Will be populated later from API
          isAdmin: false // Will be checked later
        } as AppUser);
        
        // Mark as authenticated in localStorage
        localStorage.setItem('isAuthenticated', 'true');
        
        console.log('Initialized user state from cache');
      }
    } catch (error) {
      console.warn('Error initializing from cache:', error);
    }
  }

  // Convert Firebase user to our User model
  private mapFirebaseUser(firebaseUser: FirebaseUser): AppUser {
    const names = firebaseUser.displayName?.split(' ') || ['', ''];
    
    return {
      id: firebaseUser.uid,
      email: firebaseUser.email || '',
      firstName: names[0] || '',
      lastName: names.slice(1).join(' ') || '',
      imageUrl: firebaseUser.photoURL || '',
      emailVerified: firebaseUser.emailVerified,
      createdAt: new Date(firebaseUser.metadata.creationTime || Date.now()),
      lastSignInAt: firebaseUser.metadata.lastSignInTime ? new Date(firebaseUser.metadata.lastSignInTime) : undefined,
      preferences: {},
      isAdmin: false // Set this based on your admin logic, e.g., from a database check
    };
  }

  private async handleUserSignedIn(firebaseUser: FirebaseUser): Promise<void> {
    // Map the Firebase user to our User model
    const user = this.mapFirebaseUser(firebaseUser);
    
    try {
      // Store basic user info in localStorage for faster app loading
      localStorage.setItem('currentUser', JSON.stringify({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        imageUrl: user.imageUrl,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt
      }));
      
      // Mark as authenticated in localStorage
      localStorage.setItem('isAuthenticated', 'true');
      
      // Update the user subject with basic data immediately
      this._user.next(user);
      
      // Fetch user preferences in the background
      this.fetchUserPreferences(user.id)
        .then(preferences => {
          user.preferences = preferences;
          this._user.next({ ...user });
        })
        .catch(error => {
          console.warn('Error fetching user preferences:', error);
        });
      
      // Check if user is admin in the background
      this.checkIfUserIsAdmin(user.id)
        .then(isAdmin => {
          user.isAdmin = isAdmin;
          this._user.next({ ...user });
        })
        .catch(error => {
          console.warn('Error checking admin status:', error);
        });
    } catch (error) {
      console.error('Error handling user sign in:', error);
      // Still set the user with basic data even if we couldn't fetch preferences
      this._user.next(user);
    }
  }

  private async fetchUserPreferences(userId: string): Promise<any> {
    try {
      // First check if API is available
      try {
        const response = await this.http.get<any>(`${environment.apiUrl}/api/users/${userId}/preferences`).toPromise();
        // If successful, cache the preferences
        try {
          localStorage.setItem(`user_preferences_${userId}`, JSON.stringify(response || {}));
        } catch (cacheError) {
          console.warn('Error caching preferences:', cacheError);
        }
        return response || {};
      } catch (error) {
        console.warn('User preferences API endpoint not available, checking localStorage');
        
        // Check for localStorage preferences as fallback
        const localPrefs = localStorage.getItem(`user_preferences_${userId}`);
        if (localPrefs) {
          try {
            return JSON.parse(localPrefs);
          } catch (parseError) {
            console.warn('Error parsing localStorage preferences:', parseError);
          }
        }
        
        // Return default preferences if API endpoint doesn't exist and no localStorage data
        return {
          selectedReciter: 7,  // Default reciter
          selectedTranslation: 'en.sahih', // Default translation
          fontSize: 18,        // Default font size
          darkMode: false,     // Default theme
          bookmarks: []        // Empty bookmarks
        };
      }
    } catch (error) {
      console.error('Error fetching user preferences:', error);
      return {};
    }
  }

  private async checkIfUserIsAdmin(userId: string): Promise<boolean> {
    try {
      try {
        const response = await this.http.get<{isAdmin: boolean}>(`${environment.apiUrl}/api/users/${userId}/admin-status`).toPromise();
        return response?.isAdmin || false;
      } catch (error) {
        // Silently handle 404 errors for admin endpoint - this is expected in development
        const httpError = error as any;
        if (httpError?.status === 404) {
          // Only log a message without the full error object to reduce console noise
          console.log('Admin status endpoint not available, defaulting to non-admin');
        } else {
          // For other errors, keep the warning but limit details
          console.warn('Could not check admin status');
        }
        // Default to non-admin if API endpoint doesn't exist
        return false;
      }
    } catch (error) {
      // General error handling as a fallback, but keep it quiet
      console.log('Error in admin status check, defaulting to non-admin');
      return false;
    }
  }

  // Email/Password Sign In
  signInWithEmailAndPassword(email: string, password: string): Promise<UserCredential> {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  // Create new user with email/password
  createUserWithEmailAndPassword(email: string, password: string): Promise<UserCredential> {
    return createUserWithEmailAndPassword(this.auth, email, password);
  }

  // Sign in with Google
  signInWithGoogle(): Promise<UserCredential> {
    const provider = new GoogleAuthProvider();
    
    // Add scopes for better profile access
    provider.addScope('profile');
    provider.addScope('email');
    provider.addScope('openid');
    
    // Always select an account to avoid auto-login issues
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    
    console.log('Starting Google sign-in process');
    
    // SIMPLIFIED IMPLEMENTATION - mobile detection was causing issues
    return new Promise<UserCredential>((resolve, reject) => {
      // First try popup - more direct and less error-prone
      signInWithPopup(this.auth, provider)
        .then(result => {
          console.log('Google sign-in popup successful');
          resolve(result);
        })
        .catch(error => {
          console.warn('Popup sign-in failed, trying redirect:', error.code);
          
          // If popup fails, try redirect as fallback
          try {
            // Save current URL for redirect back
            this.saveCurrentRoute();
            
            // Use redirect instead (will navigate away from page)
            signInWithRedirect(this.auth, provider);
            
            // Return empty credential as placeholder
            // (this is expected since redirect refreshes the page)
            resolve({} as UserCredential);
          } catch (redirectError) {
            console.error('Redirect sign-in failed:', redirectError);
            reject(redirectError);
          }
        });
    });
  }

  // Simplified authentication result handling after redirect
  handleRedirectResult(): Promise<UserCredential | null> {
    try {
      return getRedirectResult(this.auth);
    } catch (error) {
      console.error('Error handling redirect result:', error);
      return Promise.resolve(null);
    }
  }

  // Sign out
  signOut(): Promise<void> {
    // Update the state first before the async operation
    this._user.next(null);
    
    // Remove cache immediately
    localStorage.removeItem('currentUser');
    localStorage.removeItem('isAuthenticated');
    
    // Now handle the actual sign out with Firebase
    return signOut(this.auth).then(() => {
      // This is redundant but ensures all cleanup is done
      this._user.next(null);
      this.router.navigate(['/']);
    });
  }

  // Update user profile
  updateUserProfile(profileData: Partial<UserInfo>): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      return Promise.reject(new Error('No user logged in'));
    }
    return updateProfile(user, profileData);
  }

  // Send password reset email
  sendPasswordResetEmail(email: string): Promise<void> {
    return sendPasswordResetEmail(this.auth, email);
  }

  // Get current user
  getCurrentUser(): AppUser | null {
    const firebaseUser = this.auth.currentUser;
    if (!firebaseUser) {
      return null;
    }
    return this.mapFirebaseUser(firebaseUser);
  }

  // Check if user is authenticated
  isAuthenticated(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const unsubscribe = onAuthStateChanged(this.auth, (user) => {
        unsubscribe(); // Stop listening after first response
        resolve(!!user);
      });
    });
  }

  // Get user settings (preferences)
  async getUserSettings(): Promise<any> {
    const user = this.auth.currentUser;
    if (!user) {
      return Promise.reject(new Error('No user logged in'));
    }
    
    try {
      // Try to get from API first
      try {
        const apiPrefs = await this.fetchUserPreferences(user.uid);
        if (Object.keys(apiPrefs).length > 0) {
          return apiPrefs;
        }
      } catch (error) {
        console.warn('Could not fetch user preferences from API');
      }
      
      // Try localStorage as fallback
      const localPrefs = localStorage.getItem(`user_preferences_${user.uid}`);
      if (localPrefs) {
        try {
          return JSON.parse(localPrefs);
        } catch (error) {
          console.error('Error parsing localStorage preferences:', error);
        }
      }
      
      // Return default preferences if nothing is found
      return {
        selectedReciter: 7,
        selectedTranslation: 'en.sahih', 
        fontSize: 18,
        darkMode: false,
        bookmarks: []
      };
    } catch (error) {
      console.error('Error getting user settings:', error);
      return {};
    }
  }

  // Save user preferences
  async saveUserPreferences(preferences: any): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      return Promise.reject(new Error('No user logged in'));
    }
    
    try {
      try {
        await this.http.put(`${environment.apiUrl}/api/users/${user.uid}/preferences`, preferences).toPromise();
      } catch (error) {
        console.warn('User preferences API endpoint not available for saving, using local storage instead');
        // If API endpoint doesn't exist, fallback to localStorage
        localStorage.setItem(`user_preferences_${user.uid}`, JSON.stringify(preferences));
      }
    } catch (error) {
      console.error('Error saving user preferences:', error);
      throw error;
    }
  }

  // Get reading history
  async getReadingHistory(): Promise<any[]> {
    const user = this.auth.currentUser;
    if (!user) {
      return Promise.reject(new Error('No user logged in'));
    }
    
    try {
      const result = await this.http.get<any[]>(`${environment.apiUrl}/api/users/${user.uid}/reading-history`).toPromise();
      return result || [];
    } catch (error) {
      console.error('Error getting reading history:', error);
      return [];
    }
  }

  // Remove bookmark
  async removeBookmark(verseKey: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      return Promise.reject(new Error('No user logged in'));
    }
    
    try {
      await this.http.delete(`${environment.apiUrl}/api/users/${user.uid}/bookmarks/${verseKey}`).toPromise();
    } catch (error) {
      console.error('Error removing bookmark:', error);
      throw error;
    }
  }

  // Clear reading history
  async clearReadingHistory(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      return Promise.reject(new Error('No user logged in'));
    }
    
    try {
      await this.http.delete(`${environment.apiUrl}/api/users/${user.uid}/reading-history`).toPromise();
    } catch (error) {
      console.error('Error clearing reading history:', error);
      throw error;
    }
  }

  // Show login modal/UI
  async login(): Promise<void> {
    this.saveCurrentRoute();
    this.router.navigate(['/auth/login']);
  }

  // Navigate to the originally requested URL after successful login
  navigateToSavedRoute(): void {
    const route = localStorage.getItem(this.LAST_ROUTE_KEY) || '/';
    const state = localStorage.getItem(this.ROUTE_STATE_KEY);
    
    // Clear saved route
    localStorage.removeItem(this.LAST_ROUTE_KEY);
    localStorage.removeItem(this.ROUTE_STATE_KEY);
    
    // Navigate to saved route
    try {
      const parsedState = state ? JSON.parse(state) : undefined;
      this.router.navigateByUrl(route, {
        state: parsedState
      });
    } catch (error) {
      console.error('Error parsing route state:', error);
      this.router.navigateByUrl(route);
    }
  }

  // Save the current route for later redirect
  private saveCurrentRoute(): void {
    const currentRoute = this.router.url;
    if (currentRoute !== '/auth/login' && currentRoute !== '/auth/signup') {
      localStorage.setItem(this.LAST_ROUTE_KEY, currentRoute);
      
      // Try to save route state if available
      try {
        const routeState = window.history.state;
        if (routeState) {
          localStorage.setItem(this.ROUTE_STATE_KEY, JSON.stringify(routeState));
        }
      } catch (error) {
        console.error('Error saving route state:', error);
      }
    }
  }

  // Save QuranReader state
  async saveQuranReaderState(state: any): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      return Promise.reject(new Error('No user logged in'));
    }

    try {
      // First, get current user settings
      const userSettings = await this.getUserSettings();
      
      // Add this state to reading history
      const readingHistory = userSettings.readingHistory || [];
      readingHistory.unshift({
        ...state,
        timestamp: new Date()
      });
      
      // Keep only the last 20 items
      const updatedHistory = readingHistory.slice(0, 20);
      
      // Try to update via API first
      try {
        await this.http.put(
          `${environment.apiUrl}/api/users/${user.uid}/reading-history`, 
          updatedHistory
        ).toPromise();
      } catch (error) {
        console.warn('Reading history API endpoint not available, using localStorage instead');
        // Save to localStorage as fallback
        const preferences = await this.getUserSettings();
        preferences.readingHistory = updatedHistory;
        localStorage.setItem(`user_preferences_${user.uid}`, JSON.stringify(preferences));
      }
    } catch (error) {
      console.error('Error saving Quran reader state:', error);
      throw error;
    }
  }

  // Get token for authentication
  async getToken(): Promise<string | null> {
    const user = this.auth.currentUser;
    if (!user) {
      return null;
    }
    
    return user.getIdToken();
  }

  // Check if user has premium status
  async isPremiumUser(): Promise<boolean> {
    const user = this.auth.currentUser;
    if (!user) {
      return false;
    }
    
    try {
      // First check user custom claims
      try {
        const idTokenResult = await user.getIdTokenResult(true); // Force refresh
        if (idTokenResult.claims['premium'] === true || 
            idTokenResult.claims['subscriptionStatus'] === 'trial' ||
            idTokenResult.claims['subscriptionStatus'] === 'active' ||
            idTokenResult.claims['subscriptionStatus'] === 'premium') {
          console.log('Premium status found in Firebase custom claims');
          return true;
        }
      } catch (claimsError) {
        console.warn('Error checking custom claims:', claimsError);
      }
      
      // Then check user settings from preferences
      const userSettings = await this.getUserSettings();
      const status = userSettings?.preferences?.subscriptionStatus || '';
      
      // Check for all types of premium status values
      const isPremium = ['premium', 'trial', 'active'].includes(status);
      if (isPremium) {
        console.log('Premium status found in user preferences:', status);
      }
      
      return isPremium;
    } catch (error) {
      console.error('Error checking premium status:', error);
      return false;
    }
  }

  // Send email verification
  async sendEmailVerification(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      return Promise.reject(new Error('No user logged in'));
    }
    
    return sendEmailVerification(user);
  }

  // Change password
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user || !user.email) {
      return Promise.reject(new Error('No authenticated user'));
    }
    
    try {
      // Re-authenticate the user
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      
      // Update password
      return updatePassword(user, newPassword);
    } catch (error) {
      console.error('Error changing password:', error);
      throw error;
    }
  }
} 