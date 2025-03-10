import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, of, firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

// Add this to make TypeScript recognize the global Clerk object
declare global {
  interface Window {
    Clerk: any;
    __clerk_publishable_key?: string;
  }
}

export interface User {
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

interface PricingTier {
  name: string;
  price: number;
  interval: 'month' | 'year';
  features: string[];
  recommended?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private clerk: any;
  private userSubject = new BehaviorSubject<User | null>(null);
  user$ = this.userSubject.asObservable();
  isLoggedIn$: Observable<boolean> = of(false);
  private apiUrl = environment.production 
    ? '/api'  // In production, use relative path
    : 'http://localhost:3000/api'; // In development, use full URL
  private initializationPromise: Promise<void> | null = null;
  
  // Property to store the URL that the user tried to access before authentication
  redirectUrl: string | null = null;

  private readonly LAST_ROUTE_KEY = 'lastRoute';
  private readonly ROUTE_STATE_KEY = 'routeState';
  private authStateSubject = new BehaviorSubject<boolean>(false);

  constructor(
    private router: Router,
    private http: HttpClient
  ) {
    // Initialize Clerk
    this.initializationPromise = this.initializeClerk();
    // Check initial auth state
    this.checkAuthState();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initializeClerk();
    }
    await this.initializationPromise;
  }

  private async initializeClerk(): Promise<void> {
    try {
      // Get the publishable key from environment
      const publishableKey = environment.clerkPublishableKey;
      
      if (!publishableKey) {
        throw new Error('Missing Clerk publishable key in environment');
      }

      // Wait for the DOM to be fully loaded
      if (document.readyState !== 'complete') {
        await new Promise<void>((resolve) => {
          window.addEventListener('load', () => resolve());
        });
      }

      // Check if Clerk script is loaded
      if (!window.Clerk) {
        await new Promise<void>((resolve) => {
          const checkClerk = () => {
            if (window.Clerk) {
              resolve();
            } else {
              setTimeout(checkClerk, 100);
            }
          };
          checkClerk();
        });
      }

      // Initialize Clerk
      if (!window.Clerk.isInitialized) {
        await window.Clerk.load({
          publishableKey: publishableKey,
          frontendApi: environment.clerkFrontendApi,
          appearance: {
            elements: {
              rootBox: {
                boxShadow: 'none',
              },
            },
          },
        });
      }

      this.clerk = window.Clerk;

      // Set up auth state listener
      this.clerk.addListener((clerk: any) => {
        if (clerk.user) {
          this.handleUserSignedIn(clerk.user);
        } else {
          this.userSubject.next(null);
        }
      });

      // Initialize isLoggedIn$ observable
      this.isLoggedIn$ = new Observable((subscriber) => {
        subscriber.next(!!this.clerk.user);
        this.clerk.addListener((clerk: any) => {
          subscriber.next(!!clerk.user);
        });
      });

      // Initialize user if already logged in
      if (this.clerk.user) {
        await this.handleUserSignedIn(this.clerk.user);
      }

    } catch (error) {
      console.error('Error initializing Clerk:', error);
      throw error;
    }
  }

  // Get the current authentication token
  async getToken(): Promise<string | null> {
    try {
      await this.ensureInitialized();
      
      if (!this.clerk) {
        console.error('Clerk not initialized in getToken');
        return null;
      }
      
      if (!this.clerk.session) {
        console.error('No active Clerk session');
        return null;
      }
      
      const token = await this.clerk.session.getToken();
      if (!token) {
        console.error('No token returned from Clerk session');
        return null;
      }
      
      return token;
    } catch (error) {
      console.error('Error getting token:', error);
      return null;
    }
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!this.clerk?.user;
  }

  // Get user ID
  getUserId(): string | null {
    return this.clerk?.user?.id || null;
  }

