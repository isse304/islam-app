import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, of, from, throwError, switchMap, firstValueFrom, timeout, retry, catchError, map } from 'rxjs';
import { take, tap } from 'rxjs/operators';
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
    bookmarks?: string[];
    subscriptionStatus?: string;
  };
  isAdmin: boolean;
  token?: string;
}

export interface BookmarkResponse {
  success: boolean;
  message: string;
  bookmarks: string[];
}

export interface ReadingHistoryResponse {
  success: boolean;
  history: any[];
}

export interface UserPreferences {
    selectedReciter: number;
    selectedTranslation: string;
    bookmarks: string[];
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

  private readonly PREFERENCES_CACHE_KEY = 'user_preferences';
  private readonly USER_CACHE_KEY = 'user_data';
  private readonly REQUEST_CACHE_DURATION = 60000; // 1 minute cache for API requests
  private readonly USER_DATA_CACHE_DURATION = 300000; // 5 minutes cache for user data
  private readonly THROTTLE_DURATION = 5000; // 5 seconds between requests
  private lastPreferencesRequest: number = 0;
  private lastRequestTimes: { [key: string]: number } = {};
  private preferencesCache: {
    data: any;
    timestamp: number;
  } | null = null;
  private readonly CACHE_DURATION = 5000; // 5 seconds
  private preferencesSubject = new BehaviorSubject<any>(null);
  preferences$ = this.preferencesSubject.asObservable();

  // Single source of truth for user data
  private userDataSubject = new BehaviorSubject<{
    preferences?: any;
    history?: any[];
    bookmarks?: string[];
  } | null>(null);

  // Public observables
  userData$ = this.userDataSubject.asObservable();
  history$ = this.userData$.pipe(map(data => data?.history));
  bookmarks$ = this.userData$.pipe(map(data => data?.bookmarks));

