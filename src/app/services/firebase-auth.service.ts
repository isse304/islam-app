import { Injectable, NgZone, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, of, from, throwError, switchMap, firstValueFrom, timeout, retry, catchError, map, take, ReplaySubject, finalize, filter, tap, forkJoin } from 'rxjs';
import { tap as rxjsTap } from 'rxjs/operators';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { MatDialog } from '@angular/material/dialog';
import { ReauthDialogComponent } from '../components/reauth-dialog/reauth-dialog.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from './api.service';
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
  displayName?: string;
  photoURL?: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  emailVerified: boolean;
  createdAt: Date;
  lastSignInAt?: Date;
  preferences?: UserPreferences;
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
    lastState?: {
        isMushafView?: boolean;
        lastSurah?: number;
        lastVerse?: number;
        lastPage?: number;
        timestamp?: Date;
    };
    readingHistory?: any[];
    fontSize?: number;
    isDarkMode?: boolean;
    arabicFont?: string;
    showWordByWord?: boolean;
    isDoublePageView?: boolean;
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
  private readonly USER_CACHE_KEY = 'app_user_cache';
  private readonly PREMIUM_STATUS_KEY = 'premium_status';
  private readonly PREMIUM_TIMESTAMP_KEY = 'premium_timestamp';
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

  private readonly TOKEN_CACHE_KEY = 'firebase_id_token_cache';
  private readonly TOKEN_CACHE_DURATION = 55 * 60 * 1000; // 55 minutes
  private cachedToken: { token: string; timestamp: number } | null = null;

  // Subject to signal when initial auth state is ready
  private authReady = new ReplaySubject<boolean>(1);
  authReady$ = this.authReady.asObservable();

  // Flag to ensure signalAuthReady logic runs only once
  private hasSignaledAuthReady = false;

  private tokenRefreshTimer: any = null;

  private readonly API_RETRY_ATTEMPTS = 2;
  private readonly API_TIMEOUT = 15000; // 15 seconds
  private readonly TOKEN_REFRESH_MARGIN = 5 * 60 * 1000; // 5 minutes in milliseconds

  private authPromise: Promise<Auth>; // Restore authPromise
  private isAuthInitialized = false; // Add flag to prevent multiple initializations

  private _apiService: ApiService | null = null; // Add property to hold the instance

  constructor(
    private router: Router,
    private http: HttpClient,
    private ngZone: NgZone,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private injector: Injector // Inject Injector
  ) {
    // console.log('[AuthService] Constructor called');
    // Initialize authPromise but don't await here
    this.authPromise = this.initializeAuth();
    this.setupAuthStateListener();
  }

  // Private getter for lazy loading ApiService
  private get apiService(): ApiService {
    if (!this._apiService) {
      this._apiService = this.injector.get(ApiService);
    }
    return this._apiService;
  }

  // Convert Firebase user to our User model
  private mapFirebaseUser(firebaseUser: FirebaseUser, idTokenResult?: IdTokenResult): AppUser {
    const names = firebaseUser.displayName?.split(' ') || ['', ''];
    const claims = idTokenResult?.claims || {};

    const isPremium = claims['premium'] === true || claims['subscriptionStatus'] === 'active';
    const subEndClaim = claims['subscriptionEnd'];
    const subscriptionEnd = typeof subEndClaim === 'number' ? subEndClaim : null;
    const subStatusClaim = claims['subscriptionStatus'];
    const subscriptionStatus = typeof subStatusClaim === 'string' ? subStatusClaim : 'inactive';

    return {
      id: firebaseUser.uid,
      uid: firebaseUser.uid,
      email: firebaseUser.email || '',
      firstName: names[0] || '',
      lastName: names.slice(1).join(' ') || '',
      imageUrl: firebaseUser.photoURL || '',
      photoURL: firebaseUser.photoURL || 'assets/default-avatar.png',
      emailVerified: firebaseUser.emailVerified,
      createdAt: new Date(firebaseUser.metadata.creationTime || Date.now()),
      lastSignInAt: firebaseUser.metadata.lastSignInTime ? new Date(firebaseUser.metadata.lastSignInTime) : undefined,
      isAdmin: claims['admin'] === true,
      isPremium: isPremium,
      token: idTokenResult?.token || '',
      subscriptionEnd: subscriptionEnd,
      subscriptionStatus: subscriptionStatus,
      // Initialize bookmarks/history as empty, loaded separately
      bookmarks: [], 
      history: [] 
    };
  }

  // Helper to signal auth readiness only once
  private signalAuthReady(): void {
    if (!this.hasSignaledAuthReady) {
        // console.log('[FirebaseAuthService] Signaling authReady (true).');
        this.hasSignaledAuthReady = true; // Set flag immediately
        this.authReady.next(true); // Emit true
    }
  }

  // Clears the token refresh timer
  private clearTokenRefreshTimer(): void {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
      // console.log('[Timer] Token refresh timer cleared.');
    }
  }

  // Clears user-related data from cache/storage
  private clearUserCache(): void {
      localStorage.removeItem(this.USER_CACHE_KEY);
      localStorage.removeItem('currentUser'); // Legacy key if used
      localStorage.removeItem(this.PREMIUM_STATUS_KEY);
      localStorage.removeItem(this.PREMIUM_TIMESTAMP_KEY);
      localStorage.removeItem(this.TOKEN_CACHE_KEY); // Also clear token from storage
      // Clear other relevant cache keys if any
      // console.log('[Cache] User cache cleared.');
  }

  // Centralized method to clear all auth data on sign-out or error
  private clearAuthData(): void {
      // console.log('[clearAuthData] Clearing auth data...');
      this._user.next(null);
      this.userDataSubject.next(null); // Clear user data observable
      this.cachedToken = null;
      this.clearTokenRefreshTimer(); // Call implemented method
      this.clearUserCache(); // Call implemented method
      // Reset any other relevant state (e.g., loading flags if necessary)
      // console.log('[clearAuthData] Auth data cleared.');
  }

  // Define or ensure getDefaultPreferences exists
  private getDefaultPreferences(): UserPreferences {
    return {
        selectedReciter: 1,
        selectedTranslation: '131',
        bookmarks: [],
        lastState: {
            isMushafView: false,
            lastSurah: 1,
            lastVerse: 1,
            lastPage: 1,
            timestamp: new Date()
        },
        readingHistory: [],
        fontSize: 24,
        isDarkMode: false,
        arabicFont: 'uthmani',
        showWordByWord: true,
        isDoublePageView: false
    };
  }

  // Handles processing after a user is signed in (Firebase Auth level)
  private async handleUserSignedIn(firebaseUser: FirebaseUser): Promise<AppUser | null> {
    // console.log(`[handleUserSignedIn] Processing user: ${firebaseUser.uid}, Verified: ${firebaseUser.emailVerified}`);
    const startTime = Date.now();
    let appUser: AppUser | null = null;

    try {
      // Force refresh token to get latest claims
      const tokenResult = await firebaseUser.getIdTokenResult(true);
      // console.log(`[handleUserSignedIn] Fetched token & claims for ${firebaseUser.uid}`);

      // Map Firebase user + claims to AppUser
      appUser = this.mapFirebaseUser(firebaseUser, tokenResult);

      // console.log(`[handleUserSignedIn] Constructed AppUser. Time: ${Date.now() - startTime}ms`);

      // Update the main user BehaviorSubject FIRST to make user ID available
      this._user.next(appUser);

      // NOW Fetch preferences, bookmarks, history in parallel AFTER user subject is updated
      const initialUserData = await firstValueFrom(
        forkJoin({
          preferences: from(this.getUserPreferences()),
          bookmarks: from(this.getBookmarks()),
          history: from(this.getReadingHistoryInternal()).pipe(
            timeout(30000), // Increase timeout to 30 seconds
            catchError(err => {
              // console.warn('[handleUserSignedIn] Timeout or error fetching history, proceeding with empty history:', err);
              return of([]); // Return empty array on timeout or error
            })
          )
        }).pipe(
          // Main catchError for forkJoin (catches errors from prefs/bookmarks if they don't have their own pipe)
          catchError(dataError => {
            // console.error('[handleUserSignedIn] Error fetching initial user data (forkJoin level): ', dataError);
            // Return default/empty data for all fields if forkJoin itself fails
            return of({ preferences: null, bookmarks: [], history: [] });
          })
        )
      );

      // Assign fetched data or defaults to the existing appUser object
      // Ensure appUser is not null before assigning (though it should be set above)
      if (appUser) {
        appUser.preferences = initialUserData.preferences || this.getDefaultPreferences();
        appUser.bookmarks = initialUserData.bookmarks || [];
        appUser.history = initialUserData.history || [];

        // Emit the user AGAIN with the updated data (prefs/bookmarks/history)
        // This ensures components consuming user$ get the complete data eventually
        this._user.next(appUser);

        // Update the combined user data BehaviorSubject AFTER fetching
        this.userDataSubject.next({
          preferences: appUser.preferences,
          bookmarks: appUser.bookmarks,
          history: appUser.history
        });

        // Cache the token and user data (including the fetched prefs/history/bookmarks)
        this.cachedToken = { token: tokenResult.token, timestamp: Date.now() };
        localStorage.setItem(this.TOKEN_CACHE_KEY, JSON.stringify(this.cachedToken));
        await this.cacheUserData(appUser);
        // console.log(`[handleUserSignedIn] State updated and data cached.`);

        // Schedule next token refresh
        this.scheduleTokenRefresh();
      } else {
         // This case should ideally not happen if mapFirebaseUser worked
         // console.error('[handleUserSignedIn] appUser became null unexpectedly after initial construction.');
         this.clearAuthData(); // Clear data on error
         return null;
      }

      return appUser;

    } catch (error) {
      // console.error(`[handleUserSignedIn] Error processing signed-in user ${firebaseUser.uid}:`, error);
      this.clearAuthData(); // Clear data on error
      return null;
    }
  }

  // Setup the primary listener for Firebase Auth state changes
  private setupAuthStateListener(): void {
    onAuthStateChanged(this.auth, async (firebaseUser) => {
      this.ngZone.run(async () => { // Ensure operations run within Angular's zone
        // console.log('[onAuthStateChanged] Auth state changed. User:', firebaseUser ? firebaseUser.uid : 'null');
        if (firebaseUser) {
          // User is signed in
          this._isLoading.next(true); // Start loading
          await this.handleUserSignedIn(firebaseUser); // Process sign-in
          this._isLoading.next(false); // Stop loading
        } else {
          // User is signed out
          // console.log('[onAuthStateChanged] User signed out.');
          this.clearAuthData(); // Clear local state
          // Navigate to login only if not already on an auth page
          if (!this.router.url.includes('/auth')) {
              // console.log('[onAuthStateChanged] Redirecting to login due to sign out.');
              this.router.navigate(['/auth/login']);
          }
        }

        // Signal auth is ready AFTER the first check is complete (user signed in or out)
        this.signalAuthReady(); // Call helper to signal readiness
      });
    });
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
      // console.warn('getToken: No Firebase user found.');
      return null;
    }

    // Get token AND claims from Firebase SDK (force refresh if requested)
    let idTokenResult: IdTokenResult | null = null;
    try {
      // Get the full result to access claims, especially when forcing refresh
      idTokenResult = await firebaseUser.getIdTokenResult(forceRefresh);
    } catch (error) {
      // Handle specific errors like needing re-authentication if necessary
      return null;
    }
    
    const token = idTokenResult?.token; // Extract token after getting result
    
    if (!token) {
        // console.warn('getToken: Failed to obtain a valid token from Firebase SDK.');
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
    
    // Start the refresh timer if it hasn't been started yet
    if (!this.refreshTimerStarted) {
      this.startTokenRefreshTimer();
    }

    return token;
  }

  private async refreshAndGetToken(): Promise<string | null> {
    // console.warn('refreshAndGetToken called - this should ideally be handled by getToken(true)');
    return this.getToken(true); // Delegate to getToken with forceRefresh = true
  }

  async isAuthenticated(): Promise<boolean> {
    // console.log('🔒 Checking authentication...');
    await this.waitForAuthReady(); // Ensure listener has processed initial state
    const user = this._user.getValue();
    // console.log('🔒 Auth check result:', { isAuthenticated: !!user, user });
    return !!user;
  }

  async refreshSubscriptionStatus(): Promise<boolean> {
    // console.log('Starting subscription status refresh...');
    
    try {
        const user = this.auth.currentUser;
        if (!user) {
            // console.warn('No current user for subscription status refresh');
            return false;
        }

        // Check if we recently refreshed
        const lastRefreshTime = localStorage.getItem('subscription_refresh_timestamp');
        if (lastRefreshTime) {
            const timeSinceLastRefresh = Date.now() - parseInt(lastRefreshTime);
            if (timeSinceLastRefresh < 5 * 60 * 1000) { // Less than 5 minutes
                // console.log('Using cached subscription status');
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
                
                // console.log('Subscription status refreshed:', { isPremium, features });
            }

            return true;
        } catch (error) {
            // console.warn('Error checking subscription status:', error);
            
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
        // console.error('Error in refreshSubscriptionStatus:', error);
        return false;
    }
  }

  async getUserPreferences(): Promise<any> {
    try {
        const user = this.auth.currentUser;
        if (!user) {
            // console.warn('getUserPreferences: No current user found, returning default preferences');
            return this.getDefaultPreferences();
        }
        const userId = user.uid;

        // Check cache first
        // console.log(`[AuthService] getUserPreferences: Checking cache for user ${userId}...`);
        const cachedData = this.getCachedData(`${this.USER_CACHE_KEY}_${userId}`);
        if (cachedData && cachedData.preferences) {
          // console.log(`[AuthService] getUserPreferences: Cache hit for user ${userId}.`);
          this.preferencesSubject.next(cachedData.preferences);
          return cachedData.preferences;
        }

        // console.log(`[AuthService] getUserPreferences: Cache miss or stale for user ${userId}. Fetching from API...`);
        this.lastPreferencesRequest = Date.now();

        // Fetch from API if not cached or cache expired
        const token = await user.getIdToken();
        if (!token) {
            // console.error('getUserPreferences: Failed to get auth token');
            return this.getDefaultPreferences();
        }

        // Make API request
        const response = await firstValueFrom(
            this.http.get<any>(`${environment.apiUrl}/api/user/${userId}/preferences`).pipe(
                timeout(15000),
                retry({ count: 2, delay: 1500 }),
                catchError(error => {
                    // console.error(`[AuthService] getUserPreferences: Error fetching preferences for ${userId}:`, error);
                    return of(null); // Return null on error, handle below
                })
            )
        );

        const preferencesToCache = response?.preferences || this.getDefaultPreferences();

        // --- Update Cache ---
        // console.log(`[AuthService] getUserPreferences: Caching new data for ${userId}`);
        this.setCachedData(`${this.USER_CACHE_KEY}_${userId}`, { preferences: preferencesToCache });
        // --- End Update Cache ---

        this.preferencesSubject.next(preferencesToCache);
        return preferencesToCache;

    } catch (error) {
        // console.error('[AuthService] getUserPreferences: General error:', error);
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
                `${environment.apiUrl}/api/user/${user.uid}/preferences`,
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
        // console.error('Error saving preferences:', error);
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
        const response = await this.http.get<{isAdmin: boolean}>(`${environment.apiUrl}/api/user/${userId}/admin-status`).toPromise();
        return response?.isAdmin || false;
      } catch (error) {
        // Silently handle 404 errors for admin endpoint - this is expected in development
        const httpError = error as any;
        if (httpError?.status === 404) {
          // console.log('Admin status endpoint not available, defaulting to non-admin');
        } else {
          // console.warn('Could not check admin status');
        }
        // Default to non-admin if API endpoint doesn't exist
        return false;
      }
    } catch (error) {
      // console.log('Error in admin status check, defaulting to non-admin');
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
    return createUserWithEmailAndPassword(this.auth, email, password)
      .then(async (userCredential) => {
        // User created successfully
        const firebaseUser = userCredential.user;
        // console.log('[AuthService] User created successfully:', firebaseUser.uid);

        // Send verification email immediately after creation
        try {
          await sendEmailVerification(firebaseUser);
          // console.log('[AuthService] Verification email sent to:', firebaseUser.email);
        } catch (verificationError) {
          // console.error('[AuthService] Error sending verification email:', verificationError);
          // Decide how to handle this - maybe log it, but don't fail the signup
        }

        return userCredential; // Return the original credential
      })
      .catch(error => {
        // Handle creation errors
        // console.error('[AuthService] Error creating user:', error);
        throw error; // Re-throw the error to be handled by the caller
      });
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

      // console.log('Starting Google sign-in process...');
      
      try {
        // Try popup first
        // console.log('Attempting popup sign-in...');
        const result = await signInWithPopup(this.auth, provider);
        
        // Force token refresh and handle sign in
        await this.handleUserSignedIn(result.user);
        
        // Navigate inside NgZone
        this.ngZone.run(() => {
          const returnUrl = localStorage.getItem('returnUrl');
          if (returnUrl) {
            // console.log('Navigating to:', returnUrl);
            localStorage.removeItem('returnUrl');
            this.router.navigate([returnUrl]);
          }
        });
        
        return result;
      } catch (popupError: any) {
        // console.warn('Popup sign-in failed:', popupError);
        
        if (popupError.code === 'auth/popup-blocked' || 
            popupError.code === 'auth/popup-closed-by-user') {
          // console.log('Popup blocked or closed, trying redirect...');
          await signInWithRedirect(this.auth, provider);
          return {} as UserCredential; // Redirect will refresh the page
        }
        
        throw popupError;
      }
    } catch (error: any) {
      // console.error('Google sign-in error:', error);
      throw error;
    }
  }

  // Handle redirect result
  private async handleRedirectResult(): Promise<void> {
    try {
      // console.log("Checking for redirect result...");
      const result = await getRedirectResult(this.auth);
      if (result) {
        // console.log("Redirect result found:", result.user.uid);
        // Successfully authenticated via redirect.
        // We DON'T call handleUserSignedIn here anymore.
        // The onAuthStateChanged listener will fire shortly and handle it.
        // We might store the credential if needed for linking later, but not essential now.
        // const credential = GoogleAuthProvider.credentialFromResult(result); // or FacebookAuthProvider
      } else {
        // console.log("No redirect result found.");
      }
    } catch (error) {
      // console.error("Error getting redirect result:", error);
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
        // console.log('[FirebaseAuthService] Token refresh timer cleared.');
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
      // console.log('[FirebaseAuthService] Firebase sign-out successful.');

      // Clear any service-specific state if needed (e.g., in QuranService, etc.)
      // Example: this.quranService.clearUserState();

      // Force a full page reload to the login page to ensure clean state
      // Use window.location.assign for cleaner history than window.location.href
      this.ngZone.run(() => { // Keep ngZone just in case, though location assign might bypass it
        window.location.assign('/auth/login'); 
      });

    } catch (error) {
      // console.error('[FirebaseAuthService] Error during sign out:', error);
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
      // console.log('[FirebaseAuthService] signOut finished.');

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
      // console.error('Error sending password reset email:', error);
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
        // console.warn('Could not fetch user preferences from API');
      }
      
      // Try localStorage as fallback
      const localPrefs = localStorage.getItem(`user_preferences_${user.uid}`);
      if (localPrefs) {
        try {
          return JSON.parse(localPrefs);
        } catch (error) {
          // console.error('Error parsing localStorage preferences:', error);
        }
      }
      
      // Return default preferences if nothing is found
      return {
        selectedReciter: 1,
        selectedTranslation: 'en.sahih', 
        bookmarks: []
      };
    } catch (error) {
      // console.error('Error getting user settings:', error);
      return {};
    }
  }

  // Save reading history entry
  async saveReadingHistory(surah: number, verse: number): Promise<void> {
    try {
      // --- Add Guard Clause --- 
      if (!this.userDataSubject.getValue()) {
        // console.warn('[AuthService] Skipping history save: User data not yet loaded.');
        return; // Don't proceed if user data isn't ready
      }
      // --- End Guard Clause ---

      const historyEntry: ReadingHistoryEntry = {
        surah: surah,
        verse: verse,
        timestamp: new Date().toISOString() // Use ISO string for consistency
      };

      // Save locally first (simple)
      try {
        localStorage.setItem('last_quran_position', JSON.stringify(historyEntry));
      } catch (error) {
        // console.warn('Error saving history to localStorage:', error);
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
        // console.warn('No user logged in, reading history saved only locally');
        return;
      }

      await this.saveReadingHistoryToServer(user.uid, historyEntry);
    } catch (error) {
      // console.warn('Error saving reading history:', error);
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
        // console.warn('[AuthService] Skipping optimistic history update: originalData is null.');
        // NOTE: Server save will still be attempted below if token is available.
    } else {
        try {
            // Linter Fix 2: Ensure originalData.history is an array
            const originalHistory: ReadingHistoryEntry[] = originalData.history ?? [];
            const optimisticallyUpdatedHistory = this.addOrUpdateHistoryEntry(originalHistory, entry);
            this.userDataSubject.next({ ...originalData, history: optimisticallyUpdatedHistory });
            // console.log('[AuthService] userDataSubject emitted after optimistic update:', updatedUserData);
            // console.log('[AuthService] Optimistically updated history:', entry);
        } catch (optimisticError) {
            // console.error('[AuthService] Error during optimistic history update:', optimisticError);
            // If optimistic update fails, maybe don't proceed? For now, let server call attempt.
        }
    }
    // --- End Optimistic Update ---

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const token = await this.getToken(true); // Get fresh token for each attempt potentially needed
        if (!token) throw new Error('Authentication token unavailable for saving history.');

        // console.log(`[AuthService] Attempt ${attempt} to save history to server...`);
        await firstValueFrom(
          this.http.post<any>(
            `${environment.apiUrl}/api/user/${userId}/reading-history`, 
            entry, 
            { headers: { 'Authorization': `Bearer ${token}` } }
          )
        );

        // Server call successful, the optimistic update is now confirmed.
        // console.log('[AuthService] Reading history saved successfully on server.');
        return; // Exit loop on success

      } catch (error: any) {
        // console.error(`[AuthService] Error saving reading history (attempt ${attempt}):`, error);

        // --- Revert Optimistic Update on Failure ---
        if (!reverted) {
            // console.warn('[AuthService] Reverting optimistic history update due to server error.');
            this.userDataSubject.next(originalData); // Restore original state
            // console.log('[AuthService] userDataSubject emitted after REVERTING update:', JSON.stringify(this.userDataSubject.getValue())); 
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
             // console.error('[AuthService] Authentication error during history save, stopping retries.');
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
      // console.warn('Error getting last read position:', error);
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
      // console.error('Error checking AI access:', error);
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
        // console.warn('Invalid state provided to saveQuranReaderState:', state);
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
            `${environment.apiUrl}/api/user/${user.uid}/reading-history`, 
            updatedHistory
          ).toPromise();
        } catch (error) {
          // console.warn('Reading history API endpoint not available, using localStorage instead');
          // Save to localStorage as fallback
          const preferences = await this.getUserSettings();
          preferences.history = updatedHistory;
          localStorage.setItem(`user_preferences_${user.uid}`, JSON.stringify(preferences));
        }
      }
    } catch (error) {
      // console.error('Error saving Quran reader state:', error);
      throw error;
    }
  }

  // Check if user has premium status
  async isPremiumUser(): Promise<boolean> {
    await this.authReady.pipe(take(1)).toPromise(); // Wait for auth state to be ready
    const user = this._user.getValue();
    if (!user) {
      // console.log('[isPremiumUser] No user logged in.');
      return false;
    }

    // Prioritize the claim from the token if available and recent
    const token = await this.getToken();
    if (token) {
      try {
        // Decode the token locally (or ideally verify server-side if crucial)
        // For client-side check, simple check is okay
        const decoded: any = JSON.parse(atob(token.split('.')[1]));
        if (decoded.premium === true) {
           // console.log('[isPremiumUser] Determined premium status from token claim.');
          return true;
        }
      } catch (e) {
        // console.error('[isPremiumUser] Error decoding token for claims check:', e);
      }
    }

    // Fallback: Check the AppUser object's isPremium field (updated by handleUserSignedIn)
     // console.log(`[isPremiumUser] Falling back to AppUser object check. isPremium: ${user.isPremium}`);
    return user.isPremium;
  }

  // Method to send email verification to the current user
  async sendEmailVerification(): Promise<void> {
    const user = this.auth.currentUser;
    if (user) {
      try {
        await sendEmailVerification(user);
        // console.log('Verification email sent successfully.');
        // Optionally show a success message to the user
      } catch (error) {
        // console.error('Error sending verification email:', error);
        // Optionally show an error message to the user
        throw error; // Re-throw to allow component handling
      }
    } else {
      throw new Error('No user is currently signed in.');
    }
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
      // console.error('Error changing password:', error);
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
      // console.log(`[AuthService] Cache expired for key: ${key}`);
      localStorage.removeItem(key); // Remove expired cache item
      return null;
    } catch (error) {
      // console.warn(`[AuthService] Error reading cache for key ${key}:`, error);
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
      // console.warn(`[AuthService] Error writing cache for key ${key}:`, error);
    }
  }

  // User data management
  private async loadUserData(userId: string): Promise<void> {
    // console.log(`[AuthService] loadUserData called for ${userId}`);
    // --- Add Caching Logic ---
    const cacheKey = `user_data_${userId}`;
    const cachedUserData = this.getCachedData(cacheKey); // Uses helper with REQUEST_CACHE_DURATION
    if (cachedUserData) {
        // console.log(`[AuthService] loadUserData: Returning cached data for ${userId}`);
        this.userDataSubject.next(cachedUserData);
        this.preferencesSubject.next(cachedUserData.preferences || this.getDefaultPreferences()); // Update prefs too
        return; // Exit if cache is valid
    }
    // --- End Caching Logic ---

    // console.log(`[AuthService] loadUserData: Cache miss or stale for ${userId}. Fetching from API...`);

    try {
        // Fetch combined user data from the backend profile endpoint
        // Interceptor handles token
        const userData = await firstValueFrom(this.http.get<any>(`${environment.apiUrl}/api/user/${userId}/profile`).pipe(
            timeout(20000),
            retry({ count: 2, delay: 1500 }),
            catchError(error => {
                // console.error(`[AuthService] loadUserData: Error fetching profile for ${userId}:`, error);
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
          // console.log(`[AuthService] loadUserData: Successfully fetched data for ${userId}.`);

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
        // console.error(`[AuthService] loadUserData: General error fetching profile for ${userId}:`, error);
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
      `${environment.apiUrl}/api/user/${user.uid}/profile`,
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
          // console.warn('getReadingHistory: User not authenticated');
          // Return an object matching the expected structure on error
          return of({ success: false, message: 'User not authenticated', history: [] });
        }

        const userId = user.id;
        const cacheKey = `reading_history_${userId}`;
        const cachedHistory = this.getCachedData(cacheKey);

        if (cachedHistory) {
          // Return cached data in the expected structure
          return of({ success: true, history: cachedHistory });
        }

        if (this.shouldThrottle(`history_${userId}`)) {
          // Return empty history matching the structure if throttled
           return of({ success: true, history: this.userDataSubject.getValue()?.history || [] }); // Return current state if throttled
        }

        this.updateLastRequestTime(`history_${userId}`);

        return from(this.getToken(true)).pipe( // Use getToken which handles refresh
          switchMap(token => {
            if (!token) {
              // console.warn('getReadingHistory: Failed to get fresh token');
              // Return error object matching the structure
              return of({ success: false, message: 'Authentication token unavailable', history: [] });
            }

            // *** REMOVED TEMP DEBUG BLOCK ***

            // Corrected URL to match server route
            return this.http.get<ReadingHistoryResponse>(
              `${environment.apiUrl}/api/user/${userId}/reading-history`, // Corrected path
              {
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              }
            ).pipe(
              tap(response => {
                // Ensure response structure is checked before accessing properties
                if (response && response.success && Array.isArray(response.history)) {
                  this.setCachedData(cacheKey, response.history);
                  // Also update the main user data subject if needed
                  const currentData = this.userDataSubject.getValue();
                  if (currentData) {
                      this.userDataSubject.next({ ...currentData, history: response.history });
                  }
                } else {
                  // console.warn(`getReadingHistory: API call did not return successful history for ${userId}`, response);
                }
              }),
              catchError(error => {
                // console.error(`getReadingHistory: HTTP Error for ${userId}:`, error);
                // Return error object matching the structure
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
             // console.error(`getReadingHistory: Error getting token for ${userId}:`, tokenError);
             // Return error object matching the structure
             return throwError(() => ({
               success: false,
               message: 'Failed to obtain authentication token',
               history: []
             }));
          })
        );
      }),
      catchError(outerError => {
         // console.error('getReadingHistory: Error in outer user$ pipe:', outerError);
         // Return error object matching the structure
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
      `${environment.apiUrl}/api/user/${user.uid}/reading-history`,
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
      `${environment.apiUrl}/api/user/${user.uid}/reading-history`,
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
          `${environment.apiUrl}/api/user/${user.uid}/bookmarks/${bookmark}`,
          { headers }
        ).pipe(
          tap(response => {
            if (response.success) {
              // Update state ONLY on success
              const current = this.userDataSubject.getValue();
              this.userDataSubject.next({ ...current, bookmarks: response.bookmarks });
            } else {
              // Handle potential server-side failure message
              // console.warn('Server failed to remove bookmark:', response.message);
              // Optionally show snackbar or notification to user
            }
          }),
          catchError(error => {
            // No need to revert local state as it wasn't changed optimistically
            // console.error('Error removing bookmark:', error);
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
          `${environment.apiUrl}/api/user/${user.uid}/bookmarks`,
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
              // console.warn('Server failed to add bookmark:', response.message);
              // Optionally show snackbar or notification to user
            }
          }),
          catchError(error => {
            // No need to revert local state as it wasn't changed optimistically
            // console.error('Error adding bookmark:', error);
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
          // console.warn('getBookmarks: No authenticated AppUser with ID and token found in BehaviorSubject.');
          return throwError(() => new Error('User not fully authenticated for getBookmarks')); 
        }

        const userId = appUser.id;
        const token = appUser.token;

        return this.http.get<string[]>(
          `${environment.apiUrl}/api/user/${userId}/bookmarks`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        ).pipe(
          map(bookmarks => Array.isArray(bookmarks) ? bookmarks : []),
          catchError(error => {
            // console.error(`Error loading bookmarks for user ${userId}:`, error);
            return throwError(() => error); 
          })
        );
      }),
      catchError(error => {
        // console.error('Error in getBookmarks observable chain:', error);
        return of([]);
      })
    );
  }

  async refreshAuth(): Promise<void> {
    try {
      const currentUser = this.auth.currentUser;
      
      if (!currentUser) {
        // console.warn('❌ No current user found during token refresh');
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
    // Wait for the authReady ReplaySubject to emit true
    await firstValueFrom(this.authReady$);
    // console.log('[waitForAuthReady] Auth is ready.'); // Log confirmation
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
      // No need to emit here, handled elsewhere
    } catch (error) {
      // console.error('[AuthService] Error caching user data:', error);
    }
  }

  // --- Modify this method ---
  async reloadCurrentUser(): Promise<AppUser | null> { // Return AppUser or null
    const firebaseUser = getAuth(this.firebaseApp).currentUser;
    if (firebaseUser) {
      try {
        // console.log(`[FirebaseAuthService] Reloading user state for ${firebaseUser.uid}...`);
        await firebaseUser.reload();
        const refreshedFirebaseUser = getAuth(this.firebaseApp).currentUser; // Get the reloaded user
        if (refreshedFirebaseUser) {
          // console.log(`[FirebaseAuthService] User state reloaded. emailVerified: ${refreshedFirebaseUser.emailVerified}. Updating internal state...`);
          // Re-process the user state to update the BehaviorSubject and potentially claims
          // Assuming handleUserSignedIn fetches/processes claims and returns the full AppUser
          const processedUser = await this.handleUserSignedIn(refreshedFirebaseUser); 
          return processedUser; // Return the updated AppUser
        } else {
           // console.warn('[FirebaseAuthService] User became null immediately after reload.');
           this._user.next(null);
           return null;
        }
      } catch (error) {
        // console.error('[FirebaseAuthService] Error reloading user state:', error);
        // On error, return the *current* known state without updating BehaviorSubject again
        // This prevents potentially emitting null incorrectly if reload fails temporarily
        return this._user.getValue(); 
      }
    } else {
      // console.log('[FirebaseAuthService] reloadCurrentUser called but no user is logged in.');
      return null;
    }
  }
  // --- End modified method ---

  private startTokenRefreshTimer(): void {
    this.clearTokenRefreshTimer(); // Clear any existing timer first

    // Refresh slightly before the 1-hour expiry (e.g., 55 minutes)
    const refreshInterval = this.TOKEN_CACHE_DURATION; // Use defined duration
    this.tokenRefreshTimer = setTimeout(async () => {
      // console.log('[Timer] Token refresh timer triggered. Forcing refresh...');
      try {
        await this.getToken(true); // Force refresh
        // console.log('[Timer] Token refreshed successfully.');
        this.startTokenRefreshTimer(); // Restart the timer for the next interval
      } catch (error) {
        // console.error('[Timer] Failed to refresh token automatically:', error);
        // Optionally, schedule a retry with backoff, or rely on next API call to trigger refresh
      }
    }, refreshInterval);
    this.refreshTimerStarted = true; // Mark timer as started
    // console.log(`[Timer] Token refresh timer started. Interval: ${refreshInterval / 60000} minutes.`);
  }

  // Method to schedule the next token refresh
  private scheduleTokenRefresh(): void {
    // console.log('[scheduleTokenRefresh] Attempting to schedule token refresh...');
    this.clearTokenRefreshTimer(); // Clear any existing timer first

    const user = this._user.getValue();
    if (!user || !this.cachedToken) {
      // console.log('[scheduleTokenRefresh] No user or cached token found. Cannot schedule refresh.');
      return;
    }

    const decodedToken = this.decodeToken(this.cachedToken.token);
    if (!decodedToken || typeof decodedToken.exp !== 'number') {
        // console.error('[scheduleTokenRefresh] Could not decode token or find expiry time. Cannot schedule refresh.');
        return;
    }

    const expirationTime = decodedToken.exp * 1000; // Convert seconds to milliseconds
    const currentTime = Date.now();
    const timeUntilExpiry = expirationTime - currentTime;

    // Calculate refresh time: expiry time - margin (or slightly before expiry)
    let refreshDelay = timeUntilExpiry - this.TOKEN_REFRESH_MARGIN;

    // Ensure refreshDelay is positive and reasonable
    if (refreshDelay <= 0) {
        // console.warn(`[scheduleTokenRefresh] Token already expired or too close to expiry (delay: ${refreshDelay}ms). Attempting immediate refresh.`);
        // Optionally trigger an immediate refresh attempt here, but be cautious of loops
        // For now, just log and don't schedule.
        // Or schedule for a minimal delay like 1 second if immediate refresh is desired
        // this.refreshToken(true); // Example of immediate refresh
        refreshDelay = 5000; // Schedule a refresh soon if needed
        // return; // Or simply don't schedule if already expired
    }

    // console.log(`[scheduleTokenRefresh] Scheduling token refresh in ${Math.round(refreshDelay / 1000)} seconds.`);

    console.log(`[scheduleTokenRefresh] Scheduling token refresh in ${Math.round(refreshDelay / 1000)} seconds.`);

    this.tokenRefreshTimer = setTimeout(async () => {
        console.log('[Timer] Token refresh timer triggered.');
        try {
            await this.refreshToken(true); // Force refresh
        } catch (error) {
            console.error('[Timer] Error during scheduled token refresh:', error);
            // Handle error appropriately, maybe retry or sign out
            // Depending on the error, might need to clear auth state
            // if (error indicates invalid grant or user deleted) this.signOut();
        }
    }, refreshDelay);
  }

  // Decodes a JWT token (basic, without validation for simplicity here)
  private decodeToken(token: string): any | null {
    try {
      const base64Url = token.split('.')[1];
      if (!base64Url) return null;
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.error('[decodeToken] Error decoding token:', e);
      return null;
    }
  }

  // Fetches reading history internally, bypassing the main observable if needed
  // This might be useful during initial load or specific updates
  private async getReadingHistoryInternal(): Promise<ReadingHistoryEntry[]> {
    try {
      const user = this.getCurrentUser();
      if (!user) {
        // console.log('[getReadingHistoryInternal] No current user, returning empty history');
        return [];
      }

      // console.log(`[getReadingHistoryInternal] Fetching history internally for user: ${user.uid}`);
      // console.log(`[getReadingHistoryInternal] >>> MAKING REQUEST TO: /api/user/${user.uid}/reading-history`);

      // Create AbortController for the request
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('[getReadingHistoryInternal] Request timeout reached, aborting...');
        abortController.abort();
      }, 10000); // 10 second timeout

      try {
        const response = await this.apiService.makeRequest('get', `/api/user/${user.uid}/reading-history`, undefined, {
          signal: abortController.signal
        });

        // Clear timeout since request completed
        clearTimeout(timeoutId);

        // console.log(`[getReadingHistoryInternal] <<< RETURNED FROM apiService.makeRequest`);
        
        if (response && response.success && Array.isArray(response.history)) {
          // console.log(`[getReadingHistoryInternal] Fetched ${response.history.length} history entries.`);
          return response.history;
        } else {
          // console.warn('[getReadingHistoryInternal] Invalid response format:', response);
          return [];
        }
      } catch (error: any) {
        // Clear timeout on error
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
          console.error('[getReadingHistoryInternal] Request aborted due to timeout');
          return [];
        }

        throw error; // Re-throw other errors
      }
    } catch (error: any) {
      console.error('[getReadingHistoryInternal] Error fetching history:', error);
      return [];
    }
  }

  // Refreshes the Firebase ID token
  public async refreshToken(forceRefresh: boolean = false): Promise<string | null> {
    console.log(`[refreshToken] Called. Force refresh: ${forceRefresh}`);
    const firebase = await this.authPromise; // Ensure Firebase Auth is initialized
    const currentUser = firebase.currentUser;

    if (!currentUser) {
        console.warn('[refreshToken] No current Firebase user. Cannot refresh token.');
        this.clearAuthData(); // Ensure clean state if user disappears unexpectedly
        return null;
    }

    try {
        console.log(`[refreshToken] Getting ID token for user: ${currentUser.uid}`);
        const token = await currentUser.getIdToken(forceRefresh);
        console.log(`[refreshToken] Successfully obtained new token for ${currentUser.uid}.`);

        // Update cache
        this.cachedToken = { token: token, timestamp: Date.now() };
        localStorage.setItem(this.TOKEN_CACHE_KEY, JSON.stringify(this.cachedToken));

        // Reschedule next refresh
        this.scheduleTokenRefresh();

        return token;
    } catch (error) {
        console.error(`[refreshToken] Error refreshing ID token for user ${currentUser.uid}:`, error);
        // Handle specific errors, e.g., user deleted, disabled, token expired/revoked
        if (error instanceof Error && (
            error.message.includes('auth/user-token-expired') ||
            error.message.includes('auth/user-disabled') ||
            error.message.includes('auth/user-not-found') ||
            error.message.includes('auth/invalid-user-token')
        )) {
            console.warn('[refreshToken] User session seems invalid. Signing out.');
            await this.signOut(); // Force sign out on critical token errors
        } else {
            // For other errors, maybe retry later or just log
            console.error('[refreshToken] Unhandled error during token refresh.');
            // Consider if clearing auth data is appropriate here too
            // this.clearAuthData();
        }
        return null;
    }
  }

  // --- Initialization ---
  private async initializeAuth(): Promise<Auth> {
    if (this.isAuthInitialized) {
        // console.log('[initializeAuth] Auth already initialized.');
        // Return the existing promise which resolves to the Auth instance
        return getAuth(initializeApp(environment.firebase)); 
    }
    // console.log('[initializeAuth] Initializing Firebase Auth...');
    try {
        // Initialize Firebase App (idempotent)
        const app = initializeApp(environment.firebase);
        // Get Auth instance
        const auth = getAuth(app);
        this.isAuthInitialized = true;
        // console.log('[initializeAuth] Firebase Auth initialized successfully.');
        return auth; // Resolve the promise with the Auth instance
    } catch (error) {
        // console.error('[initializeAuth] Error initializing Firebase:', error);
        // Mark as initialized even on error to prevent retries
        this.isAuthInitialized = true; 
        // Reject the promise
        throw new Error('Firebase initialization failed'); 
    }
  }
} 