  // Update user profile
  async updateProfile(data: { firstName?: string; lastName?: string }): Promise<void> {
    if (!this.clerk?.user) {
      throw new Error('User not authenticated');
    }
    
    try {
      await this.clerk.user.update(data);
      // Update local user object
      if (this.userSubject.value) {
        const updatedUser = {
          ...this.userSubject.value,
          firstName: data.firstName || this.userSubject.value.firstName,
          lastName: data.lastName || this.userSubject.value.lastName
        };
        this.userSubject.next(updatedUser);
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  }

  // Handle redirect after authentication
  handleRedirect(): Promise<void> {
    if (!this.clerk) {
      return Promise.resolve();
    }
    
    return this.clerk.handleRedirectCallback().then(() => {
      if (this.clerk.user) {
        this.handleUserSignedIn(this.clerk.user);
      }
    });
  }

  private async handleUserSignedIn(clerkUser: any): Promise<void> {
    const user: User = {
      id: clerkUser.id,
      email: clerkUser.primaryEmailAddress?.emailAddress || '',
      firstName: clerkUser.firstName || '',
      lastName: clerkUser.lastName || '',
      imageUrl: clerkUser.imageUrl,
      emailVerified: clerkUser.primaryEmailAddress?.verification?.status === 'verified',
      createdAt: new Date(clerkUser.createdAt),
      lastSignInAt: clerkUser.lastSignInAt ? new Date(clerkUser.lastSignInAt) : undefined,
      preferences: await this.getUserPreferences(clerkUser.id),
      isAdmin: clerkUser.isAdmin || false
    };
    
    this.userSubject.next(user);
  }

  // Get a specific user preference
  getPreference<T>(key: string, defaultValue: T): T {
    const user = this.userSubject.value;
    if (!user || !user.preferences) return defaultValue;
    
    return (user.preferences as any)[key] !== undefined 
      ? (user.preferences as any)[key] 
      : defaultValue;
  }

  // Set a specific user preference
  async setPreference<T>(key: string, value: T): Promise<void> {
    const user = this.userSubject.value;
    if (!user) return;
    
    if (!user.preferences) {
      user.preferences = {};
    }
    
    (user.preferences as any)[key] = value;
    await this.saveUserPreferences(user.preferences);
  }

  // Sync Quran reading settings
  async syncQuranSettings(settings: {
    selectedReciter?: number;
    selectedTranslation?: string;
    fontSize?: number;
    darkMode?: boolean;
  }): Promise<void> {
    const user = this.userSubject.value;
    if (!user) return;
    
    if (!user.preferences) {
      user.preferences = {};
    }
    
    // Only update the provided settings
    user.preferences = {
      ...user.preferences,
      ...settings
    };
    
    await this.saveUserPreferences(user.preferences);
  }

  // Get all user preferences
  getUserSettings(): any {
    const user = this.userSubject.value;
    if (!user || !user.preferences) {
      return {
        selectedReciter: 7,
        selectedTranslation: '131',
        fontSize: 24,
        darkMode: false,
        bookmarks: [] as string[]
      };
    }
    
    return { ...user.preferences };
  }

  private async getUserPreferences(userId: string): Promise<any> {
    const defaultPrefs = {
      selectedReciter: 7,
      selectedTranslation: '131',
      fontSize: 24,
      darkMode: false,
      bookmarks: [] as string[]
    };

    // First try to get from local storage as cache
    try {
      const storedPrefs = localStorage.getItem(`user_prefs_${userId}`);
      if (storedPrefs) {
        const parsedPrefs = JSON.parse(storedPrefs);
        // Try to sync with backend
        this.syncPreferencesToBackend(userId, parsedPrefs);
        return parsedPrefs;
      }
    } catch (error) {
      console.warn('Error reading from local storage:', error);
    }

    // Try to get from backend
    try {
      const token = await this.getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await this.http.get(`${this.apiUrl}/users/${userId}/preferences`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }).toPromise();

      if (response) {
        // Cache in local storage
        localStorage.setItem(`user_prefs_${userId}`, JSON.stringify(response));
        return response;
      }
    } catch (error: any) {
      if (error.status === 404) {
        // If preferences don't exist yet, create them
        await this.saveUserPreferencesToBackend(userId, defaultPrefs);
      } else {
        console.warn('Error fetching preferences from backend:', error);
      }
    }

    return defaultPrefs;
  }

  private async saveUserPreferencesToBackend(userId: string, preferences: any): Promise<void> {
    try {
      const token = await this.getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      await this.http.put(`${this.apiUrl}/users/${userId}/preferences`, preferences, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }).toPromise();

      // Update local storage
      localStorage.setItem(`user_prefs_${userId}`, JSON.stringify(preferences));
    } catch (error: any) {
      console.warn('Error saving preferences to backend:', error);
      // Still save to local storage as fallback
      localStorage.setItem(`user_prefs_${userId}`, JSON.stringify(preferences));
      
      // If endpoint doesn't exist, log a more specific error
      if (error.status === 404) {
        console.warn('Backend API endpoint not found. Ensure the preferences endpoint is properly configured in your server.');
      }
    }
  }

  private async syncPreferencesToBackend(userId: string, preferences: any): Promise<void> {
    try {
      await this.saveUserPreferencesToBackend(userId, preferences);
    } catch (error) {
      console.warn('Failed to sync preferences to backend:', error);
    }
  }