  // Add caching mechanism
  private savePreferencesQueue: any[] = [];
  private isSaving = false;
  private readonly SAVE_INTERVAL = 2000; // 2 seconds

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
    try {
      // Get the token immediately
      const token = await firebaseUser.getIdToken();
      
      // Map the Firebase user to our User model with token
      const user: AppUser = {
        id: firebaseUser.uid,
        email: firebaseUser.email || '',
        firstName: firebaseUser.displayName?.split(' ')[0] || '',
        lastName: firebaseUser.displayName?.split(' ').slice(1).join(' ') || '',
        imageUrl: firebaseUser.photoURL || '',
        emailVerified: firebaseUser.emailVerified,
        createdAt: new Date(firebaseUser.metadata.creationTime || Date.now()),
        lastSignInAt: firebaseUser.metadata.lastSignInTime ? new Date(firebaseUser.metadata.lastSignInTime) : undefined,
        preferences: {},
        isAdmin: false, // Default to false, we don't use admin functionality
        token: token
      };
      
      // Store user info in localStorage for faster app loading
      localStorage.setItem('currentUser', JSON.stringify({
        ...user,
        token
      }));
      
      // Mark as authenticated in localStorage
      localStorage.setItem('isAuthenticated', 'true');
      
      // Update the user subject with basic data immediately
      this._user.next(user);
      
      // Load preferences from localStorage first for immediate state
      const localPrefs = localStorage.getItem(`user_preferences_${user.id}`);
      if (localPrefs) {
        try {
          const prefs = JSON.parse(localPrefs);
          user.preferences = prefs;
          this._user.next({ ...user });
        } catch (error) {
          console.warn('Error parsing local preferences:', error);
        }
      }
      
      // Then fetch user preferences from server
      this.getUserPreferences()
        .then(preferences => {
          user.preferences = preferences;
          this._user.next({ ...user });
          
          // Update localStorage with server preferences
          localStorage.setItem(`user_preferences_${user.id}`, JSON.stringify(preferences));
        })
        .catch(error => {
          console.warn('Error fetching user preferences:', error);
        });
        
    } catch (error) {
      console.error('Error handling user sign in:', error);
      // Still set the user with basic data even if we couldn't fetch preferences
      this._user.next(null);
    }
  }

  async getUserPreferences(): Promise<any> {
    // Check memory cache first
    if (this.preferencesCache && Date.now() - this.preferencesCache.timestamp < this.CACHE_DURATION) {
        return this.preferencesCache.data;
    }

    // Check localStorage cache
    const cachedData = localStorage.getItem(this.PREFERENCES_CACHE_KEY);
    if (cachedData) {
        try {
            const { data, timestamp } = JSON.parse(cachedData);
            if (Date.now() - timestamp < this.REQUEST_CACHE_DURATION) {
                this.preferencesCache = { data, timestamp };
                return data;
            }
        } catch (e) {
            console.warn('Error parsing cached preferences:', e);
        }
    }

    try {
        const user = this.auth.currentUser;
        if (!user) {
            return this.getDefaultPreferences();
        }

        const token = await user.getIdToken(true);
        
        const response = await firstValueFrom(
            this.http.get<any>(`${environment.apiUrl}/api/users/${user.uid}/preferences`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }).pipe(
                timeout(30000),
                retry(3),
                catchError(error => {
                    console.error('Error fetching preferences:', error);
                    return of(this.getDefaultPreferences());
                })
            )
        );

        // Update cache
        this.preferencesCache = {
            data: response,
            timestamp: Date.now()
        };

        // Update localStorage cache
        this.cachePreferences(response);
        
        return response;
    } catch (error) {
        console.error('Error fetching preferences:', error);
        return this.getDefaultPreferences();
    }
  }

  private cachePreferences(data: any): void {
    try {
      localStorage.setItem(this.PREFERENCES_CACHE_KEY, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn('Error caching preferences:', e);
    }
  }

  // Update saveUserPreferences with better debouncing
  async saveUserPreferences(preferences: any): Promise<UserPreferences> {
    // Update local cache immediately
    this.preferencesCache = {
        data: { ...this.preferencesCache?.data, ...preferences },
        timestamp: Date.now()
    };

    // Add to queue
    this.savePreferencesQueue.push(preferences);

    // If already saving, return
    if (this.isSaving) {
        return this.preferencesCache.data;
    }

    // Start save process
    this.isSaving = true;

    try {
        await new Promise(resolve => setTimeout(resolve, this.SAVE_INTERVAL));

        // Merge all queued preferences
        const mergedPreferences = this.savePreferencesQueue.reduce((acc, curr) => ({
            ...acc,
            ...curr
        }), {});

        // Clear queue
        this.savePreferencesQueue = [];

        const user = this.auth.currentUser;
        if (!user) throw new Error('No user logged in');

        const token = await user.getIdToken();
        await this.http.put<any>(
            `${environment.apiUrl}/api/users/${user.uid}/preferences`,
            mergedPreferences,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        ).toPromise();

        return this.preferencesCache.data;
    } catch (error: any) {
        if (error?.status !== 429) {
            console.error('Error saving preferences:', error);
        }
        throw error;
    } finally {
        this.isSaving = false;
    }
  }

  // Clear preferences cache
  private clearPreferencesCache(): void {
    localStorage.removeItem(this.PREFERENCES_CACHE_KEY);
    this.preferencesSubject.next(null);
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
        const apiPrefs = await this.getUserPreferences();
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
        selectedReciter: 1,
        selectedTranslation: 'en.sahih', 
        bookmarks: []
      };
    } catch (error) {
      console.error('Error getting user settings:', error);
      return {};
    }
  }

  // Save reading history entry
  async saveReadingHistory(entry: any): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('No user logged in');
    }

    // Save to localStorage first
    try {
      const prefs = JSON.parse(localStorage.getItem('quran_reader_preferences') || '{}');
      if (!Array.isArray(prefs.readingHistory)) {
        prefs.readingHistory = [];
      }
      
      // Add new entry at the beginning
      prefs.readingHistory.unshift({
        ...entry,
        timestamp: new Date().toISOString()
      });
      
      // Keep only last 100 entries
      prefs.readingHistory = prefs.readingHistory.slice(0, 100);
      
      // Save back to localStorage
      localStorage.setItem('quran_reader_preferences', JSON.stringify(prefs));
    } catch (error) {
      console.warn('Error saving history to localStorage:', error);
    }

    // Then save to server
    try {
      const token = await user.getIdToken(true);
      await this.http.post<any>(
        `${environment.apiUrl}/api/users/${user.uid}/reading-history`,
        entry,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      ).toPromise();
    } catch (error) {
      console.error('Error saving reading history to server:', error);
      throw error;
    }
  }

  // Check if user has access to AI features
  async hasAIAccess(): Promise<boolean> {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        return false;
      }

      // First check Firebase custom claims
      const idTokenResult = await user.getIdToken(true);
      const token = await user.getIdTokenResult(true);
      
      // Check for premium status in claims
      if (token.claims['premium'] === true || 
          token.claims['subscriptionStatus'] === 'active' ||
          token.claims['subscriptionStatus'] === 'premium') {
        return true;
      }

      // Check user preferences for subscription status
      const prefs = await this.getUserPreferences();
      if (prefs?.subscriptionStatus === 'active' || 
          prefs?.subscriptionStatus === 'premium') {
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking AI access:', error);
      return false;
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

  // Helper method to validate verse reference
  private isValidVerseReference(verseReference: string): boolean {
    if (!verseReference || typeof verseReference !== 'string') return false;
    const [surahStr, verseStr] = verseReference.split(':');
    const surah = parseInt(surahStr);
    const verse = parseInt(verseStr);
    return !isNaN(surah) && !isNaN(verse) && surah >= 1 && surah <= 114 && verse >= 1;
  }

  // Save QuranReader state
  async saveQuranReaderState(state: any): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      return Promise.reject(new Error('No user logged in'));
    }

    try {
      // Validate state before saving
      if (!state || !state.surah || !state.verse || 
          typeof state.surah !== 'number' || typeof state.verse !== 'number' ||
          state.surah < 1 || state.surah > 114 || state.verse < 1) {
        console.warn('Invalid state provided to saveQuranReaderState:', state);
        return;
      }

      // First, get current user settings
      const userSettings = await this.getUserSettings();
      
      // Add this state to reading history if it's different from the last entry
      const readingHistory = userSettings.readingHistory || [];
      const lastEntry = readingHistory[0];
      
      // Only add if it's a different verse than the last one
      if (!lastEntry || lastEntry.surah !== state.surah || lastEntry.verse !== state.verse) {
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

  // Helper methods for request throttling
  private shouldThrottle(key: string): boolean {
    const lastRequest = this.lastRequestTimes[key] || 0;
    return Date.now() - lastRequest < this.THROTTLE_DURATION;
  }

  private updateLastRequestTime(key: string): void {
    this.lastRequestTimes[key] = Date.now();
  }

  getDefaultPreferences(): any {
    return {
      selectedReciter: 1,
      selectedTranslation: '131',
      bookmarks: [],
      lastState: {
        isMushafView: false,
        lastSurah: 1,
        lastVerse: 1,
        lastPage: 1
      },
      readingHistory: []
    };
  }

  // Cache and throttling helpers
  private getCachedData(key: string): any {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) return null;
      
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < this.USER_DATA_CACHE_DURATION) {
        return data;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  private setCachedData(key: string, data: any): void {
    try {
      localStorage.setItem(key, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.warn('Error caching data:', error);
    }
  }

  // User data management
  private async loadUserData(userId: string): Promise<void> {
    try {
      // Check cache first
      const cached = this.getCachedData(this.USER_CACHE_KEY);
      if (cached) {
        this.userDataSubject.next(cached);
        return;
      }

    const user = this.auth.currentUser;
      if (!user) return;

      const token = await user.getIdToken(true);
      
      // Single API call to get all user data
      const response = await this.http.get<any>(
        `${environment.apiUrl}/api/users/${userId}/profile`,
        {
          headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
          }
        }
      ).toPromise();

      if (response) {
        const userData = {
          preferences: response.preferences || this.getDefaultPreferences(),
          history: response.history || [],
          bookmarks: response.preferences?.bookmarks || []
        };

        this.setCachedData(this.USER_CACHE_KEY, userData);
        this.userDataSubject.next(userData);
        }
      } catch (error) {
      console.error('Error loading user data:', error);
      const defaults = {
        preferences: this.getDefaultPreferences(),
        history: [],
        bookmarks: []
      };
      this.userDataSubject.next(defaults);
    }
  }

  // Public methods for user data management
  async updatePreferences(preferences: any): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('No user logged in');

    const current = this.userDataSubject.getValue() || {};
    const updated = { ...current, preferences };

    // Update state immediately
    this.userDataSubject.next(updated);

    // Save to server
    const token = await user.getIdToken();
    await this.http.put<any>(
      `${environment.apiUrl}/api/users/${user.uid}/profile`,
      { preferences },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    ).toPromise();
  }

  // Reading history methods
  getReadingHistory(): Observable<any> {
    return this.user$.pipe(
      switchMap(user => {
        if (!user) {
          return of({ success: false, message: 'User not authenticated' });
        }

        const cacheKey = `reading_history_${user.id}`;
        const cachedHistory = this.getCachedData(cacheKey);
        
        if (cachedHistory) {
          return of({ success: true, history: cachedHistory });
        }

        if (this.shouldThrottle(`history_${user.id}`)) {
          return of({ success: true, history: [] });
        }

        this.updateLastRequestTime(`history_${user.id}`);
        
        return this.http.get<any>(
          `${environment.apiUrl}/api/users/${user.id}/reading-history`,
          {
          headers: {
            'Authorization': `Bearer ${user.token}`
          }
          }
        ).pipe(
          tap(response => {
            if (response.success && response.history) {
              this.setCachedData(cacheKey, response.history);
            }
          }),
          catchError(error => {
            console.error('Error fetching reading history:', error);
            return of({ success: true, history: [] });
          })
        );
      })
    );
  }

  async addToHistory(entry: any): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('No user logged in');

    const current = this.userDataSubject.getValue();
    const history = [...(current?.history || [])];
    history.unshift(entry);

    // Update state immediately
    this.userDataSubject.next({ ...current, history: history.slice(0, 100) });

    // Save to server
    const token = await user.getIdToken();
    await this.http.post<any>(
      `${environment.apiUrl}/api/users/${user.uid}/reading-history`,
      entry,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    ).toPromise();
  }

  async clearHistory(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('No user logged in');

    // Update state immediately
    const current = this.userDataSubject.getValue();
    this.userDataSubject.next({ ...current, history: [] });

    // Clear on server
    const token = await user.getIdToken();
    await this.http.delete<any>(
      `${environment.apiUrl}/api/users/${user.uid}/reading-history`,
          {
            headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    ).toPromise();
  }

  // Bookmark methods
  removeBookmark(bookmark: string): Observable<BookmarkResponse> {
    const user = this.auth.currentUser;
    if (!user) {
      return of({ success: false, message: 'User not logged in', bookmarks: [] });
    }

    // Update local state immediately
    const current = this.userDataSubject.getValue();
    const bookmarks = (current?.bookmarks || []).filter(b => b !== bookmark);
    this.userDataSubject.next({ ...current, bookmarks });

    return from(user.getIdToken()).pipe(
      switchMap(token => {
        const headers = {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        };
        return this.http.delete<BookmarkResponse>(
          `${environment.apiUrl}/api/users/${user.uid}/bookmarks/${bookmark}`,
          { headers }
        ).pipe(
          tap(response => {
            if (response.success) {
              this.userDataSubject.next({ ...current, bookmarks: response.bookmarks });
            }
          }),
          catchError(error => {
            // Revert local state on error
            this.userDataSubject.next(current);
            console.error('Error removing bookmark:', error);
            return of({ success: false, message: 'Failed to remove bookmark', bookmarks: [] });
          })
        );
      })
    );
  }

  addBookmark(bookmark: string): Observable<BookmarkResponse> {
    const user = this.auth.currentUser;
    if (!user) {
      return of({ success: false, message: 'User not logged in', bookmarks: [] });
    }

    // Update local state immediately
    const current = this.userDataSubject.getValue();
    const bookmarks = [...(current?.bookmarks || [])];
    if (!bookmarks.includes(bookmark)) {
      bookmarks.push(bookmark);
      this.userDataSubject.next({ ...current, bookmarks });
    }

    return from(user.getIdToken()).pipe(
      switchMap(token => {
        const headers = {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        };
        return this.http.post<BookmarkResponse>(
          `${environment.apiUrl}/api/users/${user.uid}/bookmarks`,
          { verseReference: bookmark },
          { headers }
        ).pipe(
          tap(response => {
            if (response.success) {
              this.userDataSubject.next({ ...current, bookmarks: response.bookmarks });
            }
          }),
          catchError(error => {
            // Revert local state on error
            this.userDataSubject.next(current);
            console.error('Error adding bookmark:', error);
            return of({ success: false, message: 'Failed to add bookmark', bookmarks: [] });
          })
        );
      })
    );
  }

  getBookmarks(): Observable<string[]> {
    return this.user$.pipe(
      switchMap(user => {
        if (!user) return of([]);
        
        // Get the actual Firebase user from auth instance
        const firebaseUser = this.auth.currentUser;
        if (!firebaseUser) return of([]);

        return from(firebaseUser.getIdToken()).pipe(
          switchMap(token => this.http.get<string[]>(
            `${environment.apiUrl}/api/users/${firebaseUser.uid}/bookmarks`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          )),
          map(bookmarks => Array.isArray(bookmarks) ? bookmarks : []),
          catchError(error => {
            console.error('Error loading bookmarks:', error);
            return of(this.getDefaultPreferences().bookmarks || []);
          })
        );
      })
    );
  }
} 