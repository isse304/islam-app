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
  private lastEmailVerifiedState: boolean | null = null;
  private refreshTriggeredForVerification = false;

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

  // Subject to signal when auth is ready AND redirect result is processed
  private postRedirectAuthSettled = new ReplaySubject<void>(1);

  // Flag to ensure signalAuthReady logic runs only once
  private hasSignaledAuthReady = false;

  private tokenRefreshTimer: any = null;

  // Flag to track if getRedirectResult has been processed
  private redirectResultProcessed = false;

  private readonly API_RETRY_ATTEMPTS = 2;
  private readonly API_TIMEOUT = 15000; // 15 seconds
  private readonly TOKEN_REFRESH_MARGIN = 5 * 60 * 1000; // 5 minutes in milliseconds

  private isAuthInitialized = false; // Add flag to prevent multiple initializations

  private _apiService: ApiService | null = null; // Add property to hold the instance

  // Add authPromise initialization back to the constructor
  private authPromise: Promise<Auth> | null = null;

  constructor(
    private router: Router,
    private http: HttpClient,
    private ngZone: NgZone,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private injector: Injector // Inject Injector
  ) {
    // //console.log('[AuthService] Constructor called'); // Log: Constructor start
    // Start initialization immediately
    // Ensure initializeAuth is called to set up the promise if needed elsewhere
    this.authPromise = this.initializeAuth(); 
    this.initializeAuthAndStateListener();
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

    // Get status from claims, default to 'inactive' if not present
    const subStatusClaim = claims['subscriptionStatus'];
    const subscriptionStatus = typeof subStatusClaim === 'string' ? subStatusClaim : 'inactive';

    // Determine premium status based on claims (including 'trialing')
    const isPremium = claims['premium'] === true || 
                      subscriptionStatus === 'active' || 
                      subscriptionStatus === 'trialing';

    const subEndClaim = claims['subscriptionEnd'];
    const subscriptionEnd = typeof subEndClaim === 'number' ? subEndClaim : null;

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
      isPremium: isPremium, // Use the updated calculation
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
        // //console.log('[FirebaseAuthService] Signaling authReady (true).'); // Log: signalAuthReady called
        this.hasSignaledAuthReady = true; // Set flag immediately
        this.authReady.next(true); // Emit true
    } else {
        // //console.log('[FirebaseAuthService] AuthReady already signaled.');
    }
  }

  // Clears the token refresh timer
  private clearTokenRefreshTimer(): void {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
      // // ////console.log('[Timer] Token refresh timer cleared.');
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
      // // ////console.log('[Cache] User cache cleared.');
  }

  // Centralized method to clear all auth data on sign-out or error
  private clearAuthData(): void {
      // // ////console.log('[clearAuthData] Clearing auth data...');
      this._user.next(null);
      this.userDataSubject.next(null); // Clear user data observable
      this.cachedToken = null;
      this.clearTokenRefreshTimer(); // Call implemented method
      this.clearUserCache(); // Call implemented method
      // Reset email verification tracking state
      this.lastEmailVerifiedState = null;
      this.refreshTriggeredForVerification = false;
      // Reset any other relevant state (e.g., loading flags if necessary)
      // // ////console.log('[clearAuthData] Auth data cleared.');
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
  // *** MODIFIED: Emits partial user first, then fetches data ***
  private async handleUserSignedIn(firebaseUser: FirebaseUser): Promise<AppUser | null> {
    // //console.log(`[handleUserSignedIn] START processing user: ${firebaseUser.uid}`);
    const startTime = Date.now();

    try {
      // 1. Get token & map basic user data
      // //console.log(`[handleUserSignedIn] Getting token/claims for ${firebaseUser.uid}...`);
      const tokenResult = await firebaseUser.getIdTokenResult(true);
      // //console.log(`[handleUserSignedIn] Fetched token & claims.`);
      let partialAppUser = this.mapFirebaseUser(firebaseUser, tokenResult); 
      // //console.log(`[handleUserSignedIn] Mapped partial AppUser.`);

      // Initialize lastEmailVerifiedState
      if (this.lastEmailVerifiedState === null) {
          this.lastEmailVerifiedState = partialAppUser.emailVerified;
      }
      
      // 2. Cache token immediately
      this.cachedToken = { token: tokenResult.token, timestamp: Date.now() };
      localStorage.setItem(this.TOKEN_CACHE_KEY, JSON.stringify(this.cachedToken));
      
      // 3. Emit PARTIAL user state immediately (important!)
      // Ensure essential fields are present before emitting
      const userToEmitInitially: AppUser = { 
          ...partialAppUser, 
          preferences: this.getDefaultPreferences(), // Emit default prefs initially
          bookmarks: [], // Emit empty arrays initially
          history: [] 
      };
      this.ngZone.run(() => { // Ensure emission is in Angular zone
          this._user.next(userToEmitInitially);
          // //console.log(`[handleUserSignedIn] Emitted PARTIAL user state for ${firebaseUser.uid}`);
      });

      // 4. Schedule token refresh (can happen after partial emit)
      this.scheduleTokenRefresh();

      // 5. Fetch preferences, bookmarks, history concurrently
      // //console.log(`[handleUserSignedIn] Fetching profile data (prefs, bookmarks, history)...`);
      const profileData = await firstValueFrom(
        forkJoin({
          // Use methods that now rely on the emitted _user state 
          preferences: from(this.getUserPreferences()), 
          bookmarks: from(this.getBookmarks()),
          history: from(this.getReadingHistoryInternal()) // Ensure this also uses _user if needed
        }).pipe(
          timeout(30000), // Add timeout for the whole join
          catchError(dataError => {
            //console.error('[handleUserSignedIn] Error fetching profile data (forkJoin level): ', dataError);
            // Return default structure on error
            return of({ 
                preferences: this.getDefaultPreferences(), // Default prefs
                bookmarks: [], 
                history: [] 
            }); 
          })
        )
      );
      // //console.log(`[handleUserSignedIn] Profile data fetched.`);

      // 6. Get the LATEST user state (in case it changed during async fetch)
      const latestPartialUser = this._user.getValue();
      if (!latestPartialUser || latestPartialUser.id !== firebaseUser.uid) {
          //console.warn(`[handleUserSignedIn] User state changed unexpectedly during profile data fetch for ${firebaseUser.uid}. Aborting full update.`);
          return latestPartialUser; // Return the current (possibly null or different) user state
      }
      
      // 7. Merge fetched data with the latest partial user state
      const finalAppUser: AppUser = {
          ...latestPartialUser, // Base is the latest state from _user
          preferences: profileData.preferences || latestPartialUser.preferences || this.getDefaultPreferences(),
          bookmarks: profileData.bookmarks || latestPartialUser.bookmarks || [],
          history: profileData.history || latestPartialUser.history || []
          // Ensure other claims/fields from latestPartialUser are preserved
      };

      // 8. Cache the FINAL user data
      await this.cacheUserData(finalAppUser);

      // 9. Emit the FINAL, complete user state
      this.ngZone.run(() => { // Ensure emission is in Angular zone
          this._user.next(finalAppUser);
          // //console.log(`[handleUserSignedIn] Emitted FINAL user state for ${firebaseUser.uid}`);
      });
      
      // Update combined subject as well
      this.userDataSubject.next({
          preferences: finalAppUser.preferences,
          bookmarks: finalAppUser.bookmarks,
          history: finalAppUser.history
      });

      // //console.log(`[handleUserSignedIn] END processing user: ${firebaseUser.uid}. Total Time: ${Date.now() - startTime}ms`);
      return finalAppUser; // Return the final state

    } catch (error) {
      //console.error(`[handleUserSignedIn] ERROR processing signed-in user ${firebaseUser.uid}:`, error);
      // Ensure user state is cleared on error
      this.ngZone.run(() => { this.clearAuthData(); });
      return null; 
    }
  }

  // Setup the primary listener for Firebase Auth state changes
  // *** MODIFIED: Awaits handleUserSignedIn, then updates _user, then signals settled ***
  private setupAuthStateListener(redirectAlreadyProcessed: boolean): void {
    // //console.log('[AuthService] Setting up onAuthStateChanged listener...'); // Log: setupAuthStateListener start
    let initialAuthStateReceived = false;
    onAuthStateChanged(this.auth, async (firebaseUser) => {
      // //console.log(`[AuthService] onAuthStateChanged triggered. User: ${firebaseUser ? firebaseUser.uid : 'null'}`); // Log: onAuthStateChanged trigger
      const isFirstCallback = !initialAuthStateReceived;
      initialAuthStateReceived = true;

      // Define finalAppUser variable to hold the result
      let finalAppUser: AppUser | null = null; 

      try {
        if (firebaseUser) {
          // Await the result of processing the user
          finalAppUser = await this.handleUserSignedIn(firebaseUser);
        } else {
          // If firebaseUser is null, ensure we handle sign-out
          // //console.log('[AuthService] onAuthStateChanged: User is null, handling sign out...');
          this.handleUserSignedOut(); // This clears data and sets _user to null internally
          finalAppUser = null; // Explicitly set to null
        }
      } catch (error) {
         //console.error('[AuthService] onAuthStateChanged: Unexpected error during processing:', error); // Log: onAuthStateChanged error
         this.clearAuthData(); // Ensure cleanup on unexpected error
         finalAppUser = null;
      } finally {
         // Run UI updates and signaling within Angular zone
         this.ngZone.run(() => {
            // //console.log('[AuthService] onAuthStateChanged: Updating _user subject in NgZone...');
            // Update the main _user subject AFTER all processing
            if (finalAppUser) {
              this._user.next(finalAppUser);
              // //console.log('[AuthService] onAuthStateChanged: _user subject updated with user.');
            } else if (!firebaseUser) { 
              // Ensure _user is null if firebaseUser was null and no error occurred
              // handleUserSignedOut should have already done this, but double-check
              if (this._user.value !== null) { 
                 this._user.next(null); 
                 // //console.log('[AuthService] onAuthStateChanged: _user subject set to null (explicitly).');
              }
            } else {
                //console.log('[AuthService] onAuthStateChanged: finalAppUser is null (likely due to error), _user subject not updated again.');
            }

            // Signal initial auth state is ready after first callback completes
            if (isFirstCallback) {
              //console.log('[AuthService] First onAuthStateChanged callback finished. Signaling authReady.'); // Log: signalAuthReady call point
              this.signalAuthReady(); // Use the original signal for basic readiness
            }
            
            // Try to signal that post-redirect auth is settled AFTER _user is updated
            //console.log('[AuthService] onAuthStateChanged: Attempting to signal post-redirect settled...');
            this.trySignalPostRedirectAuthSettled();
         });
      }
    }, (error) => {
      //console.log('[AuthService] onAuthStateChanged reported an error callback.'); // Log: onAuthStateChanged error callback
      //console.error('[AuthService] Auth state listener error:', error);
      // Run UI updates and signaling within Angular zone for error case
      this.ngZone.run(() => {
         this.clearAuthData(); // Clears _user and other data
         // Signal readiness even on error, but also try to signal settled state
         if (!initialAuthStateReceived) {
            this.signalAuthReady();
         }
         this.trySignalPostRedirectAuthSettled();
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
      // ////console.warn('getToken: No Firebase user found.');
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
        // ////console.warn('getToken: Failed to obtain a valid token from Firebase SDK.');
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
    // ////console.warn('refreshAndGetToken called - this should ideally be handled by getToken(true)');
    return this.getToken(true); // Delegate to getToken with forceRefresh = true
  }

  async isAuthenticated(): Promise<boolean> {
    // // ////console.log('🔒 Checking authentication...');
    await this.waitForAuthReady(); // Ensure listener has processed initial state
    const user = this._user.getValue();
    // // ////console.log('🔒 Auth check result:', { isAuthenticated: !!user, user });
    return !!user;
  }

  async refreshSubscriptionStatus(): Promise<boolean> {
    // // ////console.log('Starting subscription status refresh...');
    
    try {
        const user = this.auth.currentUser;
        if (!user) {
            // ////console.warn('No current user for subscription status refresh');
            return false;
        }

        // Check if we recently refreshed
        const lastRefreshTime = localStorage.getItem('subscription_refresh_timestamp');
        if (lastRefreshTime) {
            const timeSinceLastRefresh = Date.now() - parseInt(lastRefreshTime);
            if (timeSinceLastRefresh < 5 * 60 * 1000) { // Less than 5 minutes
                // // ////console.log('Using cached subscription status');
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
                
                // // ////console.log('Subscription status refreshed:', { isPremium, features });
            }

            return true;
        } catch (error) {
            // ////console.warn('Error checking subscription status:', error);
            
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
        // ////console.error('Error in refreshSubscriptionStatus:', error);
        return false;
    }
  }

  async getUserPreferences(): Promise<any> {
    try {
        const user = this.auth.currentUser;
        if (!user) {
            return this.getDefaultPreferences();
        }
        const userId = user.uid;

        const cachedData = this.getCachedData(`${this.USER_CACHE_KEY}_${userId}`);
        if (cachedData && cachedData.preferences) {
          this.preferencesSubject.next(cachedData.preferences);
          return cachedData.preferences;
        }

        this.lastPreferencesRequest = Date.now();

        // Make API request - Interceptor adds token
        const response = await firstValueFrom(
            this.http.get<any>(`${environment.apiUrl}/api/user/${userId}/preferences`).pipe(
                timeout(15000),
                retry({ count: 2, delay: 1500 }),
                catchError(error => {
                    //console.error(`[AuthService] getUserPreferences: Error fetching preferences for ${userId}:`, error);
                    return of(null); // Return null on error, handle below
                })
            )
        );

        const preferencesToCache = response?.preferences || this.getDefaultPreferences();
        this.setCachedData(`${this.USER_CACHE_KEY}_${userId}`, { preferences: preferencesToCache });
        this.preferencesSubject.next(preferencesToCache);
        return preferencesToCache;

    } catch (error) {
        //console.error('[AuthService] getUserPreferences: General error:', error);
        const defaults = this.getDefaultPreferences();
        this.preferencesSubject.next(defaults);
        return defaults;
    }
  }

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
        // Merge all queued preferences with deep merge for lastState
        const mergedPreferences = this.savePreferencesQueue.reduce((acc, curr) => {
            const newPrefs = { ...acc }; // Start with shallow copy of accumulator
            Object.keys(curr).forEach(key => {
                if (key === 'lastState' && typeof acc.lastState === 'object' && typeof curr.lastState === 'object') {
                    // Deep merge for lastState
                    newPrefs.lastState = { ...acc.lastState, ...curr.lastState };
                } else {
                    // Shallow merge for other keys
                    newPrefs[key] = curr[key];
                }
            });
            return newPrefs;
        }, {});

        // Clear queue
        this.savePreferencesQueue = [];

        const user = this.auth.currentUser;
        if (!user) throw new Error('No user logged in');
        const userId = user.uid;
        
        // Send preferences directly in the body - Interceptor adds token
        const response = await firstValueFrom(
            this.http.put<any>(
                `${environment.apiUrl}/api/user/${userId}/preferences`,
                mergedPreferences
            )
        );

        // Update cache with server response
        if (response?.success && response?.preferences) {
            this.preferencesCache = {
                data: response.preferences,
                timestamp: Date.now()
            };
            const cacheKey = `${this.USER_CACHE_KEY}_${userId}`;
            localStorage.removeItem(cacheKey);
        }

        this.isSaving = false;
        return this.preferencesCache?.data || this.getDefaultPreferences(); // Return cached or default
    } catch (error) {
        //console.error('Error saving preferences:', error);
        this.isSaving = false;
        // Re-throw or handle as needed, but interceptor handles auth errors
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
          // // ////console.log('Admin status endpoint not available, defaulting to non-admin');
        } else {
          // ////console.warn('Could not check admin status');
        }
        // Default to non-admin if API endpoint doesn't exist
        return false;
      }
    } catch (error) {
      // // ////console.log('Error in admin status check, defaulting to non-admin');
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
        // // ////console.log('[AuthService] User created successfully:', firebaseUser.uid);

        // Send verification email immediately after creation
        try {
          await sendEmailVerification(firebaseUser);
          // // ////console.log('[AuthService] Verification email sent to:', firebaseUser.email);
        } catch (verificationError) {
          // ////console.error('[AuthService] Error sending verification email:', verificationError);
          // Decide how to handle this - maybe log it, but don't fail the signup
        }

        return userCredential; // Return the original credential
      })
      .catch(error => {
        // Handle creation errors
        // ////console.error('[AuthService] Error creating user:', error);
        throw error; // Re-throw the error to be handled by the caller
      });
  }

  // Sign in with Google
  async signInWithGoogle(): Promise<UserCredential> {
    const provider = new GoogleAuthProvider();
    // ////console.log('[AuthService] Attempting signInWithPopup with Google provider.'); // Log explicit popup attempt
    try {
      const credential = await signInWithPopup(this.auth, provider);
      // ////console.log('[AuthService] signInWithPopup successful.'); // Log success
      // No need to call handleUserSignedIn here, onAuthStateChanged will handle it.
      return credential;
    } catch (error: any) { // Add type annotation to error
      ////console.error('[AuthService] signInWithPopup error:', error);
      // Handle specific errors if needed
      if (error.code === 'auth/popup-closed-by-user') {
        // Handle popup closed specifically, maybe just log or return null/reject differently
        // ////console.log('[AuthService] Google Sign-In popup closed by user.');
      } else if (error.code === 'auth/cancelled-popup-request') {
        // ////console.log('[AuthService] Google Sign-In popup request cancelled (multiple popups?).');
      }
      throw error; // Re-throw the error for the component to catch
    }
  }

  // Handle redirect result
  private async handleRedirectResult(): Promise<void> {
    // ////console.log('[AuthService] handleRedirectResult: Checking for redirect result...'); // Log entry
    this._isLoading.next(true);
    try {
      const credential = await getRedirectResult(this.auth);
      // ////console.log('[AuthService] handleRedirectResult: getRedirectResult returned:', credential); // Log result
      if (credential) {
        // ////console.log('[AuthService] handleRedirectResult: Redirect credential found. Processing...'); // Log processing
        const user = await this.handleUserSignedIn(credential.user);
        if (user) {
          // Navigate only if a user was successfully processed from redirect
          // ////console.log(`[AuthService] handleRedirectResult: Navigating to ${this.redirectUrl || '/home'} after redirect sign-in.`); // Log navigation
          this.ngZone.run(() => {
             this.router.navigateByUrl(this.redirectUrl || '/home').catch(err => {
               ////console.error('[AuthService] handleRedirectResult: Navigation failed after redirect:', err);
               this.router.navigate(['/home']); // Fallback
             });
          });
        } else {
            ////console.warn('[AuthService] handleRedirectResult: Redirect credential processed, but handleUserSignedIn resulted in null user.');
        }
      } else {
        // ////console.log('[AuthService] handleRedirectResult: No redirect credential found.'); // Log no result
      }
    } catch (error: any) {
      ////console.error('[AuthService] handleRedirectResult: Error processing redirect result:', error); // Log error
      // Avoid navigating on error, let the normal auth state handle it
    } finally {
      this._isLoading.next(false);
    }
  }

  // Sign out
  async signOut(): Promise<void> {
    this._isLoading.next(true);
    try {
      // Cancel any ongoing operations
      if (this.tokenRefreshTimer) {
        clearTimeout(this.tokenRefreshTimer);
        this.tokenRefreshTimer = null;
      }

      // Clear local state immediately
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
      this.userDataSubject.next({ bookmarks: [], history: [], preferences: null });

      // Sign out from Firebase Auth
      await signOut(this.auth);
      // ////console.log('[FirebaseAuthService] Firebase sign-out successful.');

      // *** Use Angular Router for navigation ***
      this.ngZone.run(() => {
        // REMOVED: window.location.assign('/auth/login'); 
        this.router.navigate(['/']); // Navigate to root -> NoAuthGuard handles landing
      });

    } catch (error) {
      // //console.error('[FirebaseAuthService] Error during sign out:', error);
      // Attempt to clear local state even if Firebase sign-out fails
      try {
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
        this.userDataSubject.next({ bookmarks: [], history: [], preferences: null });
      } catch (clearError) {
          // //console.error('[FirebaseAuthService] Error clearing data after sign out error:', clearError);
      }
      // Navigate after clearing data on error
      this.ngZone.run(() => { 
         // REMOVED: window.location.assign('/auth/login');
         this.router.navigate(['/']);
      });

    } finally {
      this._isLoading.next(false);
      // ////console.log('[FirebaseAuthService] signOut finished.');
      // REMOVED Redundant Navigation from finally block entirely
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
      // ////console.error('Error sending password reset email:', error);
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
        // ////console.warn('Could not fetch user preferences from API');
      }
      
      // Try localStorage as fallback
      const localPrefs = localStorage.getItem(`user_preferences_${user.uid}`);
      if (localPrefs) {
        try {
          return JSON.parse(localPrefs);
        } catch (error) {
          // ////console.error('Error parsing localStorage preferences:', error);
        }
      }
      
      // Return default preferences if nothing is found
      return {
        selectedReciter: 1,
        selectedTranslation: 'en.sahih', 
        bookmarks: []
      };
    } catch (error) {
      // ////console.error('Error getting user settings:', error);
      return {};
    }
  }

  // Save reading history entry
  async saveReadingHistory(location: { type: 'verse', surah: number, verse: number } | { type: 'page', page: number, surah: number | null }): Promise<void> {
    const user = this._user.getValue();
    if (!user) {
      ////console.warn('[AuthService saveReadingHistory] User not logged in, skipping save.');
      return; // Don't save if user is not logged in
    }

    const userId = user.id;
    const url = `${environment.apiUrl}/api/user/${userId}/reading-history`;

    // Prepare the body based on the location type
    let body: any;
    if (location.type === 'verse') {
        // REMOVED Incorrect Validation Block
        body = { 
            type: 'verse',
            surah: location.surah, 
            verse: location.verse 
        };
    } else if (location.type === 'page') {
        // Keep page validation for now (might be useful, but ensure range is correct)
        // Let's assume the backend range check (1-613) is the source of truth
        // Remove frontend check for consistency if backend handles it reliably
        /* 
        if (isNaN(location.page) || location.page < 1 || location.page > 613) { 
           ////console.warn('[AuthService saveReadingHistory] Invalid page data, skipping save:', location);
           return;
        }
        */
        body = { 
            type: 'page',
            page: location.page, 
            // ADD SURAH FOR PAGE TYPE - This was in a previous version, ensure it's here
            surah: location.surah 
        };
        // Add safety check for null surah on page type
        if (body.surah === null || body.surah === undefined) {
            ////console.warn('[AuthService saveReadingHistory] Surah is null/undefined for page type, skipping save:', location);
            return;
        }
    } else {
        ////console.warn('[AuthService saveReadingHistory] Unknown location type, skipping save:', location);
      return;
    }

    // ////console.log(`[AuthService saveReadingHistory] Sending POST to ${url} with body:`, body);

    // POST to the backend endpoint
    try {
        await firstValueFrom(this.http.post<any>(url, body).pipe(
            timeout(this.API_TIMEOUT),
            retry(this.API_RETRY_ATTEMPTS),
            catchError(error => {
                // Log specific errors but don't necessarily throw to break the app flow
                ////console.error('[AuthService saveReadingHistory] Error saving history to server:', error);
                // Return an observable that emits null or an error object to allow flow continuation
                return of(null); // Or throwError(() => error) if you need to propagate
            })
        ));
        // ////console.log('[AuthService saveReadingHistory] History saved successfully.');
        // Optionally: Update local history cache/subject upon success here if needed
    } catch (error) {
        // Catch errors specifically from firstValueFrom if the pipe returns an error
        ////console.error('[AuthService saveReadingHistory] Final error after pipe:', error);
    }
  }

  // Keep the old method signature for backward compatibility or internal use if necessary,
  // but mark it as deprecated or refactor calls to use the new method.
  /**
   * @deprecated Use saveReadingHistory(location: { type: 'verse', surah: number, verse: number } | { type: 'page', page: number, surah: number | null }) instead.
   */
  async saveReadingHistory_Legacy(surah: number, verse: number): Promise<void> {
    await this.saveReadingHistory({ type: 'verse', surah, verse });
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
        // ////console.warn('[AuthService] Skipping optimistic history update: originalData is null.');
        // NOTE: Server save will still be attempted below if token is available.
    } else {
        try {
            // Linter Fix 2: Ensure originalData.history is an array
            const originalHistory: ReadingHistoryEntry[] = originalData.history ?? [];
            const optimisticallyUpdatedHistory = this.addOrUpdateHistoryEntry(originalHistory, entry);
            this.userDataSubject.next({ ...originalData, history: optimisticallyUpdatedHistory });
            // // ////console.log('[AuthService] userDataSubject emitted after optimistic update:', updatedUserData);
            // // ////console.log('[AuthService] Optimistically updated history:', entry);
        } catch (optimisticError) {
            // ////console.error('[AuthService] Error during optimistic history update:', optimisticError);
            // If optimistic update fails, maybe don't proceed? For now, let server call attempt.
        }
    }
    // --- End Optimistic Update ---

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // ////console.log(`[AuthService saveHistoryToServer Attempt ${attempt}] User: ${userId}, Entry: S:${entry.surah} V:${entry.verse}`); // Log call details
        const token = await this.getToken(true); // Get fresh token for each attempt potentially needed
        if (!token) throw new Error('Authentication token unavailable for saving history.');

        // ////console.log(`[AuthService saveHistoryToServer Attempt ${attempt}] Got token. Making POST request...`); // Log before POST

        // // ////console.log(`[AuthService] Attempt ${attempt} to save history to server...`);
        await firstValueFrom(
          this.http.post<any>(
            `${environment.apiUrl}/api/user/${userId}/reading-history`, 
            entry, 
            { headers: { 'Authorization': `Bearer ${token}` } }
          )
        );

        // ////console.log(`[AuthService saveHistoryToServer Attempt ${attempt}] POST request successful.`); // Log success

        // Server call successful, the optimistic update is now confirmed.
        // // ////console.log('[AuthService] Reading history saved successfully on server.');
        return; // Exit loop on success

      } catch (error: any) {
        // ////console.error(`[AuthService] Error saving reading history (attempt ${attempt}):`, error);

        // --- Revert Optimistic Update on Failure ---
        if (!reverted) {
            // ////console.warn('[AuthService] Reverting optimistic history update due to server error.');
            this.userDataSubject.next(originalData); // Restore original state
            // // ////console.log('[AuthService] userDataSubject emitted after REVERTING update:', JSON.stringify(this.userDataSubject.getValue())); 
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
             // ////console.error('[AuthService] Authentication error during history save, stopping retries.');
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
      // ////console.warn('Error getting last read position:', error);
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
      // ////console.error('Error checking AI access:', error);
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
        // ////console.warn('Invalid state provided to saveQuranReaderState:', state);
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
          // ////console.warn('Reading history API endpoint not available, using localStorage instead');
          // Save to localStorage as fallback
          const preferences = await this.getUserSettings();
          preferences.history = updatedHistory;
          localStorage.setItem(`user_preferences_${user.uid}`, JSON.stringify(preferences));
        }
      }
    } catch (error) {
      // ////console.error('Error saving Quran reader state:', error);
      throw error;
    }
  }

  // Check if user has premium status
  async isPremiumUser(): Promise<boolean> {
    await this.authReady.pipe(take(1)).toPromise(); // Wait for auth state to be ready
    const user = this._user.getValue();
    if (!user) {
      // // ////console.log('[isPremiumUser] No user logged in.');
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
           // // ////console.log('[isPremiumUser] Determined premium status from token claim.');
          return true;
        }
      } catch (e) {
        // ////console.error('[isPremiumUser] Error decoding token for claims check:', e);
      }
    }

    // Fallback: Check the AppUser object's isPremium field (updated by handleUserSignedIn)
     // // ////console.log(`[isPremiumUser] Falling back to AppUser object check. isPremium: ${user.isPremium}`);
    return user.isPremium;
  }

  // Method to send email verification to the current user
  async sendEmailVerification(): Promise<void> {
    const user = this.auth.currentUser;
    if (user) {
      try {
        await sendEmailVerification(user);
        // // ////console.log('Verification email sent successfully.');
        // Optionally show a success message to the user
      } catch (error) {
        // ////console.error('Error sending verification email:', error);
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
      // ////console.error('Error changing password:', error);
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
      // // ////console.log(`[AuthService] Cache expired for key: ${key}`);
      localStorage.removeItem(key); // Remove expired cache item
      return null;
    } catch (error) {
      // ////console.warn(`[AuthService] Error reading cache for key ${key}:`, error);
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
      // ////console.warn(`[AuthService] Error writing cache for key ${key}:`, error);
    }
  }

  // User data management
  private async loadUserData(userId: string): Promise<void> {
    // // ////console.log(`[AuthService] loadUserData called for ${userId}`);
    // --- Add Caching Logic ---
    const cacheKey = `user_data_${userId}`;
    const cachedUserData = this.getCachedData(cacheKey); // Uses helper with REQUEST_CACHE_DURATION
    if (cachedUserData) {
        // // ////console.log(`[AuthService] loadUserData: Returning cached data for ${userId}`);
        this.userDataSubject.next(cachedUserData);
        this.preferencesSubject.next(cachedUserData.preferences || this.getDefaultPreferences()); // Update prefs too
        return; // Exit if cache is valid
    }
    // --- End Caching Logic ---

    // // ////console.log(`[AuthService] loadUserData: Cache miss or stale for ${userId}. Fetching from API...`);

    try {
        // Fetch combined user data from the backend profile endpoint
        // Interceptor handles token
        const userData = await firstValueFrom(this.http.get<any>(`${environment.apiUrl}/api/user/${userId}/profile`).pipe(
            timeout(20000),
            retry({ count: 2, delay: 1500 }),
            catchError(error => {
                // ////console.error(`[AuthService] loadUserData: Error fetching profile for ${userId}:`, error);
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
          // // ////console.log(`[AuthService] loadUserData: Successfully fetched data for ${userId}.`);

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
        // ////console.error(`[AuthService] loadUserData: General error fetching profile for ${userId}:`, error);
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
      filter(user => !!user && !!user.id), // Ensure user is logged in
      switchMap(user => {
        const userId = user!.id;
        const cacheKey = `history_${userId}`;
        const cachedHistory = this.getCachedData(cacheKey);
        if (cachedHistory) {
          return of({ success: true, history: cachedHistory });
        }

        if (this.shouldThrottle(cacheKey)) {
            return of({ success: true, history: this.userDataSubject.value?.history || [] }); // Return current state if throttled
        }
        this.updateLastRequestTime(cacheKey);
        
        // Interceptor will add the token
        return this.http.get<ReadingHistoryResponse>(
          `${environment.apiUrl}/api/user/${userId}/reading-history`
        ).pipe(
          tap(response => {
            if (response && response.success && Array.isArray(response.history)) {
              this.setCachedData(cacheKey, response.history);
              const currentData = this.userDataSubject.getValue();
              if (currentData) {
                  this.userDataSubject.next({ ...currentData, history: response.history });
              }
            }
          }),
          catchError(error => {
            //console.error(`getReadingHistory: HTTP Error for ${userId}:`, error);
            return throwError(() => ({
              success: false,
              message: error.message || 'Failed to fetch reading history',
              history: [],
              status: error.status
            }));
          })
        );
      }),
      catchError(error => {
        // Handle error if user stream fails or user is null
        //console.error('getReadingHistory: Error in user stream or user not logged in:', error);
        return of({ success: false, message: 'User not authenticated', history: [] });
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
    const userId = user.uid; // Get userId for cache key

    // Clear on server first
    try {
        await this.http.delete<any>(
          `${environment.apiUrl}/api/user/${userId}/reading-history`
        ).toPromise();
        // Update local state after successful deletion
        const currentData = this.userDataSubject.getValue();
        if (currentData) {
            this.userDataSubject.next({ ...currentData, history: [] });
        }
    } catch(error) {
        //console.error("Error clearing history via API", error);
        // Handle error - Interceptor deals with 401/403
        throw error;
    }
  }

  // Bookmark methods
  removeBookmark(bookmark: string): Observable<BookmarkResponse> {
    return this.user$.pipe(
      take(1),
      switchMap(user => {
        if (!user) {
          return throwError(() => new Error('User not logged in'));
        }
        // *** FIX: Encode bookmark and add to URL path for DELETE ***
        const encodedBookmark = encodeURIComponent(bookmark);
        const url = `${environment.apiUrl}/api/user/${user.id}/bookmarks/${encodedBookmark}`;
        // *** FIX: Send DELETE request without body/options ***
        return this.http.delete<BookmarkResponse>(url).pipe(
          timeout(this.API_TIMEOUT),
          retry(this.API_RETRY_ATTEMPTS),
          catchError(this.handleError),
          tap(response => {
            if (response.success) {
              // Update local cache/subject optimistically or upon success
              const currentData = this.userDataSubject.value || {};
              const currentBookmarks = Array.isArray(currentData.bookmarks) ? currentData.bookmarks : [];
              this.userDataSubject.next({
                ...currentData,
                bookmarks: currentBookmarks.filter(b => b !== bookmark)
              });
            }
          })
        );
      })
    );
  }

  addBookmark(bookmark: string): Observable<BookmarkResponse> {
    return this.user$.pipe(
      take(1),
      switchMap(user => {
        if (!user) {
          return throwError(() => new Error('User not logged in'));
        }
        const url = `${environment.apiUrl}/api/user/${user.id}/bookmarks`;
        
        // *** UPDATE: Construct payload based on bookmark type for unified endpoint ***
        let body: { verseReference: string } | { type: string, page: number };

        if (bookmark.startsWith('verse:')) {
          const parts = bookmark.split(':');
          if (parts.length === 3) {
            const surah = parseInt(parts[1], 10);
            const verse = parseInt(parts[2], 10);
            if (!isNaN(surah) && !isNaN(verse) && surah > 0 && surah <= 114 && verse > 0) {
              // Format for verse bookmark request
              body = { verseReference: `${surah}:${verse}` };
            } else {
              return throwError(() => new Error('Invalid verse bookmark format for API'));
            }
          } else {
             return throwError(() => new Error('Invalid verse bookmark format for API'));
          }
        } else if (bookmark.startsWith('mushaf:')) {
          const parts = bookmark.split(':');
          if (parts.length === 2) {
              const page = parseInt(parts[1], 10);
              if (!isNaN(page) && page > 0 && page <= 604) { // Assuming page range 1-604
                 // Format for page bookmark request
                 body = { type: 'page', page: page };
              } else {
                 return throwError(() => new Error('Invalid page bookmark format for API'));
              }
          } else {
              return throwError(() => new Error('Invalid page bookmark format for API'));
          }
        } else {
           return throwError(() => new Error('Unknown bookmark format for API'));
        }
        // *** END UPDATE ***
        
        return this.http.post<BookmarkResponse>(url, body).pipe( // Send the correct body
          timeout(this.API_TIMEOUT),
          retry(this.API_RETRY_ATTEMPTS),
          catchError(this.handleError),
          tap(response => {
            if (response.success) {
              // Update local cache/subject optimistically or upon success
              const currentData = this.userDataSubject.value || {};
              const currentBookmarks = Array.isArray(currentData.bookmarks) ? currentData.bookmarks : [];
              if (!currentBookmarks.includes(bookmark)) {
                 this.userDataSubject.next({
                    ...currentData,
                    bookmarks: [...currentBookmarks, bookmark]
                 });
              }
            }
          })
        );
      })
    );
  }

  getBookmarks(): Observable<string[]> {
    // Revert to using user$ with filter
    return this.user$.pipe(
      filter(user => !!user && !!user.id), // Wait for a valid user
      take(1),
      switchMap(appUser => {
        // User is guaranteed to be non-null here due to filter
        const userId = appUser!.id;
        return this.http.get<string[]>(
          `${environment.apiUrl}/api/user/${userId}/bookmarks`
        ).pipe(
          map(bookmarks => Array.isArray(bookmarks) ? bookmarks : []),
          catchError(error => {
            //console.error(`Error loading bookmarks for user ${userId}:`, error);
            // Return empty array on HTTP errors for bookmarks
            return of([]); 
          })
        );
      }),
      catchError(error => {
        // Catch errors from the filter/take(1)/user$ stream itself
        //console.error('Error in getBookmarks user stream:', error);
        return of([]); // Return empty array if user stream errors or never emits valid user
      })
    );
  }

  async refreshAuth(): Promise<void> {
    try {
      const currentUser = this.auth.currentUser;
      
      if (!currentUser) {
        // ////console.warn('❌ No current user found during token refresh');
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
    //console.log('[AuthService] waitForAuthReady called... Waiting for postRedirectAuthSettled.'); // Log: waitForAuthReady called
    await firstValueFrom(this.postRedirectAuthSettled);
    //console.log('[AuthService] waitForAuthReady completed (postRedirectAuthSettled resolved).'); // Log: waitForAuthReady resolved
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
      // ////console.error('[AuthService] Error caching user data:', error);
    }
  }

  // --- Modify this method ---
  async reloadCurrentUser(): Promise<AppUser | null> { // Return AppUser or null
    const firebaseUser = getAuth(this.firebaseApp).currentUser;
    if (firebaseUser) {
      try {
        // // ////console.log(`[FirebaseAuthService] Reloading user state for ${firebaseUser.uid}...`);
        await firebaseUser.reload();
        const refreshedFirebaseUser = getAuth(this.firebaseApp).currentUser; // Get the reloaded user
        if (refreshedFirebaseUser) {
          // // ////console.log(`[FirebaseAuthService] User state reloaded. emailVerified: ${refreshedFirebaseUser.emailVerified}. Updating internal state...`);
          // Re-process the user state to update the BehaviorSubject and potentially claims
          // Assuming handleUserSignedIn fetches/processes claims and returns the full AppUser
          const processedUser = await this.handleUserSignedIn(refreshedFirebaseUser); 
          return processedUser; // Return the updated AppUser
        } else {
           // ////console.warn('[FirebaseAuthService] User became null immediately after reload.');
           this._user.next(null);
           return null;
        }
      } catch (error) {
        // ////console.error('[FirebaseAuthService] Error reloading user state:', error);
        // On error, return the *current* known state without updating BehaviorSubject again
        // This prevents potentially emitting null incorrectly if reload fails temporarily
        return this._user.getValue(); 
      }
    } else {
      // // ////console.log('[FirebaseAuthService] reloadCurrentUser called but no user is logged in.');
      return null;
    }
  }
  // --- End modified method ---

  private startTokenRefreshTimer(): void {
    this.clearTokenRefreshTimer(); // Clear any existing timer first

    // Refresh slightly before the 1-hour expiry (e.g., 55 minutes)
    const refreshInterval = this.TOKEN_CACHE_DURATION; // Use defined duration
    this.tokenRefreshTimer = setTimeout(async () => {
      // // ////console.log('[Timer] Token refresh timer triggered. Forcing refresh...');
      try {
        await this.getToken(true); // Force refresh
        // // ////console.log('[Timer] Token refreshed successfully.');
        this.startTokenRefreshTimer(); // Restart the timer for the next interval
      } catch (error) {
        // ////console.error('[Timer] Failed to refresh token automatically:', error);
        // Optionally, schedule a retry with backoff, or rely on next API call to trigger refresh
      }
    }, refreshInterval);
    this.refreshTimerStarted = true; // Mark timer as started
    // // ////console.log(`[Timer] Token refresh timer started. Interval: ${refreshInterval / 60000} minutes.`);
  }

  // Method to schedule the next token refresh
  private scheduleTokenRefresh(): void {
    //console.log('[scheduleTokenRefresh] Attempting to schedule token refresh...'); // Log: scheduleTokenRefresh start
    this.clearTokenRefreshTimer(); // Clear any existing timer first

    const user = this._user.getValue();
    if (!user || !this.cachedToken) {
      // // ////console.log('[scheduleTokenRefresh] No user or cached token found. Cannot schedule refresh.');
      return;
    }

    const decodedToken = this.decodeToken(this.cachedToken.token);
    if (!decodedToken || typeof decodedToken.exp !== 'number') {
        // ////console.error('[scheduleTokenRefresh] Could not decode token or find expiry time. Cannot schedule refresh.');
        return;
    }

    const expirationTime = decodedToken.exp * 1000; // Convert seconds to milliseconds
    const currentTime = Date.now();
    const timeUntilExpiry = expirationTime - currentTime;

    // Calculate refresh time: expiry time - margin (or slightly before expiry)
    let refreshDelay = timeUntilExpiry - this.TOKEN_REFRESH_MARGIN;

    // Ensure refreshDelay is positive and reasonable
    if (refreshDelay <= 0) {
        // ////console.warn(`[scheduleTokenRefresh] Token already expired or too close to expiry (delay: ${refreshDelay}ms). Attempting immediate refresh.`);
        // Optionally trigger an immediate refresh attempt here, but be cautious of loops
        // For now, just log and don't schedule.
        // Or schedule for a minimal delay like 1 second if immediate refresh is desired
        // this.refreshToken(true); // Example of immediate refresh
        refreshDelay = 5000; // Schedule a refresh soon if needed
        // return; // Or simply don't schedule if already expired
    }

    // // ////console.log(`[scheduleTokenRefresh] Scheduling token refresh in ${Math.round(refreshDelay / 1000)} seconds.`);

    // ////console.log(`[scheduleTokenRefresh] Scheduling token refresh in ${Math.round(refreshDelay / 1000)} seconds.`);

    this.tokenRefreshTimer = setTimeout(async () => {
        // ////console.log('[Timer] Token refresh timer triggered.');
        try {
            await this.refreshToken(true); // Force refresh
        } catch (error) {
            ////console.error('[Timer] Error during scheduled token refresh:', error);
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
      ////console.error('[decodeToken] Error decoding token:', e);
      return null;
    }
  }

  // Fetches reading history internally, bypassing the main observable if needed
  // This might be useful during initial load or specific updates
  private async getReadingHistoryInternal(): Promise<ReadingHistoryEntry[]> {
    try {
      const user = this.getCurrentUser();
      if (!user) {
        // // ////console.log('[getReadingHistoryInternal] No current user, returning empty history');
        return [];
      }

      // // ////console.log(`[getReadingHistoryInternal] Fetching history internally for user: ${user.uid}`);
      // // ////console.log(`[getReadingHistoryInternal] >>> MAKING REQUEST TO: /api/user/${user.uid}/reading-history`);

      // Create AbortController for the request
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        // ////console.log('[getReadingHistoryInternal] Request timeout reached, aborting...');
        abortController.abort();
      }, 10000); // 10 second timeout

      try {
        const response = await this.apiService.makeRequest('get', `/api/user/${user.uid}/reading-history`, undefined, {
          signal: abortController.signal
        });

        // Clear timeout since request completed
        clearTimeout(timeoutId);

        // // ////console.log(`[getReadingHistoryInternal] <<< RETURNED FROM apiService.makeRequest`);
        
        if (response && response.success && Array.isArray(response.history)) {
          // // ////console.log(`[getReadingHistoryInternal] Fetched ${response.history.length} history entries.`);
          return response.history;
        } else {
          // ////console.warn('[getReadingHistoryInternal] Invalid response format:', response);
          return [];
        }
      } catch (error: any) {
        // Clear timeout on error
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
          ////console.error('[getReadingHistoryInternal] Request aborted due to timeout');
          return [];
        }

        throw error; // Re-throw other errors
      }
    } catch (error: any) {
      ////console.error('[getReadingHistoryInternal] Error fetching history:', error);
      return [];
    }
  }

  // Refreshes the Firebase ID token
  public async refreshToken(forceRefresh: boolean = false): Promise<string | null> {
    // ////console.log(`[refreshToken] Called. Force refresh: ${forceRefresh}`);
    const firebaseAuth = await this.authPromise; // Ensure Firebase Auth is initialized
    if (!firebaseAuth) { // Add null check after awaiting
      //console.error('[refreshToken] Firebase Auth instance is null after initialization attempt.');
      return null;
    }

    const currentUser = firebaseAuth.currentUser;

    if (!currentUser) {
        ////console.warn('[refreshToken] No current Firebase user. Cannot refresh token.');
        this.clearAuthData(); // Ensure clean state if user disappears unexpectedly
        return null;
    }

    try {
        // ////console.log(`[refreshToken] Getting ID token for user: ${currentUser.uid}`);
        const token = await currentUser.getIdToken(forceRefresh);
        // ////console.log(`[refreshToken] Successfully obtained new token for ${currentUser.uid}.`);

        // Update cache
        this.cachedToken = { token: token, timestamp: Date.now() };
        localStorage.setItem(this.TOKEN_CACHE_KEY, JSON.stringify(this.cachedToken));

        // Reschedule next refresh
        this.scheduleTokenRefresh();

        return token;
    } catch (error) {
        ////console.error(`[refreshToken] Error refreshing ID token for user ${currentUser.uid}:`, error);
        // Handle specific errors, e.g., user deleted, disabled, token expired/revoked
        if (error instanceof Error && (
            error.message.includes('auth/user-token-expired') ||
            error.message.includes('auth/user-disabled') ||
            error.message.includes('auth/user-not-found') ||
            error.message.includes('auth/invalid-user-token')
        )) {
            ////console.warn('[refreshToken] User session seems invalid. Signing out.');
            await this.signOut(); // Force sign out on critical token errors
        } else {
            // For other errors, maybe retry later or just log
            ////console.error('[refreshToken] Unhandled error during token refresh.');
            // Consider if clearing auth data is appropriate here too
            // this.clearAuthData();
        }
        return null;
    }
  }

  // --- Initialization ---
  private async initializeAuth(): Promise<Auth> {
    if (this.isAuthInitialized) {
        // // ////console.log('[initializeAuth] Auth already initialized.');
        // Return the existing promise which resolves to the Auth instance
        return getAuth(initializeApp(environment.firebase)); 
    }
    // // ////console.log('[initializeAuth] Initializing Firebase Auth...');
    try {
        // Initialize Firebase App (idempotent)
        const app = initializeApp(environment.firebase);
        // Get Auth instance
        const auth = getAuth(app);
        this.isAuthInitialized = true;
        // // ////console.log('[initializeAuth] Firebase Auth initialized successfully.');
        return auth; // Resolve the promise with the Auth instance
    } catch (error) {
        // ////console.error('[initializeAuth] Error initializing Firebase:', error);
        // Mark as initialized even on error to prevent retries
        this.isAuthInitialized = true; 
        // Reject the promise
        throw new Error('Firebase initialization failed'); 
    }
  }

  private async initializeAuthAndStateListener(): Promise<void> {
    //console.log('[AuthService] Initializing Auth and State Listener START...'); // Log: initializeAuthAndStateListener start
    let redirectProcessed = false; // Local flag for this init sequence
    try {
      // 1. Check and process redirect result FIRST
      //console.log('[AuthService] Checking for redirect result START...'); // Log: getRedirectResult start
      const credential = await getRedirectResult(this.auth);
      //console.log('[AuthService] getRedirectResult finished. Credential:', credential ? `Exists (User: ${credential.user.uid})` : 'null'); // Log: getRedirectResult end
    } catch (error: any) {
      //console.error('[AuthService] Error processing redirect result:', error); // Log: getRedirectResult error
      if (error.code === 'auth/account-exists-with-different-credential') {
        this.snackBar.open('An account already exists with this email using a different sign-in method.', 'Close', { duration: 7000 });
      } else {
        this.snackBar.open(`Login failed during redirect: ${error.message}`, 'Close', { duration: 5000 });
      }
    } finally {
      //console.log('[AuthService] Marking redirect result as processed LOCALLY.'); // Log: redirectResultProcessed set
      redirectProcessed = true; // Mark local flag
      this.redirectResultProcessed = true; // Mark service flag
      // Don't signal settled yet, wait for onAuthStateChanged
      // BUT, if auth is already ready by now (unlikely but possible), try signaling
      this.trySignalPostRedirectAuthSettled(); 
    }

    // 2. Setup the AuthStateChanged listener AFTER starting redirect check
    this.setupAuthStateListener(redirectProcessed); // Pass the local flag
    //console.log('[AuthService] Initializing Auth and State Listener END.');
  }

  // New method to try signaling the post-redirect settled state
  // This is called from the finally block of onAuthStateChanged AND from finally block of getRedirectResult
  private trySignalPostRedirectAuthSettled(): void {
    //console.log(`[AuthService] trySignalPostRedirectAuthSettled called. hasSignaledAuthReady: ${this.hasSignaledAuthReady}, redirectResultProcessed: ${this.redirectResultProcessed}`); // Log: trySignalPostRedirectAuthSettled called
    // Check if initial auth state determined AND redirect processing is done
    if (this.hasSignaledAuthReady && this.redirectResultProcessed && !this.postRedirectAuthSettled.closed) {
      //console.log('[AuthService] Conditions met. Signaling Post Redirect Auth Settled (postRedirectAuthSettled).'); // Log: postRedirectAuthSettled signaling
      this.postRedirectAuthSettled.next();
      this.postRedirectAuthSettled.complete();
    } else {
       // If redirect is processed but auth isn't ready yet, we wait for auth.
       // If auth is ready but redirect isn't processed yet, we wait for redirect.
       // This ensures it eventually resolves once both conditions are met.
      //console.log('[AuthService] Conditions not met for signaling Post Redirect Auth Settled yet.'); // Log: postRedirectAuthSettled waiting
    }
  }

  private handleUserSignedOut(): void {
    //console.log('[AuthService] User signed out. Clearing auth data...'); // Log: handleUserSignedOut called
    this.clearAuthData(); // Clear user state, token, cache, timer
    //console.log('[AuthService] Auth data cleared after sign out.');
    // Auth is now ready (state is known: null)
    this.signalAuthReady(); 
    // Also try to settle the post-redirect state, as redirect is processed and auth is now ready (null)
    this.trySignalPostRedirectAuthSettled(); 
  }
} 