  async saveUserPreferences(preferences: any): Promise<void> {
    const user = this.userSubject.value;
    if (!user) return;
    
    // Update local user object
    user.preferences = { ...user.preferences, ...preferences };
    this.userSubject.next(user);
    
    // Save to local storage as a fallback
    localStorage.setItem(`user_prefs_${user.id}`, JSON.stringify(user.preferences));
    
    // Save to backend
    try {
      await this.saveUserPreferencesToBackend(user.id, user.preferences);
    } catch (error) {
      console.warn('Error saving preferences to backend:', error);
    }
  }

  // Save a bookmark
  async addBookmark(verseKey: string): Promise<void> {
    const user = this.userSubject.value;
    if (!user || !user.preferences) return;
    
    // Create bookmarks array if it doesn't exist
    if (!user.preferences.bookmarks) {
      user.preferences.bookmarks = [];
    }
    
    // Add bookmark if it doesn't already exist
    if (!user.preferences.bookmarks.includes(verseKey)) {
      user.preferences.bookmarks.push(verseKey);
      await this.saveUserPreferences(user.preferences);
    }
  }

  // Remove a bookmark
  async removeBookmark(verseKey: string): Promise<void> {
    const user = this.userSubject.value;
    if (!user || !user.preferences || !user.preferences.bookmarks) return;
    
    // Remove bookmark if it exists
    const index = user.preferences.bookmarks.indexOf(verseKey);
    if (index !== -1) {
      user.preferences.bookmarks.splice(index, 1);
      await this.saveUserPreferences(user.preferences);
    }
  }

  // Check if a verse is bookmarked
  isBookmarked(verseKey: string): boolean {
    const user = this.userSubject.value;
    if (!user || !user.preferences || !user.preferences.bookmarks) return false;
    
    return user.preferences.bookmarks.includes(verseKey);
  }

  // Get all bookmarks
  getBookmarks(): string[] {
    const user = this.userSubject.value;
    if (!user || !user.preferences || !user.preferences.bookmarks) return [];
    
    return [...user.preferences.bookmarks];
  }

  async openSignIn(): Promise<void> {
    try {
      await this.ensureInitialized();
      
      if (!this.clerk) {
        throw new Error('Clerk not initialized');
      }
      
      const signInProps = {
        redirectUrl: window.location.origin,
        appearance: {
          elements: {
            rootBox: {
              boxShadow: 'none',
            },
          },
        },
      };

      await this.clerk.openSignIn(signInProps);
      
      // After successful sign-in
      if (this.isAuthenticated() && this.redirectUrl) {
        const url = this.redirectUrl;
        this.redirectUrl = null;
        await this.router.navigateByUrl(url);
      }
    } catch (error) {
      console.error('Error during sign in:', error);
      throw error;
    }
  }

  async openSignUp(): Promise<void> {
    try {
      await this.ensureInitialized();
      
      if (!this.clerk) {
        throw new Error('Clerk not initialized');
      }
      
      const signUpProps = {
        redirectUrl: window.location.origin,
        appearance: {
          elements: {
            rootBox: {
              boxShadow: 'none',
            },
          },
        },
      };

      await this.clerk.openSignUp(signUpProps);
      
      // After successful sign-up
      if (this.isAuthenticated() && this.redirectUrl) {
        const url = this.redirectUrl;
        this.redirectUrl = null;
        await this.router.navigateByUrl(url);
      }
    } catch (error) {
      console.error('Error during sign up:', error);
      throw error;
    }
  }

  async signOut(): Promise<void> {
    await this.ensureInitialized();
    if (!this.clerk) {
      throw new Error('Clerk not initialized');
    }
    await this.clerk.signOut();
    this.router.navigate(['/']);
  }

  // Apply user preferences to Quran reader component
  applyQuranReaderPreferences(quranReader: any): void {
    const user = this.userSubject.value;
    if (!user || !user.preferences) return;
    
    // Apply preferences if they exist
    if (user.preferences.selectedReciter !== undefined) {
      quranReader.selectedReciter = this.findReciterById(user.preferences.selectedReciter);
    }
    
    if (user.preferences.selectedTranslation !== undefined) {
      quranReader.selectedTranslation = user.preferences.selectedTranslation;
    }
    
    if (user.preferences.fontSize !== undefined) {
      quranReader.fontSize = user.preferences.fontSize;
    }
    
    if (user.preferences.darkMode !== undefined) {
      quranReader.isDarkMode = user.preferences.darkMode;
    }
    
    // Load bookmarks if they exist
    if (user.preferences.bookmarks && user.preferences.bookmarks.length > 0) {
      quranReader.bookmarks = user.preferences.bookmarks;
    }
  }
  
