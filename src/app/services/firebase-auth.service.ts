import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, of, from, throwError, switchMap, firstValueFrom, timeout, retry, catchError, map } from 'rxjs';
import { take, tap } from 'rxjs/operators';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
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
  reauthenticateWithPopup,
} from 'firebase/auth';

import { UserInfo } from '@angular/fire/auth';
import { Auth, User } from '@angular/fire/auth';

export interface AppUser {
  id: string;
  uid?: string;  // Add uid for Firebase compatibility
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
  isPremium: boolean;
  features?: any;
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

interface ReadingHistoryEntry {
  surah: number;
  verse: number;
  timestamp: string;
  [key: string]: any;  // Allow additional properties
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

  // Add a flag to track if refresh timer is started
  private refreshTimerStarted = false;

  private readonly TOKEN_CACHE_KEY = 'firebase_auth_token';
  private readonly TOKEN_CACHE_DURATION = 55 * 60 * 1000; // 55 minutes
  private cachedToken: { token: string; timestamp: number } | null = null;

  constructor(
    private router: Router,
    private http: HttpClient,
    private ngZone: NgZone,
    //private auth: Auth
  ) {
    // Initialize token from cache
    this.initTokenFromCache();
    
    // Initialize user state from localStorage immediately for faster UI response
    this.initFromCache();
    
    // Check for redirect result first
    this.handleRedirectResult().catch(error => {
      console.error('Error handling redirect:', error);
    });
    
    // Then listen for Firebase auth state changes
    onAuthStateChanged(this.auth, (firebaseUser) => {
      console.log('Firebase auth state changed:', !!firebaseUser);
      if (firebaseUser) {
        this.handleUserSignedIn(firebaseUser).catch(error => {
          console.error('Error handling signed in user:', error);
        });
      } else {
        // Only clear if we're not in the middle of a redirect
        getRedirectResult(this.auth).then(result => {
          if (!result) {
            // Clear localStorage and update user state
            localStorage.removeItem('currentUser');
            localStorage.removeItem('isAuthenticated');
            this._user.next(null);
          }
        });
      }
    });
  }

