import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, of, from, throwError, switchMap, firstValueFrom } from 'rxjs';
import { catchError, map, take, tap } from 'rxjs/operators';
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
      // First check localStorage cache with timestamp
      const localPrefs = localStorage.getItem(`user_preferences_${userId}`);
      const cacheTimestamp = localStorage.getItem(`user_preferences_timestamp_${userId}`);
      
      if (localPrefs && cacheTimestamp) {
        const cacheTime = parseInt(cacheTimestamp, 10);
        const now = Date.now();
        // Use cache if it's less than 5 minutes old
        if (now - cacheTime < 5 * 60 * 1000) {
          console.log('Using cached preferences in fetchUserPreferences');
          return JSON.parse(localPrefs);
        }
      }
      
      // If cache is stale or not available, try API
      try {
        // Check when we last made an API call
        const lastFetchTimestamp = localStorage.getItem(`last_preferences_fetch_${userId}`);
        if (lastFetchTimestamp) {
          const lastFetchTime = parseInt(lastFetchTimestamp, 10);
          const now = Date.now();
          // Only make API call if last fetch was more than 10 seconds ago
          if (now - lastFetchTime < 10000) {
            console.log('Throttling API fetch, using cached data');
            if (localPrefs) {
              return JSON.parse(localPrefs);
            }
          }
        }
        
        // Update the last fetch timestamp
        localStorage.setItem(`last_preferences_fetch_${userId}`, Date.now().toString());
        
        // Make the API call
        const response = await this.http.get<any>(`${environment.apiUrl}/api/users/${userId}/preferences`).toPromise();
        
        // If successful, cache the preferences with timestamp
        if (response) {
          localStorage.setItem(`user_preferences_${userId}`, JSON.stringify(response));
          localStorage.setItem(`user_preferences_timestamp_${userId}`, Date.now().toString());
        }
        
        return response || {};
      } catch (error) {
        console.warn('User preferences API endpoint not available, checking localStorage');
        
        // Use localStorage preferences as fallback
        if (localPrefs) {
          try {
            return JSON.parse(localPrefs);
          } catch (parseError) {
            console.error('Error parsing localStorage preferences:', parseError);
          }
        }
        
        // Return empty object if no preferences found
        return {};
      }
    } catch (error) {
      console.error('Error in fetchUserPreferences:', error);
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
    return firstValueFrom(this.saveUserPreferencesObservable(preferences));
  }

  // Save user preferences (Observable version)
  saveUserPreferencesObservable(preferences: any): Observable<any> {
    const user = this.auth.currentUser;
    if (!user) {
      return throwError(() => new Error('No user logged in'));
    }
    
    // Save to localStorage as backup with timestamp
    localStorage.setItem(`user_preferences_${user.uid}`, JSON.stringify(preferences));
    localStorage.setItem(`user_preferences_timestamp_${user.uid}`, Date.now().toString());
    
    // Check when we last made an API call
    const lastSaveTimestamp = localStorage.getItem(`last_preferences_save_${user.uid}`);
    if (lastSaveTimestamp) {
      const lastSaveTime = parseInt(lastSaveTimestamp, 10);
      const now = Date.now();
      // Only make API call if last save was more than 3 seconds ago
      if (now - lastSaveTime < 3000) {
        console.log('Throttling API call, returning cached result');
        return of({ success: true, source: 'local', preferences });
      }
    }
    
    // Update the last save timestamp
    localStorage.setItem(`last_preferences_save_${user.uid}`, Date.now().toString());
    
    // Try to save to server
    return this.http.put<any>(`${environment.apiUrl}/api/users/${user.uid}/preferences`, preferences).pipe(
      tap(() => {
        // Update the last successful save timestamp
        localStorage.setItem(`last_successful_save_${user.uid}`, Date.now().toString());
      }),
      catchError(error => {
        console.warn('Could not save preferences to API:', error);
        // If we got a 429 error, increase the throttle time
        if (error.status === 429) {
          const now = Date.now();
          localStorage.setItem(`last_preferences_save_${user.uid}`, (now + 10000).toString()); // Add 10 seconds to throttle
        }
        return of({ success: true, source: 'local', preferences });
      }),
      map(() => preferences)
    );
  }

  // updateUserPreferences is now an alias for saveUserPreferences for backward compatibility
  updateUserPreferences = this.saveUserPreferences;

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

  // Get user preferences
  getUserPreferences(): Observable<any> {
    const user = this.auth.currentUser;
    if (!user) {
      return throwError(() => new Error('No user logged in'));
    }

    // Try to get from localStorage cache first
    const localPrefs = localStorage.getItem(`user_preferences_${user.uid}`);
    if (localPrefs) {
      try {
        const cachedPrefs = JSON.parse(localPrefs);
        // Check if cache is less than 5 minutes old
        const cacheTimestamp = localStorage.getItem(`user_preferences_timestamp_${user.uid}`);
        if (cacheTimestamp) {
          const cacheTime = parseInt(cacheTimestamp, 10);
          const now = Date.now();
          // Only use cache if it's less than 5 minutes old
          if (now - cacheTime < 5 * 60 * 1000) {
            console.log('Using cached user preferences');
            return of(cachedPrefs);
          }
        }
      } catch (error) {
        console.warn('Error parsing cached preferences:', error);
      }
    }

    // Then try to get from API with throttling
    console.log('Fetching user preferences from API');
    return this.http.get<any>(`${environment.apiUrl}/api/users/${user.uid}/preferences`).pipe(
      tap(prefs => {
        // Save to localStorage with timestamp
        try {
          localStorage.setItem(`user_preferences_${user.uid}`, JSON.stringify(prefs || {}));
          localStorage.setItem(`user_preferences_timestamp_${user.uid}`, Date.now().toString());
        } catch (error) {
          console.warn('Error caching preferences:', error);
        }
      }),
      catchError(error => {
        console.warn('Could not fetch user preferences from API:', error);
        
        // Try localStorage as fallback
        if (localPrefs) {
          try {
            return of(JSON.parse(localPrefs));
          } catch (error) {
            console.error('Error parsing localStorage preferences:', error);
          }
        }
        
        // Return empty preferences if nothing else works
        return of({});
      })
    );
  }

  // Get user bookmarks
  getBookmarks(): Observable<string[]> {
    // First check if user is logged in
    const user = this._user.value;
    if (!user) {
      return of([]);
    }
    
    // Check for cached bookmarks (less than 5 minutes old)
    const cachedBookmarksString = localStorage.getItem('bookmarks_cache');
    const cachedTimestampString = localStorage.getItem('bookmarks_timestamp');
    
    if (cachedBookmarksString && cachedTimestampString) {
      const cachedTimestamp = parseInt(cachedTimestampString, 10);
      const now = Date.now();
      const fiveMinutesInMs = 5 * 60 * 1000;
      
      // If cache is less than 5 minutes old, use it
      if (now - cachedTimestamp < fiveMinutesInMs) {
        try {
          const cachedBookmarks = JSON.parse(cachedBookmarksString);
          console.log('Using cached bookmarks');
          return of(cachedBookmarks);
        } catch (e) {
          console.warn('Failed to parse cached bookmarks:', e);
          // Continue to API if parsing fails
        }
      }
    }
    
    // Check if we recently made an API call (within last 10 seconds)
    const lastAPICallString = localStorage.getItem('bookmarks_last_api_call');
    if (lastAPICallString) {
      const lastAPICall = parseInt(lastAPICallString, 10);
      const now = Date.now();
      const tenSecondsInMs = 10 * 1000;
      
      // If last API call was less than 10 seconds ago, return cached data or empty array
      if (now - lastAPICall < tenSecondsInMs) {
        console.log('Throttling bookmarks API call');
        if (cachedBookmarksString) {
          try {
            return of(JSON.parse(cachedBookmarksString));
          } catch (e) {
            return of([]);
          }
        }
        return of([]);
      }
    }
    
    // Store timestamp of this API call
    localStorage.setItem('bookmarks_last_api_call', Date.now().toString());
    
    // Make the API call
    return this.http.get<string[]>(`${environment.apiUrl}/api/users/${user.id}/bookmarks`).pipe(
      map((response: string[]) => {
        // Cache the successful response with timestamp
        localStorage.setItem('bookmarks_cache', JSON.stringify(response));
        localStorage.setItem('bookmarks_timestamp', Date.now().toString());
        return response;
      }),
      catchError(error => {
        console.error('Error fetching bookmarks from API:', error);
        
        // If we get a 429 error, increase the throttle time
        if (error.status === 429) {
          localStorage.setItem('bookmarks_last_api_call', (Date.now() + 30000).toString()); // Wait 30 seconds more
        }
        
        // Try to use cached data if available
        if (cachedBookmarksString) {
          try {
            return of(JSON.parse(cachedBookmarksString));
          } catch (e) {
            console.warn('Failed to parse cached bookmarks as fallback');
          }
        }
        
        // Fallback to local storage
        const localBookmarks = localStorage.getItem('bookmarks');
        if (localBookmarks) {
          try {
            return of(JSON.parse(localBookmarks));
          } catch (e) {
            console.warn('Failed to parse local bookmarks');
            return of([]);
          }
        }
        return of([]);
      })
    );
  }

  // Add a bookmark
  addBookmark(verseReference: string): Observable<any> {
    // First check if user is logged in
    const user = this._user.value;
    if (!user) {
      // Always save to localStorage even if not logged in
      try {
        const localBookmarks = localStorage.getItem('bookmarks') || '[]';
        const bookmarks = JSON.parse(localBookmarks);
        if (!bookmarks.includes(verseReference)) {
          bookmarks.push(verseReference);
          localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
        }
      } catch (e) {
        console.warn('Failed to save bookmark to localStorage');
      }
      return of({ success: true, source: 'local' });
    }
    
    // Always update localStorage first for immediate access
    try {
      const localBookmarks = localStorage.getItem('bookmarks') || '[]';
      const bookmarks = JSON.parse(localBookmarks);
      if (!bookmarks.includes(verseReference)) {
        bookmarks.push(verseReference);
        localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
      }
      
      // Update the cache
      const cachedBookmarksString = localStorage.getItem('bookmarks_cache');
      if (cachedBookmarksString) {
        try {
          const cachedBookmarks = JSON.parse(cachedBookmarksString);
          if (!cachedBookmarks.includes(verseReference)) {
            cachedBookmarks.push(verseReference);
            localStorage.setItem('bookmarks_cache', JSON.stringify(cachedBookmarks));
            localStorage.setItem('bookmarks_timestamp', Date.now().toString());
          }
        } catch (e) {
          console.warn('Failed to update bookmarks cache');
        }
      }
    } catch (e) {
      console.warn('Failed to save bookmark to localStorage');
    }
    
    // Check if we recently made an API call (within last 3 seconds)
    const lastAPICallString = localStorage.getItem('bookmarks_add_last_api_call');
    if (lastAPICallString) {
      const lastAPICall = parseInt(lastAPICallString, 10);
      const now = Date.now();
      const threeSecondsInMs = 3 * 1000;
      
      // If last API call was less than 3 seconds ago, return success without API call
      if (now - lastAPICall < threeSecondsInMs) {
        console.log('Throttling add bookmark API call');
        return of({ success: true, source: 'local' });
      }
    }
    
    // Store timestamp of this API call
    localStorage.setItem('bookmarks_add_last_api_call', Date.now().toString());
    
    // Make API call
    return this.http.post<any>(`${environment.apiUrl}/api/users/${user.id}/bookmarks`, { verseReference }).pipe(
      tap(() => {
        // Update the last successful API call timestamp
        localStorage.setItem('bookmarks_add_last_success', Date.now().toString());
      }),
      catchError(error => {
        console.warn('Error adding bookmark to API:', error);
        
        // If we got a 429 error, increase the throttle time
        if (error.status === 429) {
          localStorage.setItem('bookmarks_add_last_api_call', (Date.now() + 10000).toString()); // Add 10 seconds to throttle
        }
        
        return of({ success: true, source: 'local' });
      })
    );
  }
  
  // Remove a bookmark
  removeBookmark(verseReference: string): Observable<any> {
    // First check if user is logged in
    const user = this._user.value;
    
    // Always update localStorage first for immediate access
    try {
      const localBookmarks = localStorage.getItem('bookmarks') || '[]';
      const bookmarks = JSON.parse(localBookmarks);
      const updatedBookmarks = bookmarks.filter((b: string) => b !== verseReference);
      localStorage.setItem('bookmarks', JSON.stringify(updatedBookmarks));
      
      // Update the cache
      const cachedBookmarksString = localStorage.getItem('bookmarks_cache');
      if (cachedBookmarksString) {
        try {
          const cachedBookmarks = JSON.parse(cachedBookmarksString);
          const updatedCache = cachedBookmarks.filter((b: string) => b !== verseReference);
          localStorage.setItem('bookmarks_cache', JSON.stringify(updatedCache));
          localStorage.setItem('bookmarks_timestamp', Date.now().toString());
        } catch (e) {
          console.warn('Failed to update bookmarks cache');
        }
      }
    } catch (e) {
      console.warn('Failed to remove bookmark from localStorage');
    }
    
    // If not logged in, just return success after localStorage update
    if (!user) {
      return of({ success: true, source: 'local' });
    }
    
    // Check if we recently made an API call (within last 3 seconds)
    const lastAPICallString = localStorage.getItem('bookmarks_remove_last_api_call');
    if (lastAPICallString) {
      const lastAPICall = parseInt(lastAPICallString, 10);
      const now = Date.now();
      const threeSecondsInMs = 3 * 1000;
      
      // If last API call was less than 3 seconds ago, return success without API call
      if (now - lastAPICall < threeSecondsInMs) {
        console.log('Throttling remove bookmark API call');
        return of({ success: true, source: 'local' });
      }
    }
    
    // Store timestamp of this API call
    localStorage.setItem('bookmarks_remove_last_api_call', Date.now().toString());
    
    // Make the API call
    return this.http.delete<any>(`${environment.apiUrl}/api/users/${user.id}/bookmarks/${verseReference}`).pipe(
      tap(() => {
        // Update the last successful API call timestamp
        localStorage.setItem('bookmarks_remove_last_success', Date.now().toString());
      }),
      catchError(error => {
        console.warn('Error removing bookmark from API:', error);
        
        // If we got a 429 error, increase the throttle time
        if (error.status === 429) {
          localStorage.setItem('bookmarks_remove_last_api_call', (Date.now() + 10000).toString()); // Add 10 seconds to throttle
        }
        
        return of({ success: true, source: 'local' });
      })
    );
  }

  // Get reading history
  getReadingHistory(): Observable<any> {
    // First check if user is logged in
    const user = this._user.value;
    if (!user) {
      return of([]);
    }

    // Check if we have cached history data that's recent (last 5 minutes)
    const cachedHistoryString = localStorage.getItem('reading_history_cache');
    const cachedTimestampString = localStorage.getItem('reading_history_timestamp');
    
    if (cachedHistoryString && cachedTimestampString) {
      const cachedTimestamp = parseInt(cachedTimestampString, 10);
      const now = Date.now();
      const fiveMinutesInMs = 5 * 60 * 1000;
      
      // If cache is less than 5 minutes old, use it
      if (now - cachedTimestamp < fiveMinutesInMs) {
        try {
          const cachedHistory = JSON.parse(cachedHistoryString);
          console.log('Using cached reading history');
          return of(cachedHistory);
        } catch (e) {
          console.warn('Failed to parse cached reading history:', e);
          // Continue to API if parsing fails
        }
      }
    }
    
    // Check if we recently made an API call (within last 10 seconds)
    const lastAPICallString = localStorage.getItem('reading_history_last_api_call');
    if (lastAPICallString) {
      const lastAPICall = parseInt(lastAPICallString, 10);
      const now = Date.now();
      const tenSecondsInMs = 10 * 1000;
      
      // If last API call was less than 10 seconds ago, return cached data or empty array
      if (now - lastAPICall < tenSecondsInMs) {
        console.log('Throttling reading history API call');
        if (cachedHistoryString) {
          try {
            return of(JSON.parse(cachedHistoryString));
          } catch (e) {
            return of([]);
          }
        }
        return of([]);
      }
    }
    
    // Store timestamp of this API call
    localStorage.setItem('reading_history_last_api_call', Date.now().toString());
    
    // Make the API call
    return this.http.get(`${environment.apiUrl}/api/users/${user.id}/reading-history`).pipe(
      map((response: any) => {
        // Cache the successful response with timestamp
        localStorage.setItem('reading_history_cache', JSON.stringify(response));
        localStorage.setItem('reading_history_timestamp', Date.now().toString());
        return response;
      }),
      catchError(error => {
        console.error('Could not fetch reading history from API:', error);
        
        // If we get a 429 error, increase the throttle time
        if (error.status === 429) {
          localStorage.setItem('reading_history_last_api_call', (Date.now() + 30000).toString()); // Wait 30 seconds more
        }
        
        // Try to use cached data if available
        if (cachedHistoryString) {
          try {
            const cachedHistory = JSON.parse(cachedHistoryString);
            return of(cachedHistory);
          } catch (e) {
            console.warn('Failed to parse cached reading history as fallback:', e);
          }
        }
        
        // Fall back to localStorage reading history
        const localHistory = localStorage.getItem('readingHistory');
        if (localHistory) {
          try {
            return of(JSON.parse(localHistory));
          } catch (e) {
            console.warn('Failed to parse local reading history:', e);
          }
        }
        
        return of([]);
      })
    );
  }

  // Clear reading history
  clearReadingHistory(): Observable<any> {
    const user = this.auth.currentUser;
    if (!user) {
      return throwError(() => new Error('No user logged in'));
    }
    
    // Clear in localStorage
    localStorage.removeItem(`reading_history_${user.uid}`);
    
    // Try to clear on server
    return this.http.delete<any>(`${environment.apiUrl}/api/users/${user.uid}/reading-history`).pipe(
      catchError(error => {
        console.warn('Could not clear reading history on API:', error);
        return of({ success: true, source: 'local' });
      }),
      map(() => ({ success: true }))
    );
  }

  // Helper to get default preferences from local storage
  private getDefaultPreferencesFromLocalStorage(): any {
    try {
      const prefsStr = localStorage.getItem('quranPreferences');
      if (prefsStr) {
        return JSON.parse(prefsStr);
      }
    } catch (e) {
      console.error('Error parsing preferences from localStorage:', e);
    }
    
    // Return default preferences
    return {
      selectedReciter: 7,
      selectedTranslation: '131',
      fontSize: 24,
      showWordByWord: false,
      darkMode: false,
      bookmarks: []
    };
  }
} 