  // Helper method to find reciter by ID
  private findReciterById(reciterId: number): any {
    // This should be replaced with actual logic to find a reciter by ID
    // For now, we'll return a default reciter object
    return {
      id: reciterId,
      name: 'Default Reciter',
      identifier: 'default',
      surahIdentifier: 'default'
    };
  }

  // Save Quran reader state
  async saveQuranReaderState(state: {
    surah?: number;
    verse?: number;
    position?: number;
    lastRead?: Date;
  }): Promise<void> {
    await this.setPreference('quranReaderState', state);
    
    // Save reading history
    const user = this.userSubject.value;
    if (!user || !state.surah || !state.verse) return;
    
    try {
      // First update local storage
      const localHistory = localStorage.getItem(`reading_history_${user.id}`);
      const history = localHistory ? JSON.parse(localHistory) : [];
      
      // Add new entry
      const newEntry = {
        surah: Number(state.surah),
        verse: Number(state.verse),
        timestamp: new Date().toISOString()  // Store as ISO string for consistency
      };
      
      // Remove any duplicate entries for the same surah/verse
      const filteredHistory = history.filter((entry: any) => 
        entry.surah !== newEntry.surah || entry.verse !== newEntry.verse
      );
      
      // Add new entry at the beginning and limit to 100 entries
      filteredHistory.unshift(newEntry);
      if (filteredHistory.length > 100) {
        filteredHistory.length = 100;
      }
      
      // Save to local storage
      localStorage.setItem(`reading_history_${user.id}`, JSON.stringify(filteredHistory));
      
      // Try to save to backend
      const token = await this.getToken();
      if (!token) return;
      
      await fetch(`${this.apiUrl}/users/${user.id}/reading-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newEntry)
      });
    } catch (error) {
      console.error('Error saving reading history:', error);
    }
  }

  // Get Quran reader state
  getQuranReaderState(): any {
    return this.getPreference('quranReaderState', {
      surah: 1,
      verse: 1,
      position: 0,
      lastRead: new Date()
    });
  }

  // Get reading history from backend
  async getReadingHistory(): Promise<any[]> {
    const user = this.userSubject.value;
    if (!user) return [];
    
    try {
      // First try to get from local storage
      const localHistory = localStorage.getItem(`reading_history_${user.id}`);
      if (localHistory) {
        const parsedHistory = JSON.parse(localHistory);
        // If we find an empty array in localStorage, respect that the history was cleared
        if (Array.isArray(parsedHistory) && parsedHistory.length === 0) {
          return [];
        }
        return parsedHistory.map((entry: any) => ({
          ...entry,
          surah: Number(entry.surah),
          verse: Number(entry.verse),
          timestamp: new Date(entry.timestamp)
        }));
      }

      // If no local history, try backend
      const token = await this.getToken();
      if (!token) return [];
      
      try {
        const response = await fetch(`${this.apiUrl}/users/${user.id}/reading-history`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const history = await response.json();
          // Cache in local storage
          localStorage.setItem(`reading_history_${user.id}`, JSON.stringify(history));
          return history.map((entry: any) => ({
            ...entry,
            surah: Number(entry.surah),
            verse: Number(entry.verse),
            timestamp: new Date(entry.timestamp)
          }));
        }
        // If we get a 404, it means the endpoint doesn't exist yet
        if (response.status === 404) {
          // Store empty array in localStorage to prevent future backend calls
          localStorage.setItem(`reading_history_${user.id}`, JSON.stringify([]));
          return [];
        }
      } catch (error) {
        console.warn('Error fetching reading history from backend (this is expected if the endpoint is not implemented yet):', error);
        // Store empty array in localStorage to prevent future backend calls
        localStorage.setItem(`reading_history_${user.id}`, JSON.stringify([]));
      }
    } catch (error) {
      console.error('Error fetching reading history:', error);
    }
    
    return [];
  }

  async subscribe(tier: PricingTier): Promise<void> {
    // TODO: Implement actual payment processing
    // This is a temporary mock implementation
    localStorage.setItem('isPremiumUser', 'true');
  }

  async isPremiumUser(): Promise<boolean> {
    return localStorage.getItem('isPremiumUser') === 'true';
  }

  // Save current route before navigation
  saveCurrentRoute(url: string, state?: any) {
    localStorage.setItem(this.LAST_ROUTE_KEY, url);
    if (state) {
      localStorage.setItem(this.ROUTE_STATE_KEY, JSON.stringify(state));
    }
  }

  // Get saved route
  getSavedRoute(): { url: string, state?: any } {
    const url = localStorage.getItem(this.LAST_ROUTE_KEY) || '/';
    let state: any;
    try {
      const savedState = localStorage.getItem(this.ROUTE_STATE_KEY);
      state = savedState ? JSON.parse(savedState) : undefined;
    } catch (e) {
      console.error('Error parsing saved route state:', e);
    }
    return { url, state };
  }

  // Clear saved route
  clearSavedRoute() {
    localStorage.removeItem(this.LAST_ROUTE_KEY);
    localStorage.removeItem(this.ROUTE_STATE_KEY);
  }

  // After successful authentication, restore the previous route
  async restoreRoute() {
    const { url, state } = this.getSavedRoute();
    this.clearSavedRoute();
    await this.router.navigateByUrl(url, { state });
  }

  // Get auth state as observable
  getAuthState(): Observable<boolean> {
    return this.authStateSubject.asObservable();
  }

  // Check if user is authenticated
  async checkAuthState(): Promise<boolean> {
    try {
      const token = await this.getToken();
      const isAuth = !!token;
      this.authStateSubject.next(isAuth);
      return isAuth;
    } catch (error) {
      this.authStateSubject.next(false);
      return false;
    }
  }

  // Handle login
  async login() {
    // Save current route before opening Clerk modal
    this.saveCurrentRoute(
      this.router.url,
      this.router.getCurrentNavigation()?.extras?.state
    );
    
    try {
      await this.ensureInitialized();
      if (!this.clerk) {
        throw new Error('Clerk not initialized');
      }
      
      // Open Clerk's sign in modal
      await this.clerk.openSignIn({
        redirectUrl: window.location.origin,
        appearance: {
          elements: {
            rootBox: {
              boxShadow: 'none',
            },
          },
        },
      });
    } catch (error) {
      console.error('Error opening Clerk sign in:', error);
    }
  }

  // Reset subscription status
  async resetSubscriptionStatus() {
    localStorage.removeItem('isPremiumUser');
    // You might want to also clear any other subscription-related data
    try {
      const user = this.userSubject.value;
      if (user && user.preferences) {
        delete user.preferences.subscriptionStatus;
        await this.saveUserPreferences(user.preferences);
      }
    } catch (error) {
      console.error('Error resetting subscription status:', error);
    }
  }

  // Handle logout
  async logout() {
    this.authStateSubject.next(false);
    // Implement your logout logic here
  }

  // Clear reading history
  async clearReadingHistory(): Promise<void> {
    const user = this.userSubject.value;
    if (!user) return;
    
    try {
      // Clear from local storage first
      localStorage.removeItem(`reading_history_${user.id}`);
      
      // Try to clear from backend, but don't throw if endpoint doesn't exist
      try {
        const token = await this.getToken();
        if (token) {
          await fetch(`${this.apiUrl}/users/${user.id}/reading-history`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
        }
      } catch (error) {
        // Log backend error but don't throw since we've already cleared local storage
        console.warn('Error clearing reading history from backend (this is expected if the endpoint is not implemented yet):', error);
      }

      // Set an empty array in local storage to prevent reloading from backend
      localStorage.setItem(`reading_history_${user.id}`, JSON.stringify([]));
    } catch (error) {
      console.error('Error clearing reading history:', error);
      throw error;
    }
  }

  // Update the resetAllUsersPremiumAccess method to use HTTP API
  async resetAllUsersPremiumAccess(): Promise<void> {
    try {
      const user = await firstValueFrom(this.user$);
      if (!user?.isAdmin) {
        throw new Error('Unauthorized: Only admins can reset user access');
      }

      const token = await this.getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      // Call the backend API to reset all users' premium access
      await this.http.post(`${this.apiUrl}/admin/reset-premium-access`, {}, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }).toPromise();

      // Clear all premium-related data from local storage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          // Clear isPremiumUser flag
          if (key === 'isPremiumUser') {
            localStorage.removeItem(key);
          }
          // Clear premium status from user preferences
          if (key.startsWith('user_prefs_')) {
            try {
              const prefs = JSON.parse(localStorage.getItem(key) || '{}');
              if (prefs.subscriptionStatus) {
                delete prefs.subscriptionStatus;
                localStorage.setItem(key, JSON.stringify(prefs));
              }
            } catch (error) {
              console.warn(`Error processing preferences for key ${key}:`, error);
            }
          }
        }
      }
      
      console.log('Successfully reset premium access for all users and cleared local storage');
    } catch (error) {
      console.error('Error resetting user premium access:', error);
      throw error;
    }
  }
}