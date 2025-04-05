import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, of, from, throwError, switchMap, firstValueFrom, timeout, retry, catchError, map, take, ReplaySubject, finalize } from 'rxjs';
import { tap } from 'rxjs/operators';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { MatDialog } from '@angular/material/dialog';
import { ReauthDialogComponent } from '../components/reauth-dialog/reauth-dialog.component';
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
  FacebookAuthProvider,
} from 'firebase/auth';

import { UserInfo } from '@angular/fire/auth';
import { Auth, User, IdTokenResult } from '@angular/fire/auth';

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
  subscriptionEnd?: number | null; // Optional: Unix timestamp (seconds) when access ends for canceled subs
  subscriptionStatus?: string;
  bookmarks: string[];
  history: any[];
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

  // Add loading state
  private _isLoading = new BehaviorSubject<boolean>(false);
  isLoading$ = this._isLoading.asObservable();

  // Add flag to prevent duplicate sign-in processing
  private isSigningIn = new Map<string, boolean>();

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

  // Subject to signal when initial auth state is ready
  private authReady = new ReplaySubject<void>(1); // Emits one value and caches it
  private initializationStateProcessed = false; // Flag to ensure authReady signals only once

  private tokenRefreshTimer: any = null; // Add a handle for the timer

  constructor(
    private router: Router,
    private http: HttpClient,
    private ngZone: NgZone,
    private dialog: MatDialog
  ) {
    // Initialize token from cache
    this.initTokenFromCache();
    
    // Check for redirect result first, but don't trigger full sign-in here
    this.handleRedirectResult().catch(error => {
      console.error('Error handling redirect:', error);
      // If redirect fails, onAuthStateChanged should still fire with null
      // or the existing user, and handle authReady signal.
      // No need to signal authReady here anymore.
    });
    
    // Then listen for Firebase auth state changes (Primary Handler)
    this.setupAuthStateListener();
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
          },
          bookmarks: cachedUser.bookmarks || [],
          history: cachedUser.history || []
        } as AppUser);
        
        // Mark as authenticated in localStorage
        localStorage.setItem('isAuthenticated', 'true');
        
        if (!this.authReady.closed) {
            this.authReady.next();
        }
      } else {
      }
    } catch (error) {
        if (!this.authReady.closed) {
             this.authReady.next();
        }
    }
  }

  // Convert Firebase user to our User model
  private mapFirebaseUser(firebaseUser: FirebaseUser, idTokenResult?: IdTokenResult): AppUser {
    const names = firebaseUser.displayName?.split(' ') || ['', ''];
    const claims = idTokenResult?.claims || {};

    // Use bracket notation and check type for premium status
    const isPremium = claims['premium'] === true || claims['subscriptionStatus'] === 'active';

    // Check type for subscriptionEnd before assigning
    const subEndClaim = claims['subscriptionEnd'];
    const subscriptionEnd = typeof subEndClaim === 'number' ? subEndClaim : null;

    // Check type for subscriptionStatus before assigning
    const subStatusClaim = claims['subscriptionStatus'];
    const subscriptionStatus = typeof subStatusClaim === 'string' ? subStatusClaim : 'inactive';

    return {
      id: firebaseUser.uid,
      uid: firebaseUser.uid,
      email: firebaseUser.email || '',
      firstName: names[0] || '',
      lastName: names.slice(1).join(' ') || '',
      imageUrl: firebaseUser.photoURL || '',
      emailVerified: firebaseUser.emailVerified || false,
      createdAt: firebaseUser.metadata.creationTime ? new Date(firebaseUser.metadata.creationTime) : new Date(),
      lastSignInAt: firebaseUser.metadata.lastSignInTime ? new Date(firebaseUser.metadata.lastSignInTime) : new Date(),
      isAdmin: claims['admin'] === true, // Use bracket notation
      isPremium: isPremium,
      subscriptionEnd: subscriptionEnd, // Use validated value
      subscriptionStatus: subscriptionStatus, // Use validated value
      preferences: {}, // Initialize empty
      bookmarks: [], // Initialize empty
      history: [], // Initialize empty
      token: idTokenResult?.token
    };
  }

  private async handleUserSignedIn(firebaseUser: FirebaseUser): Promise<void> {
    const userId = firebaseUser.uid;

    let initialUser: AppUser;
    let idTokenResult: IdTokenResult | null = null;

    try {
      // 1. Get ID Token Result (force refresh recommended on sign-in)
      try {
        idTokenResult = await firebaseUser.getIdTokenResult(true); // Force refresh
      } catch (tokenError) {
         console.error(`[handleUserSignedIn] Failed to get valid ID token result for ${firebaseUser.uid} after forced refresh. Session might be invalid.`, tokenError);
         await this.signOut(); // Clean up inconsistent state
         return;
      }

      if (!idTokenResult?.token) {
        console.error(`[handleUserSignedIn] No valid token found in IdTokenResult for ${firebaseUser.uid}.`);
        await this.signOut();
        return;
      }

      // 2. Prepare Initial User State (Firebase User + Token Claims via IdTokenResult)
      initialUser = this.mapFirebaseUser(firebaseUser, idTokenResult);

      // 3. Fetch Full User Profile from Backend
      const profileUrl = `${environment.apiUrl}/api/users/${initialUser.uid}/profile`;
      const profileData: AppUser | null = await firstValueFrom(
          this.http.get<AppUser>(profileUrl, { headers: { 'Authorization': `Bearer ${initialUser.token}` } }).pipe(
              timeout(15000),
              catchError(err => {
                  console.error(`[handleUserSignedIn] Error fetching profile for ${initialUser.uid}:`, err);
                  return of(null);
              }),
          )
      );

      // 4. Merge Profile Data & Update State
      let finalUser = initialUser;
      if (profileData) {
         finalUser = {
           ...initialUser,
           ...profileData,
           uid: initialUser.uid,
           email: initialUser.email,
           emailVerified: initialUser.emailVerified,
           isAdmin: initialUser.isAdmin,
           isPremium: initialUser.isPremium,
           token: initialUser.token,
           preferences: { ...(initialUser.preferences || {}), ...(profileData.preferences || {}), bookmarks: profileData.bookmarks || initialUser.bookmarks || [] },
           bookmarks: profileData.bookmarks || initialUser.bookmarks || [],
           history: profileData.history || initialUser.history || [],
           subscriptionStatus: profileData.subscriptionStatus || initialUser.subscriptionStatus || 'inactive',
           subscriptionEnd: profileData.subscriptionEnd !== undefined ? profileData.subscriptionEnd : initialUser.subscriptionEnd,
         };
         this._user.next(finalUser);
         this.cacheUserData(finalUser);
      } else {
          console.warn(`[handleUserSignedIn] Profile fetch failed for ${initialUser.uid}. Using initial data.`);
          this._user.next(initialUser); // Use initial user data if profile fetch fails
          this.cacheUserData(initialUser);
      }

      this.startTokenRefreshTimer();

    } catch (error) {
        console.error(`[handleUserSignedIn] Critical error during sign-in process for ${firebaseUser.uid}:`, error);
        await this.signOut();
        throw error;
    }
  }

  private async setupAuthStateListener() {
    onAuthStateChanged(this.auth, async (firebaseUser) => {
      let processedStateInThisCallback = false;
      let errorOccurred = false;

      // Process state determination potentially outside NgZone for timing
      try {
          if (firebaseUser) {
              await this.handleUserSignedIn(firebaseUser); // Still needs NgZone internally if updating UI-bound state
              processedStateInThisCallback = true;
          } else {
              this.clearAuthData(); // May not need NgZone if just clearing data
              processedStateInThisCallback = true;
          }
      } catch (error) {
          console.error("[AuthState] Error processing auth state change:", error);
          this.clearAuthData();
          processedStateInThisCallback = true;
          errorOccurred = true;
      } 
      
      // Signal readiness OUTSIDE NgZone run, but only once
      if (processedStateInThisCallback && !this.initializationStateProcessed) {
          this.initializationStateProcessed = true;
          this.authReady.next();
      }
    });
  }

  private clearAuthData() {
    console.log('[clearAuthData] Clearing user data and stopping loading.');
    const wasLoading = this._isLoading.getValue();
    this._user.next(null);
    this.cachedToken = null;
    localStorage.removeItem(this.TOKEN_CACHE_KEY);
    localStorage.removeItem('currentUser');
    localStorage.removeItem('premium_status');
    localStorage.removeItem('premium_status_timestamp');
    // Clear any other relevant local storage keys

    this.isSigningIn.clear(); // Clear all signing in flags
    console.log('[clearAuthData] Cleared isSigningIn map.');
    if (wasLoading) {
        this._isLoading.next(false); // Ensure loading stops if it was active
        console.log('[clearAuthData] Set loading state to false.');
    }
  }

  private startTokenRefreshTimer() {
    // Clear existing timer if any
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
    }
    // Refresh slightly before the 1-hour expiry (e.g., 55 minutes)
    const refreshInterval = 55 * 60 * 1000;
    this.tokenRefreshTimer = setTimeout(async () => {
      console.log('Token refresh timer triggered. Forcing refresh...');
      await this.getToken(true); // Force refresh
      this.startTokenRefreshTimer(); // Restart the timer
    }, refreshInterval);
  }

  // Token management
  async getToken(forceRefresh = false): Promise<string | null> {
    const currentUser = this._user.value;
    // If not forcing refresh, try getting token from user state first
    if (!forceRefresh && currentUser?.token) {
      return currentUser.token;
    } 

    const firebaseUser = this.auth.currentUser;
    if (!firebaseUser) {
      console.warn('getToken: No Firebase user found.');
      return null;
    }

    // Get token AND claims from Firebase SDK (force refresh if requested)
    let idTokenResult: IdTokenResult | null = null;
    try {
      // Get the full result to access claims, especially when forcing refresh
      idTokenResult = await firebaseUser.getIdTokenResult(forceRefresh);
    } catch (error) {
      console.error('Error getting ID token result:', error);
      // Handle specific errors like needing re-authentication if necessary
      return null;
    }
    
    const token = idTokenResult?.token; // Extract token after getting result
    
    if (!token) {
        console.warn('getToken: Failed to obtain a valid token from Firebase SDK.');
        return null;
    }

    // Update our AppUser state with the fetched token AND potentially updated claims if refreshed
    const currentUserState = this._user.value;
    if (currentUserState && idTokenResult) { // Ensure we have idTokenResult to process claims
        // Use mapFirebaseUser to re-evaluate claims based on the fresh token result
        const userWithLatestClaims = this.mapFirebaseUser(firebaseUser, idTokenResult);

        // Create the potential new state, merging existing profile data
        // with potentially updated claims and the new token.
        const potentialNewState: AppUser = {
            ...currentUserState, // Keep existing profile data like preferences, history etc. fetched from backend
            // Overwrite fields derived directly from FirebaseUser or claims
            id: firebaseUser.uid,
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            emailVerified: firebaseUser.emailVerified,
            isAdmin: userWithLatestClaims.isAdmin, // From claims via mapFirebaseUser
            isPremium: userWithLatestClaims.isPremium, // From claims via mapFirebaseUser
            subscriptionStatus: userWithLatestClaims.subscriptionStatus, // From claims via mapFirebaseUser
            subscriptionEnd: userWithLatestClaims.subscriptionEnd, // From claims via mapFirebaseUser
            token: token // The newly fetched token
        };

        // Only update the BehaviorSubject if the state has actually changed
        if (JSON.stringify(currentUserState) !== JSON.stringify(potentialNewState)) {
            this._user.next(potentialNewState);
            this.cacheUserData(potentialNewState); // Update cache
        }
    }
    
    return token;
  }

  private async refreshAndGetToken(): Promise<string | null> {
    console.warn('refreshAndGetToken called - this should ideally be handled by getToken(true)');
    return this.getToken(true); // Delegate to getToken with forceRefresh = true
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
            console.warn('getUserPreferences: No current user found, returning default preferences');
            return this.getDefaultPreferences();
        }
        const userId = user.uid;

        // --- Enhanced Caching ---
        const cacheKey = `user_prefs_${userId}`;
        const cachedData = this.getCachedData(cacheKey); // Use helper with REQUEST_CACHE_DURATION
        if (cachedData) {
            console.log(`[AuthService] getUserPreferences: Returning cached data for ${userId}`);
            this.preferencesSubject.next(cachedData); // Ensure BehaviorSubject is updated
            return cachedData;
        }
        // --- End Enhanced Caching ---

        console.log(`[AuthService] getUserPreferences: Cache miss or stale for ${userId}. Fetching from API...`);
        // Get fresh token (interceptor should handle it, but force refresh if needed)
        const token = await user.getIdToken();
        if (!token) {
            console.error('getUserPreferences: Failed to get auth token');
            return this.getDefaultPreferences();
        }

        // Make API request
        const response = await firstValueFrom(
            this.http.get<any>(`${environment.apiUrl}/api/users/${userId}/preferences`).pipe(
                timeout(15000),
                retry({ count: 2, delay: 1500 }),
                catchError(error => {
                    console.error(`[AuthService] getUserPreferences: Error fetching preferences for ${userId}:`, error);
                    return of(null); // Return null on error, handle below
                })
            )
        );

        const preferencesToCache = response?.preferences || this.getDefaultPreferences();

        // --- Update Cache ---
        console.log(`[AuthService] getUserPreferences: Caching new data for ${userId}`);
        this.setCachedData(cacheKey, preferencesToCache);
        // --- End Update Cache ---

        this.preferencesSubject.next(preferencesToCache);
        return preferencesToCache;

    } catch (error) {
        console.error('[AuthService] getUserPreferences: General error:', error);
        const defaults = this.getDefaultPreferences();
        this.preferencesSubject.next(defaults);
        return defaults;
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
          console.log('Admin status endpoint not available, defaulting to non-admin');
        } else {
          console.warn('Could not check admin status');
        }
        // Default to non-admin if API endpoint doesn't exist
        return false;
      }
    } catch (error) {
      console.log('Error in admin status check, defaulting to non-admin');
      return false;
    }
  }

  // Email/Password Sign In
  signInWithEmailAndPassword(email: string, password: string): Promise<UserCredential> {
    // Store credentials for re-auth
    localStorage.setItem('user_email', email);
    // Store password securely (in production, consider using more secure storage)
    // localStorage.setItem('user_password', password); // REMOVED: Do not store password in localStorage
    
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
  private async handleRedirectResult(): Promise<void> {
    try {
      console.log("Checking for redirect result...");
      const result = await getRedirectResult(this.auth);
      if (result) {
        console.log("Redirect result found:", result.user.uid);
        // Successfully authenticated via redirect.
        // We DON'T call handleUserSignedIn here anymore.
        // The onAuthStateChanged listener will fire shortly and handle it.
        // We might store the credential if needed for linking later, but not essential now.
        // const credential = GoogleAuthProvider.credentialFromResult(result); // or FacebookAuthProvider
      } else {
        console.log("No redirect result found.");
      }
    } catch (error) {
      console.error("Error getting redirect result:", error);
      // Let onAuthStateChanged handle the state (likely null user)
      // and signal authReady.
    }
  }

  // Sign out
  async signOut(): Promise<void> {
    console.log('[FirebaseAuthService] signOut called.');
    this._isLoading.next(true);
    try {
      // Cancel any ongoing operations if necessary (e.g., token refresh timer)
      if (this.tokenRefreshTimer) {
        clearTimeout(this.tokenRefreshTimer);
        this.tokenRefreshTimer = null;
        console.log('[FirebaseAuthService] Token refresh timer cleared.');
      }

      // Clear local state immediately
      this.clearAuthData(); // This already clears the user subject and local storage for user data/token

      // *** Add explicit clearing for preference/state caches ***
      localStorage.removeItem(this.PREFERENCES_CACHE_KEY); // Clear cached preferences
      localStorage.removeItem('quran_reader_preferences'); // Clear profile component specific cache
      localStorage.removeItem('quranReaderPreferences'); // Another key used by profile
      localStorage.removeItem(this.USER_CACHE_KEY); // Redundant but safe
      localStorage.removeItem(this.TOKEN_CACHE_KEY); // Redundant but safe
      localStorage.removeItem(this.LAST_ROUTE_KEY); // Clear last route
      localStorage.removeItem(this.ROUTE_STATE_KEY); // Clear saved route state
      // Add any other known localStorage keys specific to user session state here

      // Clear BehaviorSubject caches if necessary (though clearAuthData handles _user)
      this.preferencesCache = null; // Clear in-memory cache too
      this.preferencesSubject.next(null); // Signal preference reset
      this.userDataSubject.next({ // Reset user data observable state (without lastLoad)
        bookmarks: [],
        history: [],
        preferences: null
      });


      // Sign out from Firebase Auth
      await signOut(this.auth);
      console.log('[FirebaseAuthService] Firebase sign-out successful.');

      // Clear any service-specific state if needed (e.g., in QuranService, etc.)
      // Example: this.quranService.clearUserState();

      // Force a full page reload to the login page to ensure clean state
      // Use window.location.assign for cleaner history than window.location.href
      this.ngZone.run(() => { // Keep ngZone just in case, though location assign might bypass it
        window.location.assign('/auth/login'); 
      });

    } catch (error) {
      console.error('[FirebaseAuthService] Error during sign out:', error);
      // Attempt to clear local state even if Firebase sign-out fails
      this.clearAuthData();
      localStorage.removeItem(this.PREFERENCES_CACHE_KEY);
      localStorage.removeItem('quran_reader_preferences');
      localStorage.removeItem('quranReaderPreferences');
      localStorage.removeItem(this.USER_CACHE_KEY);
      localStorage.removeItem(this.TOKEN_CACHE_KEY);
      localStorage.removeItem(this.LAST_ROUTE_KEY);
      localStorage.removeItem(this.ROUTE_STATE_KEY);
      this.preferencesCache = null;
      this.preferencesSubject.next(null);
      this.userDataSubject.next({ bookmarks: [], history: [], preferences: null }); // Reset without lastLoad

      // Optionally show error message to user
      // Handle specific errors if needed

    } finally {
      this._isLoading.next(false);
      console.log('[FirebaseAuthService] signOut finished.');

      // Force a full page reload to the login page to ensure clean state
      // Use window.location.assign for cleaner history than window.location.href
      this.ngZone.run(() => { // Keep ngZone just in case, though location assign might bypass it
        window.location.assign('/auth/login'); 
      });
    }
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
  async sendPasswordResetEmail(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(this.auth, email);
    } catch (error) {
      console.error('Error sending password reset email:', error);
      throw error;
    }
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
  private async saveReadingHistoryToServer(userId: string, entry: ReadingHistoryEntry): Promise<void> {
    const MAX_RETRIES = 2;
    const RETRY_DELAY = 1000; // 1 second

    // --- Optimistic Update ---
    let reverted = false; // Flag to track if we reverted
    const originalData = this.userDataSubject.getValue();

    // Linter Fix 1: Check if originalData exists
    if (!originalData) {
        console.error('[AuthService] Cannot perform optimistic update: originalData is null.');
        // Optionally, still try to save to server without optimistic update?
        // Or just return/throw an error. For now, just return.
        return; 
    }

    try {
        // Linter Fix 2: Ensure originalData.history is an array
        const originalHistory: ReadingHistoryEntry[] = originalData.history ?? [];
        const optimisticallyUpdatedHistory = this.addOrUpdateHistoryEntry(originalHistory, entry);
        this.userDataSubject.next({ ...originalData, history: optimisticallyUpdatedHistory });
        console.log('[AuthService] userDataSubject emitted after optimistic update:', JSON.stringify(this.userDataSubject.getValue())); 
        console.log('[AuthService] Optimistically updated history:', entry);
    } catch (optimisticError) {
        console.error('[AuthService] Error during optimistic history update:', optimisticError);
        return; 
    }
    // --- End Optimistic Update ---

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const token = await this.getToken(true); // Get fresh token for each attempt potentially needed
        if (!token) throw new Error('Authentication token unavailable for saving history.');

        console.log(`[AuthService] Attempt ${attempt} to save history to server...`);
        await firstValueFrom(
          this.http.post<any>(
            `${environment.apiUrl}/api/users/${userId}/reading-history`, 
            entry, 
            { headers: { 'Authorization': `Bearer ${token}` } }
          )
        );

        // Server call successful, the optimistic update is now confirmed.
        console.log('[AuthService] Reading history saved successfully on server.');
        return; // Exit loop on success

      } catch (error: any) {
        console.error(`[AuthService] Error saving reading history (attempt ${attempt}):`, error);

        // --- Revert Optimistic Update on Failure ---
        if (!reverted) {
            console.warn('[AuthService] Reverting optimistic history update due to server error.');
            this.userDataSubject.next(originalData); // Restore original state
            console.log('[AuthService] userDataSubject emitted after REVERTING update:', JSON.stringify(this.userDataSubject.getValue())); 
            reverted = true;
            // Optionally show a snackbar/message to the user about the failure
        }
        // --- End Revert ---

        if (attempt === MAX_RETRIES) {
          // Rethrow error after max retries to signal final failure
          throw new Error(`Failed to save reading history after ${MAX_RETRIES} attempts: ${error.message}`);
        }

        // Optional: Check for specific error types (e.g., 401 Unauthorized) and stop retrying
        if (error.status === 401 || error.status === 403) {
             console.error('[AuthService] Authentication error during history save, stopping retries.');
             throw error; // Stop retrying on auth errors
        }

        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY)); // Wait before retrying
      }
    }
  }

  // Helper function to add/update history entry (keeps list sorted and limited)
  private addOrUpdateHistoryEntry(history: ReadingHistoryEntry[], newEntry: ReadingHistoryEntry): ReadingHistoryEntry[] {
      const HISTORY_LIMIT = 100;
      // Ensure timestamp is a Date object for comparison if needed, though backend handles dates primarily
      const entryTimestamp = new Date(newEntry.timestamp); 

      // Filter out any existing entry for the same surah (as per backend logic)
      const filteredHistory = history.filter(e => e.surah !== newEntry.surah);
      
      // Add the new entry
      const updatedHistory = [newEntry, ...filteredHistory];

      // Sort by timestamp descending (newest first) - ensure timestamps are comparable
      updatedHistory.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      // Limit the history size
      return updatedHistory.slice(0, HISTORY_LIMIT);
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
      const readingHistory = userSettings.history || [];
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
          preferences.history = updatedHistory;
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
    console.log("Checking isPremiumUser...");
    await this.authReady; // Ensure auth state is initialized

    const firebaseUser = this.auth.currentUser;
    if (!firebaseUser) {
      console.log("isPremiumUser: No Firebase user found.");
      return false; // Not logged in, definitely not premium
    }

    const currentUserState = this._user.value;
    if (!currentUserState) {
      console.log("isPremiumUser: No user state found in BehaviorSubject.");
      // Fallback needed - potentially check claims again or wait longer?
    }

    // 1. Check local state first (fastest)
    if (currentUserState?.isPremium) {
      console.log(`isPremiumUser: Returning true based on local user state.`);
      return true;
    }

    // 2. If local state is false/missing, verify with token claims (more reliable)
    console.log("isPremiumUser: Local state is false or missing. Verifying with token claims...");
    try {
      const tokenResult = await firebaseUser.getIdTokenResult(true); // Force refresh for latest claims
      const claims = tokenResult.claims;
      const isPremium = claims['premium'] === true && claims['subscriptionStatus'] === 'active';
      console.log(`isPremiumUser: Fetched premium status from current claims: ${isPremium}`);

      // Update local state if claims indicate premium but local state didn't
      if (isPremium && (!currentUserState || !currentUserState.isPremium)) {
        console.log("isPremiumUser: Updating local state to true based on claims.");
        this._user.next({ ...currentUserState, id: firebaseUser.uid, uid: firebaseUser.uid, isPremium: true, subscriptionStatus: 'active' } as AppUser);
      }

      return isPremium;
    } catch (claimError) {
      console.error("isPremiumUser: Error fetching token claims:", claimError);
      // If fetching claims fails, return false as we can't verify
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
      history: []
    };
  }

  // Cache and throttling helpers
  private getCachedData(key: string): any {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      // *** Use REQUEST_CACHE_DURATION (60s) for API calls ***
      if (Date.now() - timestamp < this.REQUEST_CACHE_DURATION) {
        return data;
      }
      console.log(`[AuthService] Cache expired for key: ${key}`);
      localStorage.removeItem(key); // Remove expired cache item
      return null;
    } catch (error) {
      console.warn(`[AuthService] Error reading cache for key ${key}:`, error);
      localStorage.removeItem(key); // Remove corrupted cache item
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
      console.warn(`[AuthService] Error writing cache for key ${key}:`, error);
    }
  }

  // User data management
  private async loadUserData(userId: string): Promise<void> {
    console.log(`[AuthService] loadUserData called for ${userId}`);
    // --- Add Caching Logic ---
    const cacheKey = `user_data_${userId}`;
    const cachedUserData = this.getCachedData(cacheKey); // Uses helper with REQUEST_CACHE_DURATION
    if (cachedUserData) {
        console.log(`[AuthService] loadUserData: Returning cached data for ${userId}`);
        this.userDataSubject.next(cachedUserData);
        this.preferencesSubject.next(cachedUserData.preferences || this.getDefaultPreferences()); // Update prefs too
        return; // Exit if cache is valid
    }
    // --- End Caching Logic ---

    console.log(`[AuthService] loadUserData: Cache miss or stale for ${userId}. Fetching from API...`);

    try {
        // Fetch combined user data from the backend profile endpoint
        // Interceptor handles token
        const userData = await firstValueFrom(this.http.get<any>(`${environment.apiUrl}/api/users/${userId}/profile`).pipe(
            timeout(20000),
            retry({ count: 2, delay: 1500 }),
            catchError(error => {
                console.error(`[AuthService] loadUserData: Error fetching profile for ${userId}:`, error);
                // Return a default/empty structure on error
                return of({
                    id: userId,
                    preferences: this.getDefaultPreferences(),
                    bookmarks: [],
                    history: this.userDataSubject.getValue()?.history || [] // Preserve existing history on fetch error
                });
            })
        ));

        if (userData) {
          console.log(`[AuthService] loadUserData: Successfully fetched data for ${userId}.`);

          // Ensure preferences object exists before caching/emitting
          if (!userData.preferences) {
              userData.preferences = this.getDefaultPreferences();
          }
          // Ensure other fields exist if needed...
          userData.bookmarks = userData.bookmarks || [];
          userData.history = userData.history || [];

          // --- Update Cache ---
          this.setCachedData(cacheKey, userData); // Cache the fetched data
          // --- End Update Cache ---

          // Emit the updated user data
          this.userDataSubject.next(userData);
          this.preferencesSubject.next(userData.preferences);
        }
    } catch (error) {
        console.error(`[AuthService] loadUserData: General error fetching profile for ${userId}:`, error);
        // Emit default data on critical failure (preserving existing history if possible)
        const defaultData = {
            id: userId,
            preferences: this.getDefaultPreferences(),
            bookmarks: [],
            history: this.userDataSubject.getValue()?.history || []
        };
        this.userDataSubject.next(defaultData);
        this.preferencesSubject.next(defaultData.preferences);
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
  getReadingHistory(): Observable<ReadingHistoryResponse> {
    return this.user$.pipe(
      take(1),
      switchMap(user => {
        if (!user || !user.id) {
          console.warn('getReadingHistory: User not authenticated');
          return of({ success: false, message: 'User not authenticated', history: [] });
        }

        const userId = user.id;
        const cacheKey = `reading_history_${userId}`;
        const cachedHistory = this.getCachedData(cacheKey);

        if (cachedHistory) {
          return of({ success: true, history: cachedHistory });
        }

        if (this.shouldThrottle(`history_${userId}`)) {
          return of({ success: true, history: [] });
        }

        this.updateLastRequestTime(`history_${userId}`);

        return from(this.getToken(true)).pipe(
          switchMap(token => {
            if (!token) {
              console.warn('getReadingHistory: Failed to get fresh token');
              return of({ success: false, message: 'Authentication token unavailable', history: [] });
            }

            return this.http.get<ReadingHistoryResponse>(
              `${environment.apiUrl}/api/users/${userId}/reading-history`,
              {
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              }
            ).pipe(
              tap(response => {
                if (response.success && response.history) {
                  this.setCachedData(cacheKey, response.history);
                } else {
                  console.warn(`getReadingHistory: API call did not return successful history for ${userId}`, response);
                }
              }),
              catchError(error => {
                console.error(`getReadingHistory: HTTP Error for ${userId}:`, error);
                return throwError(() => ({ 
                  success: false, 
                  message: error.message || 'Failed to fetch reading history',
                  history: [],
                  status: error.status
                })); 
              })
            );
          }),
          catchError(tokenError => {
             console.error(`getReadingHistory: Error getting token for ${userId}:`, tokenError);
             return throwError(() => ({ 
               success: false, 
               message: 'Failed to obtain authentication token',
               history: [] 
             }));
          })
        );
      }),
      catchError(outerError => {
         console.error('getReadingHistory: Error in outer user$ pipe:', outerError);
         return throwError(() => ({ 
           success: false, 
           message: outerError.message || 'Error processing user data for history',
           history: [] 
         }));
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
              // Update state ONLY on success
              const current = this.userDataSubject.getValue();
              this.userDataSubject.next({ ...current, bookmarks: response.bookmarks });
            } else {
              // Handle potential server-side failure message
              console.warn('Server failed to remove bookmark:', response.message);
              // Optionally show snackbar or notification to user
            }
          }),
          catchError(error => {
            // No need to revert local state as it wasn't changed optimistically
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
              // Update state ONLY on success
              const current = this.userDataSubject.getValue();
              this.userDataSubject.next({ ...current, bookmarks: response.bookmarks });
            } else {
              // Handle potential server-side failure message
              console.warn('Server failed to add bookmark:', response.message);
              // Optionally show snackbar or notification to user
            }
          }),
          catchError(error => {
            // No need to revert local state as it wasn't changed optimistically
            console.error('Error adding bookmark:', error);
            return of({ success: false, message: 'Failed to add bookmark', bookmarks: [] });
          })
        );
      })
    );
  }

  getBookmarks(): Observable<string[]> {
    return this.user$.pipe(
      take(1),
      switchMap(appUser => {
        if (!appUser || !appUser.id || !appUser.token) {
          console.warn('getBookmarks: No authenticated AppUser with ID and token found in BehaviorSubject.');
          return throwError(() => new Error('User not fully authenticated for getBookmarks')); 
        }

        const userId = appUser.id;
        const token = appUser.token;

        return this.http.get<string[]>(
          `${environment.apiUrl}/api/users/${userId}/bookmarks`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        ).pipe(
          map(bookmarks => Array.isArray(bookmarks) ? bookmarks : []),
          catchError(error => {
            console.error(`Error loading bookmarks for user ${userId}:`, error);
            return throwError(() => error); 
          })
        );
      }),
      catchError(error => {
        console.error('Error in getBookmarks observable chain:', error);
        return of([]);
      })
    );
  }

  async refreshAuth(): Promise<void> {
    try {
      const currentUser = this.auth.currentUser;
      
      if (!currentUser) {
        console.warn('❌ No current user found during token refresh');
        throw new Error('No authenticated user');
      }

      const newToken = await currentUser.getIdToken(true);

      this.cachedToken = {
        token: newToken,
        timestamp: Date.now()
      };
      
      localStorage.setItem(this.TOKEN_CACHE_KEY, JSON.stringify(this.cachedToken));

      if (!this.refreshTimerStarted) {
        this.startTokenRefreshTimer();
      }

      const currentUserState = this._user.value;
      if (currentUserState) {
        this._user.next({
          ...currentUserState,
          token: newToken
        });
      }
    } catch (error) {
      this.cachedToken = null;
      localStorage.removeItem(this.TOKEN_CACHE_KEY);
      throw error;
    }
  }

  async debugCustomClaims(): Promise<void> {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        return;
      }

      await user.getIdToken(true);
      
      const idTokenResult = await user.getIdTokenResult(true);
      
    } catch (error) {
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
                this.ngZone.run(() => {
                    this.router.navigate(['/auth/login'], {
                        queryParams: { returnUrl: this.router.url }
                    });
                });
                break;
        }
    }
    return throwError(errorMessage);
  }

  public async waitForAuthReady(): Promise<void> {
    // Wait for the first emission from authReady
    await firstValueFrom(this.authReady);
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
      this.cachedToken = null;
    }
  }

  async deleteAccount(): Promise<void> {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        throw new Error('No user signed in');
      }

      await this.reauthenticate();

      await user.delete();
      
      await this.signOut(); 
      
      this.ngZone.run(() => {
        this.router.navigate(['/']);
      });

    } catch (error) {
      try {
          await this.signOut(); 
      } catch (signOutError) {
      }
      throw error;
    }
  }

  async reauthenticate(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user || !user.email) {
      throw new Error('No user or user email logged in.');
    }

    if (!user.providerData || user.providerData.length === 0) {
      throw new Error('Cannot determine authentication provider.');
    }

    const providerId = user.providerData[0].providerId;

    try {
      if (providerId === 'google.com' || providerId === 'facebook.com') {
        const provider = providerId === 'google.com' 
          ? new GoogleAuthProvider() 
          : new FacebookAuthProvider(); 
        await reauthenticateWithPopup(user, provider);

      } else if (providerId === 'password') {
        const dialogRef = this.dialog.open(ReauthDialogComponent, {
          width: '400px',
          disableClose: true
        });

        const password = await firstValueFrom(dialogRef.afterClosed());

        if (!password) {
          throw new Error('Re-authentication cancelled by user.');
        }

        const credential = EmailAuthProvider.credential(user.email!, password);
        
        await reauthenticateWithCredential(user, credential);

      } else {
        throw new Error(`Reauthentication not supported for provider: ${providerId}`);
      }
    } catch (error) {
      if (error instanceof Error) {
         if (error.message.includes('auth/wrong-password') || error.message.includes('incorrect-password')) {
           throw new Error('Incorrect password provided.');
         }
         if (error.message === 'Re-authentication cancelled by user.') {
            throw error;
         }
      }
      throw error;
    }
  }

  private async cacheUserData(userData: any): Promise<void> {
    try {
      this.setCachedData(this.USER_CACHE_KEY, userData);
      this.userDataSubject.next(userData);
    } catch (error) {
    }
  }
} 