  /**
   * Initialize user state from localStorage cache for immediate UI response
   */
  private initFromCache() {
    try {
      const cachedUserJson = localStorage.getItem('currentUser');
      const premiumStatus = localStorage.getItem('premium_status');
      const premiumTimestamp = localStorage.getItem('premium_status_timestamp');
      
      if (cachedUserJson) {
        const cachedUser = JSON.parse(cachedUserJson);
        // Check if premium status cache is still valid (less than 1 hour old)
        const isPremiumValid = premiumTimestamp && 
          (Date.now() - parseInt(premiumTimestamp)) < 60 * 60 * 1000;

        // Update the BehaviorSubject with cached data immediately
        this._user.next({
          ...cachedUser,
          preferences: cachedUser.preferences || {},
          isAdmin: cachedUser.isAdmin || false,
          isPremium: isPremiumValid ? (premiumStatus === 'true' || cachedUser.isPremium) : false,
          features: cachedUser.features || {
            emotionalDuaSearch: false,
            aiTafsirChat: false,
            duaInsights: false
          }
        } as AppUser);
        
        // Mark as authenticated in localStorage
        localStorage.setItem('isAuthenticated', 'true');
        
        console.log('Initialized user state from cache with premium:', isPremiumValid);
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
      isAdmin: false, // Set this based on your admin logic, e.g., from a database check
      isPremium: false // Will be populated later
    };
  }

  private async handleUserSignedIn(firebaseUser: FirebaseUser): Promise<void> {
    try {
      console.log('Starting user sign in process...');
      
      // Check if we already have valid cached data
      const cachedToken = localStorage.getItem('auth_token');
      const tokenTimestamp = localStorage.getItem('auth_token_timestamp');
      const tokenAge = tokenTimestamp ? Date.now() - parseInt(tokenTimestamp) : Infinity;
      
      // Initialize user state first with basic info
      const initialUser: AppUser = {
        id: firebaseUser.uid,
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        firstName: firebaseUser.displayName?.split(' ')[0] || '',
        lastName: firebaseUser.displayName?.split(' ').slice(1).join(' ') || '',
        imageUrl: firebaseUser.photoURL || '',
        emailVerified: firebaseUser.emailVerified,
        createdAt: new Date(firebaseUser.metadata.creationTime || Date.now()),
        lastSignInAt: firebaseUser.metadata.lastSignInTime ? new Date(firebaseUser.metadata.lastSignInTime) : undefined,
        preferences: this.getDefaultPreferences(),
        isAdmin: false,
        isPremium: false,
        features: {}
      };

      // Set initial state immediately inside NgZone to ensure UI updates
      this.ngZone.run(() => {
        this._user.next(initialUser);
        localStorage.setItem('isAuthenticated', 'true');
      });
      
      // Only force token refresh if cached token is old or missing
      let token: string;
      let idTokenResult;
      
      if (!cachedToken || tokenAge > 30 * 60 * 1000) { // 30 minutes
        console.log('Getting fresh token...');
        token = await firebaseUser.getIdToken(true);
        idTokenResult = await firebaseUser.getIdTokenResult(true);
      } else {
        console.log('Using cached token...');
        token = cachedToken;
        idTokenResult = await firebaseUser.getIdTokenResult();
      }

      if (!token) {
        console.error('Failed to get auth token');
        this.clearAuthData();
        throw new Error('Authentication failed - no token');
      }

      // Update user with token and premium status
      const isPremium = idTokenResult.claims['premium'] === true || 
                     idTokenResult.claims['subscriptionStatus'] === 'active';

      const features = idTokenResult.claims['features'] || {
        emotionalDuaSearch: isPremium,
        aiTafsirChat: isPremium,
        duaInsights: isPremium
      };

      const updatedUser = {
        ...initialUser,
        token,
        isPremium,
        features
      };

      // Store updated user info and premium status inside NgZone
      this.ngZone.run(() => {
        localStorage.setItem('currentUser', JSON.stringify(updatedUser));
        localStorage.setItem('premium_status', isPremium.toString());
        localStorage.setItem('premium_status_timestamp', Date.now().toString());
        localStorage.setItem('auth_token', token);
        localStorage.setItem('auth_token_timestamp', Date.now().toString());
        
        // Update the user subject with complete data
        this._user.next(updatedUser);
      });

      // Start token refresh timer only if not already started
      if (!this.refreshTimerStarted) {
        this.startTokenRefreshTimer();
      }

      // Try to get user preferences from server
      try {
        const response = await firstValueFrom(this.http.get<any>(
          `${environment.apiUrl}/api/users/${initialUser.id}/preferences`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        ));
        
        if (response?.preferences) {
          // Update preferences inside NgZone
          this.ngZone.run(() => {
            const userWithPrefs = { ...updatedUser, preferences: response.preferences };
            this._user.next(userWithPrefs);
            localStorage.setItem('currentUser', JSON.stringify(userWithPrefs));
          });
        }
      } catch (error) {
        console.warn('Error fetching user preferences:', error);
      }

      console.log('User sign in completed successfully:', {
        uid: updatedUser.id,
        isPremium: updatedUser.isPremium,
        hasToken: !!updatedUser.token
      });

    } catch (error) {
      console.error('Error handling user sign in:', error);
      this.clearAuthData();
      throw error;
    }
  }

  private clearAuthData() {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_token_timestamp');
    localStorage.removeItem('premium_status');
    localStorage.removeItem('premium_status_timestamp');
    // Don't remove email/password as we might need them for re-auth
    this._user.next(null);
  }

  private startTokenRefreshTimer() {
    if (this.refreshTimerStarted) {
      return;
    }
    
    this.refreshTimerStarted = true;
    
    // Refresh token every 45 minutes
    const REFRESH_INTERVAL = 45 * 60 * 1000;
    
    setInterval(async () => {
      try {
        const user = this.auth.currentUser;
        if (user) {
          const token = await user.getIdToken(true);
          localStorage.setItem('auth_token', token);
          localStorage.setItem('auth_token_timestamp', Date.now().toString());
          
          // Update user object with new token
          const currentUser = this._user.getValue();
          if (currentUser) {
            currentUser.token = token;
            this._user.next(currentUser);
          }
        }
      } catch (error) {
        console.error('Error in token refresh timer:', error);
      }
    }, REFRESH_INTERVAL);

    // Add visibility change listener
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.refreshToken(true).catch(error => 
          console.error('Visibility change token refresh failed:', error)
        );
      }
    });
  }

  // Token management
  private async refreshToken(force: boolean = false): Promise<string | null> {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        console.warn('No current user for token refresh');
        return null;
      }

      // Check if we have a cached token that's still valid
      const cachedToken = localStorage.getItem('auth_token');
      const tokenTimestamp = localStorage.getItem('auth_token_timestamp');
      const tokenAge = tokenTimestamp ? Date.now() - parseInt(tokenTimestamp) : Infinity;

      // Only refresh if forced or token is old
      if (!force && cachedToken && tokenAge < 45 * 60 * 1000) { // 45 minutes
        return cachedToken;
      }

      try {
        // Try to get new token without force first
        const newToken = await user.getIdToken(false);
        if (newToken) {
          localStorage.setItem('auth_token', newToken);
          localStorage.setItem('auth_token_timestamp', Date.now().toString());
          return newToken;
        }
      } catch (error) {
        console.warn('Normal token refresh failed, trying force refresh:', error);
      }

      // If normal refresh fails, try force refresh
      try {
        const forcedToken = await user.getIdToken(true);
        localStorage.setItem('auth_token', forcedToken);
        localStorage.setItem('auth_token_timestamp', Date.now().toString());
        return forcedToken;
      } catch (error) {
        console.error('Force token refresh failed:', error);
        // If we have a cached token, return it as fallback
        if (cachedToken) {
          console.log('Using cached token as fallback');
          return cachedToken;
        }
        return null;
      }
    } catch (error) {
      console.error('Error in refreshToken:', error);
      return null;
    }
  }

  async getToken(forceRefresh = false): Promise<string | null> {
    // Check cache first unless force refresh is requested
    if (!forceRefresh && this.cachedToken) {
      const age = Date.now() - this.cachedToken.timestamp;
      if (age < this.TOKEN_CACHE_DURATION) {
        return this.cachedToken.token;
      }
    }

    try {
      await this.waitForAuthReady();
      const user = this.auth.currentUser;
      if (!user) {
        console.debug('No user found when getting token');
        return null;
      }

      const token = await user.getIdToken(forceRefresh);
      if (token) {
        // Cache the token
        this.cachedToken = {
          token,
          timestamp: Date.now()
        };
        // Also store in localStorage for persistence
        localStorage.setItem(this.TOKEN_CACHE_KEY, JSON.stringify(this.cachedToken));
      }
      return token;
    } catch (error) {
      console.error('Error getting token:', error);
      return null;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      console.log('🔒 Checking authentication...');
      const user = await this.getCurrentUser();
      const isAuth = !!user;
      console.log('🔒 Auth check result:', { 
        isAuthenticated: isAuth,
        user: user ? {
          uid: user.uid,
          email: user.email,
          isAnonymous: user.isAnonymous
        } : null
      });
      return isAuth;
    } catch (error) {
      console.error('❌ Error checking authentication:', error);
      return false;
    }
  }

  async refreshSubscriptionStatus(): Promise<boolean> {
    console.log('Starting subscription status refresh...');
    
    try {
        const user = this.auth.currentUser;
        if (!user) {
            console.warn('No current user for subscription status refresh');
            return false;
        }

        // Check if we recently refreshed
        const lastRefreshTime = localStorage.getItem('subscription_refresh_timestamp');
        if (lastRefreshTime) {
            const timeSinceLastRefresh = Date.now() - parseInt(lastRefreshTime);
            if (timeSinceLastRefresh < 5 * 60 * 1000) { // Less than 5 minutes
                console.log('Using cached subscription status');
                return true;
            }
        }

        // Try to get current claims first without force refresh
        let idTokenResult = await user.getIdTokenResult(false);
        
        // Check server status without forcing token refresh
        try {
            const response = await firstValueFrom(
                this.http.get<any>(`${environment.apiUrl}/api/subscription/status`)
            );

            const isPremium = response.isPremium || idTokenResult.claims['premium'] === true;
            const features = response.features || idTokenResult.claims['features'] || {};

            // Update user state
            const currentUser = this._user.value;
            if (currentUser) {
                this._user.next({
                    ...currentUser,
                    isPremium,
                    features
                });

                // Update cache
                localStorage.setItem('premium_status', isPremium.toString());
                localStorage.setItem('premium_status_timestamp', Date.now().toString());
                localStorage.setItem('subscription_refresh_timestamp', Date.now().toString());
                
                console.log('Subscription status refreshed:', { isPremium, features });
            }

            return true;
        } catch (error) {
            console.warn('Error checking subscription status:', error);
            
            // Fallback to token claims if server check fails
            const isPremium = idTokenResult.claims['premium'] === true;
            const features = idTokenResult.claims['features'] || {};
            
            if (this._user.value) {
                this._user.next({
                    ...this._user.value,
                    isPremium,
                    features
                });
            }
            
            return isPremium;
        }
    } catch (error) {
        console.error('Error in refreshSubscriptionStatus:', error);
        return false;
    }
  }

  async getUserPreferences(): Promise<any> {
    try {
        const user = this.auth.currentUser;
        if (!user) {
            console.warn('No current user found, returning default preferences');
            return this.getDefaultPreferences();
        }

        // Check cache first
        if (this.preferencesCache && Date.now() - this.preferencesCache.timestamp < this.CACHE_DURATION) {
            return this.preferencesCache.data;
        }

        // Get fresh token
        const token = await user.getIdToken(true);
        if (!token) {
            console.error('Failed to get auth token');
            return this.getDefaultPreferences();
        }

        // Make API request with fresh token
        const response = await firstValueFrom(
            this.http.get<any>(`${environment.apiUrl}/api/users/${user.uid}/preferences`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                withCredentials: true // Add this to ensure credentials are sent
            }).pipe(
                timeout(30000),
                retry({
                    count: 3,
                    delay: 1000,
                    resetOnSuccess: true
                }),
                catchError(error => {
                    console.error('Error fetching preferences:', error);
                    if (error.status === 401) {
                        // If unauthorized, try to refresh token and retry once
                        return from(user.getIdToken(true)).pipe(
                            switchMap(newToken => 
                                this.http.get<any>(`${environment.apiUrl}/api/users/${user.uid}/preferences`, {
                                    headers: {
                                        'Authorization': `Bearer ${newToken}`,
                                        'Content-Type': 'application/json'
                                    },
                                    withCredentials: true
                                })
                            ),
                            catchError(retryError => {
                                console.error('Error after token refresh:', retryError);
                                return of(this.preferencesCache?.data || this.getDefaultPreferences());
                            })
                        );
                    }
                    return of(this.preferencesCache?.data || this.getDefaultPreferences());
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
        console.error('Error in getUserPreferences:', error);
        return this.preferencesCache?.data || this.getDefaultPreferences();
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
        
        // Send preferences directly in the body
        const response = await firstValueFrom(
            this.http.put<any>(
                `${environment.apiUrl}/api/users/${user.uid}/preferences`,
                mergedPreferences,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            )
        );

        // Update cache with server response
        if (response?.success && response?.preferences) {
            this.preferencesCache = {
                data: response.preferences,
                timestamp: Date.now()
            };
        }

        this.isSaving = false;
        return this.preferencesCache.data;
    } catch (error) {
        console.error('Error saving preferences:', error);
        this.isSaving = false;
        throw error;
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
    // Store credentials for re-auth
    localStorage.setItem('user_email', email);
    // Store password securely (in production, consider using more secure storage)
    localStorage.setItem('user_password', password);
    
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  // Create new user with email/password
  createUserWithEmailAndPassword(email: string, password: string): Promise<UserCredential> {
    return createUserWithEmailAndPassword(this.auth, email, password);
  }

  // Sign in with Google
  async signInWithGoogle(): Promise<UserCredential> {
    try {
      const provider = new GoogleAuthProvider();
      
      // Add scopes for better profile access
      provider.addScope('profile');
      provider.addScope('email');
      provider.addScope('openid');
      
      // Configure provider settings
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      // Save current URL for redirect back
      const currentUrl = this.router.url;
      if (currentUrl !== '/auth/login') {
        localStorage.setItem('returnUrl', currentUrl);
      }

      console.log('Starting Google sign-in process...');
      
      try {
        // Try popup first
        console.log('Attempting popup sign-in...');
        const result = await signInWithPopup(this.auth, provider);
        
        // Force token refresh and handle sign in
        await this.handleUserSignedIn(result.user);
        
        // Navigate inside NgZone
        this.ngZone.run(() => {
          const returnUrl = localStorage.getItem('returnUrl');
          if (returnUrl) {
            console.log('Navigating to:', returnUrl);
            localStorage.removeItem('returnUrl');
            this.router.navigate([returnUrl]);
          }
        });
        
        return result;
      } catch (popupError: any) {
        console.warn('Popup sign-in failed:', popupError);
        
        if (popupError.code === 'auth/popup-blocked' || 
            popupError.code === 'auth/popup-closed-by-user') {
          console.log('Popup blocked or closed, trying redirect...');
          await signInWithRedirect(this.auth, provider);
          return {} as UserCredential; // Redirect will refresh the page
        }
        
        throw popupError;
      }
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      throw error;
    }
  }

  // Handle redirect result
  async handleRedirectResult(): Promise<UserCredential | null> {
    try {
      console.log('Checking for redirect result...');
      const result = await getRedirectResult(this.auth);
      console.log('Got redirect result:', !!result);
      
      if (result) {
        console.log('Processing successful sign-in...');
        // Force token refresh and handle sign in
        await this.handleUserSignedIn(result.user);
        
        // Navigate inside NgZone
        this.ngZone.run(() => {
          const returnUrl = localStorage.getItem('returnUrl');
          if (returnUrl) {
            console.log('Navigating to:', returnUrl);
            localStorage.removeItem('returnUrl');
            this.router.navigate([returnUrl]);
          }
        });
      }
      
      return result;
    } catch (error: any) {
      console.error('Error handling redirect result:', error);
      this.clearAuthData();
      throw error;
    }
  }

  // Sign out
  signOut(): Promise<void> {
    // Update the state first before the async operation
    this.ngZone.run(() => {
        this._user.next(null);
        
        // Clear all auth-related data from localStorage
        localStorage.removeItem('currentUser');
        localStorage.removeItem('isAuthenticated');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_token_timestamp');
        localStorage.removeItem('premium_status');
        localStorage.removeItem('premium_status_timestamp');
        localStorage.removeItem('user_preferences');
        localStorage.removeItem('redirectUrl');
        localStorage.removeItem('returnUrl');
        
        // Clear preferences cache
        this.preferencesCache = null;
        this.preferencesSubject.next(null);
        
        // Clear user data
        this.userDataSubject.next(null);
    });
    
    // Now handle the actual sign out with Firebase
    return signOut(this.auth).then(() => {
        // Navigate inside NgZone
        this.ngZone.run(() => {
            // Double check all data is cleared
            this._user.next(null);
            this.router.navigate(['/']);
        });
    }).catch(error => {
        console.error('Error during sign out:', error);
        // Even if Firebase sign out fails, ensure UI is updated
        this.ngZone.run(() => {
            this._user.next(null);
            this.router.navigate(['/']);
        });
        throw error;
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
  getCurrentUser(): User | null {
    return this.auth.currentUser;
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
  async saveReadingHistory(entry: ReadingHistoryEntry): Promise<void> {
    try {
      // Add timestamp to entry
      const historyEntry: ReadingHistoryEntry = {
        ...entry,
        timestamp: new Date().toISOString()
      };

      // Save to localStorage first for immediate feedback and state persistence
      try {
        const prefs = JSON.parse(localStorage.getItem('quran_reader_preferences') || '{}');
        if (!Array.isArray(prefs.readingHistory)) {
          prefs.readingHistory = [];
        }
        
        // Remove any existing entries for the same surah/verse to avoid duplicates
        prefs.readingHistory = prefs.readingHistory.filter((h: ReadingHistoryEntry) => 
          !(h.surah === entry.surah && h.verse === entry.verse)
        );
        
        // Add new entry at the beginning
        prefs.readingHistory.unshift(historyEntry);
        
        // Keep only last 100 entries
        prefs.readingHistory = prefs.readingHistory.slice(0, 100);
        
        // Save back to localStorage
        localStorage.setItem('quran_reader_preferences', JSON.stringify(prefs));
        
        // Also save as last read position
        localStorage.setItem('last_quran_position', JSON.stringify({
          surah: entry.surah,
          verse: entry.verse,
          timestamp: new Date().toISOString()
        }));
      } catch (error) {
        console.warn('Error saving history to localStorage:', error);
      }

      // Try to get user from BehaviorSubject first as it's faster
      const currentUser = this._user.getValue();
      if (currentUser?.id) {
        await this.saveReadingHistoryToServer(currentUser.id, historyEntry);
        return;
      }

      // If no user in BehaviorSubject, check Firebase
      const user = this.auth.currentUser;
      if (!user) {
        // Don't throw error, just log warning as this is non-critical functionality
        console.warn('No user logged in, reading history saved only locally');
        return;
      }

      await this.saveReadingHistoryToServer(user.uid, historyEntry);
    } catch (error) {
      console.warn('Error saving reading history:', error);
      // Don't throw error as this is non-critical functionality
    }
  }

  // Helper method to save reading history to server with retries
  private async saveReadingHistoryToServer(userId: string, entry: any): Promise<void> {
    let retries = 3;
    while (retries > 0) {
      try {
        const token = await this.getToken();
        if (!token) {
          console.warn('No auth token available, skipping server save');
          return;
        }

        await this.http.post<any>(
          `${environment.apiUrl}/api/users/${userId}/reading-history`,
          entry,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        ).toPromise();
        
        return; // Success, exit
      } catch (error) {
        retries--;
        if (retries === 0) {
          console.warn('Failed to save reading history to server after retries');
          return;
        }
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  // Get last read position
  getLastReadPosition(): { surah: number; verse: number; timestamp: string } | null {
    try {
      const lastPosition = localStorage.getItem('last_quran_position');
      if (lastPosition) {
        return JSON.parse(lastPosition);
      }
      return null;
    } catch (error) {
      console.warn('Error getting last read position:', error);
      return null;
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
    this.ngZone.run(() => {
        this.router.navigate(['/auth/login']);
    });
  }

  // Navigate to the originally requested URL after successful login
  navigateToSavedRoute(): void {
    const redirectUrl = localStorage.getItem('redirectUrl') || '/';
    localStorage.removeItem('redirectUrl');  // Clear it after use
    this.ngZone.run(() => {
        this.router.navigate([redirectUrl]);
    });
  }

  // Save the current route for later redirect
  private saveCurrentRoute(): void {
    const currentRoute = this.router.url;
    if (currentRoute && currentRoute !== '/auth/login') {
      localStorage.setItem('redirectUrl', currentRoute);
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

  // Check if user has premium status
  async isPremiumUser(): Promise<boolean> {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        return false;
      }

      // Check cache first
      const cachedStatus = localStorage.getItem('premium_status');
      const cachedTimestamp = localStorage.getItem('premium_status_timestamp');
      const cacheAge = cachedTimestamp ? Date.now() - parseInt(cachedTimestamp) : Infinity;

      // Use cache if it's less than 5 minutes old
      if (cachedStatus && cacheAge < 5 * 60 * 1000) {
        return cachedStatus === 'true';
      }

      // Try to refresh token and get latest claims
      try {
        await this.refreshAuth();
        const idTokenResult = await user.getIdTokenResult(true);
        
        // Check premium status from claims
        const isPremium = idTokenResult.claims['premium'] === true || 
                         idTokenResult.claims['subscriptionStatus'] === 'active';

        if (isPremium) {
          // Update cache
          localStorage.setItem('premium_status', 'true');
          localStorage.setItem('premium_status_timestamp', Date.now().toString());
          
          // Update user object
          const currentUser = this._user.value;
          if (currentUser) {
            this._user.next({
              ...currentUser,
              isPremium: true,
              features: idTokenResult.claims['features'] || {}
            });
          }
          
          return true;
        }
      } catch (tokenError) {
        console.warn('Token refresh failed, checking with server:', tokenError);
      }

      // If token refresh fails or user is not premium in claims, check with server
      try {
        const token = await user.getIdToken();
        const response = await firstValueFrom(
          this.http.get<any>(`${environment.apiUrl}/api/subscription/status`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }).pipe(
            retry({
              count: 3,
              delay: 1000,
              resetOnSuccess: true
            })
          )
        );

        const isServerPremium = response?.status === 'active' || response?.plan === 'premium';
        
        // Update cache
        localStorage.setItem('premium_status', isServerPremium.toString());
        localStorage.setItem('premium_status_timestamp', Date.now().toString());
        
        // Update user object
        const currentUser = this._user.value;
        if (currentUser) {
          this._user.next({
            ...currentUser,
            isPremium: isServerPremium,
            features: response?.features || {}
          });
        }
        
        return isServerPremium;
      } catch (serverError) {
        console.error('Error checking server premium status:', serverError);
        // If server check fails, use cached status if available
        return cachedStatus === 'true';
      }
    } catch (error) {
      console.error('Error checking premium status:', error);
      // If all checks fail, use cached status if available
      const cachedStatus = localStorage.getItem('premium_status');
      return cachedStatus === 'true';
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

  async refreshAuth(): Promise<void> {
    try {
      console.log('🔄 Starting auth refresh...');
      const user = await this.getCurrentUser();
      if (!user) {
        console.warn('❌ No user found during refresh');
        return;
      }

      console.log('👤 Current user:', { 
        uid: user.uid,
        email: user.email,
        isAnonymous: user.isAnonymous
      });

      await user.getIdToken(true);
      console.log('✅ Auth refresh successful');
    } catch (error) {
      console.error('❌ Error refreshing auth:', error);
      throw error;
    }
  }

  async debugCustomClaims(): Promise<void> {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        console.log('No current user found');
        return;
      }

      console.log('Current user:', {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified
      });

      // Force token refresh to get latest claims
      console.log('Forcing token refresh...');
      await user.getIdToken(true);
      
      // Get token result with claims
      const idTokenResult = await user.getIdTokenResult(true);
      console.log('Token expiration:', new Date(idTokenResult.expirationTime));
      console.log('Token issued at:', new Date(idTokenResult.issuedAtTime));
      console.log('Token authentication time:', new Date(idTokenResult.authTime));
      
      // Log all claims
      console.log('All token claims:', idTokenResult.claims);
      
      // Log specific premium-related claims
      console.log('Premium status:', {
        premium: idTokenResult.claims['premium'],
        subscriptionStatus: idTokenResult.claims['subscriptionStatus'],
        features: idTokenResult.claims['features']
      });

      // Check local storage state
      console.log('LocalStorage state:', {
        authToken: !!localStorage.getItem('auth_token'),
        tokenTimestamp: localStorage.getItem('auth_token_timestamp'),
        premiumStatus: localStorage.getItem('premium_status'),
        premiumTimestamp: localStorage.getItem('premium_status_timestamp')
      });

      // Check current user state
      const currentUser = this._user.value;
      console.log('Current user state:', {
        hasUser: !!currentUser,
        isPremium: currentUser?.isPremium,
        features: currentUser?.features
      });

      // Verify token format
      const token = await user.getIdToken();
      console.log('Token format:', {
        length: token.length,
        parts: token.split('.').length,
        hasBearer: token.startsWith('Bearer '),
        truncated: `${token.substring(0, 10)}...${token.substring(token.length - 10)}`
      });

    } catch (error) {
      console.error('Error in debugCustomClaims:', error);
    }
  }

  private handleError(error: HttpErrorResponse | Error): Observable<never> {
    let errorMessage = 'An error occurred. Please try again later.';
    let notificationType = 'error';

    if (error instanceof HttpErrorResponse) {
        switch (error.status) {
            case 401:
                errorMessage = 'Please sign in to access this feature';
                notificationType = 'warning';
                // Redirect to login page inside NgZone
                this.ngZone.run(() => {
                    this.router.navigate(['/auth/login'], {
                        queryParams: { returnUrl: this.router.url }
                    });
                });
                break;
            // ... rest of the cases ...
        }
    }
    // ... rest of the method ...
    return throwError(errorMessage);
  }

  public async waitForAuthReady(): Promise<void> {
    // Implement the logic to wait for auth to be ready
    // This is a placeholder and should be replaced with the actual implementation
    // based on your Firebase setup and AngularFireAuth service
    await new Promise(resolve => setTimeout(resolve, 1000)); // Placeholder wait
  }

  private initTokenFromCache() {
    try {
      const cached = localStorage.getItem(this.TOKEN_CACHE_KEY);
      if (!cached) return;

      const parsedToken = JSON.parse(cached);
      if (!parsedToken?.timestamp) return;

      const age = Date.now() - parsedToken.timestamp;
      if (age < this.TOKEN_CACHE_DURATION) {
        this.cachedToken = parsedToken;
      } else {
        localStorage.removeItem(this.TOKEN_CACHE_KEY);
      }
    } catch (error) {
      console.warn('Error initializing token from cache:', error);
      this.cachedToken = null;
    }
  }
} 