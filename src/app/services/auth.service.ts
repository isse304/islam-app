import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, of, from, throwError } from 'rxjs';
import { catchError, map, switchMap, take, tap } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

// Firebase imports
import { initializeApp } from 'firebase/app';
import {
  Auth,
  User as FirebaseUser,
  UserCredential,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  updateProfile,
  signInWithRedirect,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updateEmail,
  updatePassword,
  deleteUser
} from 'firebase/auth';

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
  private userSubject = new BehaviorSubject<AppUser | null>(null);
  private authStateSubject = new BehaviorSubject<boolean>(false);
  
  user$ = this.userSubject.asObservable();
  isLoggedIn$ = this.authStateSubject.asObservable();
  
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
    // Listen for authentication state changes
    onAuthStateChanged(this.auth, (firebaseUser) => {
      console.log('Firebase auth state changed:', !!firebaseUser);
      if (firebaseUser) {
        this.handleUserSignedIn(firebaseUser);
      } else {
        this.userSubject.next(null);
        this.authStateSubject.next(false);
      }
    });
  }

  // Convert Firebase user to our AppUser model
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
    // Map the Firebase user to our AppUser model
    const user = this.mapFirebaseUser(firebaseUser);
    
    try {
      // Fetch user preferences from your backend
      const preferences = await this.fetchUserPreferences(user.id);
      user.preferences = preferences;
      
      // Check if user is an admin (optional)
      const isAdmin = await this.checkIfUserIsAdmin(user.id);
      user.isAdmin = isAdmin;
      
      // Update the user subject
      this.userSubject.next(user);
      this.authStateSubject.next(true);
    } catch (error) {
      console.error('Error handling user sign in:', error);
      // Still set the user with basic data even if we couldn't fetch preferences
      this.userSubject.next(user);
      this.authStateSubject.next(true);
    }
  }

  private async fetchUserPreferences(userId: string): Promise<any> {
    try {
      const response = await this.http.get<any>(`${environment.apiUrl}/api/users/${userId}/preferences`).toPromise();
      return response || {};
    } catch (error) {
      console.error('Error fetching user preferences:', error);
      return {};
    }
  }

  private async checkIfUserIsAdmin(userId: string): Promise<boolean> {
    try {
      // First try to check from localStorage to avoid unnecessary API calls
      const cachedAdminStatus = localStorage.getItem(`admin_status_${userId}`);
      if (cachedAdminStatus) {
        return cachedAdminStatus === 'true';
      }
      
      // If no cached value, try the API
      try {
        const response = await this.http.get<{isAdmin: boolean}>(`${environment.apiUrl}/api/users/${userId}/admin-status`).toPromise();
        
        // Cache the result for 24 hours
        if (response) {
          localStorage.setItem(`admin_status_${userId}`, response.isAdmin ? 'true' : 'false');
        }
        
        return response?.isAdmin || false;
      } catch (apiError) {
        console.warn('Admin status API error, using fallback', apiError);
        
        // Use admin list from environment.ts
        const isAdmin = environment.adminUsers.includes(userId);
        
        // Cache the result
        localStorage.setItem(`admin_status_${userId}`, isAdmin ? 'true' : 'false');
        
        return isAdmin;
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }

  // Check auth state (used in guards and components)
  async checkAuthState(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const unsubscribe = onAuthStateChanged(this.auth, (user) => {
        unsubscribe(); // Stop listening after first response
        resolve(!!user);
      });
    });
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!this.auth.currentUser;
  }

  // Sign in with email and password
  signIn(email: string, password: string): Promise<AppUser> {
    return signInWithEmailAndPassword(this.auth, email, password)
      .then((userCredential) => {
        return this.mapFirebaseUser(userCredential.user);
      });
  }

  // Sign up with email and password
  signUp(email: string, password: string, firstName: string, lastName: string): Promise<AppUser> {
    return createUserWithEmailAndPassword(this.auth, email, password)
      .then(async (userCredential) => {
        // Update the user profile with display name
        await updateProfile(userCredential.user, {
          displayName: `${firstName} ${lastName}`
        });
        
        // Send email verification
        await sendEmailVerification(userCredential.user);
        
        // Return the user
        return this.mapFirebaseUser(userCredential.user);
      });
  }

  // Sign in with Google
  signInWithGoogle(): Promise<AppUser> {
    const provider = new GoogleAuthProvider();
    
    // Add scopes for better profile access
    provider.addScope('profile');
    provider.addScope('email');
    
    // Always prompt for account selection to avoid auto-login issues
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    
    console.log('Starting Google sign-in process');
    
    // More reliable implementation
    return signInWithPopup(this.auth, provider)
      .then((result) => {
        console.log('Google sign-in successful', result);
        return this.mapFirebaseUser(result.user);
      })
      .catch(error => {
        console.error('Google sign-in error:', error);
        
        // If popup fails, try redirect as fallback
        if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
          console.log('Popup blocked or closed, trying redirect...');
          
          // For redirect, we need to save current URL to return to after auth
          this.saveCurrentRoute();
          
          // Use redirect as fallback
          signInWithRedirect(this.auth, provider);
        }
        
        throw error;
      });
  }

  // Sign out
  async signOut(): Promise<void> {
    await signOut(this.auth);
    this.userSubject.next(null);
    this.authStateSubject.next(false);
    this.router.navigate(['/']);
  }

  // Reset password
  resetPassword(email: string): Promise<void> {
    return sendPasswordResetEmail(this.auth, email);
  }

  // Update user profile
  async updateUserProfile(displayName?: string, photoURL?: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('No authenticated user');
    
    await updateProfile(user, {
      displayName: displayName || user.displayName,
      photoURL: photoURL || user.photoURL
    });
    
    // Update the current user in state
    this.handleUserSignedIn(user);
  }

  // Change email
  async changeEmail(newEmail: string, password: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user || !user.email) throw new Error('No authenticated user');
    
    // Re-authenticate the user
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);
    
    // Update email
    await updateEmail(user, newEmail);
    
    // Update the current user in state
    this.handleUserSignedIn(user);
  }

  // Change password
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user || !user.email) throw new Error('No authenticated user');
    
    // Re-authenticate the user
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    
    // Update password
    await updatePassword(user, newPassword);
  }

  // Delete account
  async deleteAccount(password: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user || !user.email) throw new Error('No authenticated user');
    
    // Re-authenticate the user
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);
    
    // Delete the user
    await deleteUser(user);
    this.userSubject.next(null);
    this.authStateSubject.next(false);
    this.router.navigate(['/']);
  }

  // Update user preferences
  async updateUserPreferences(preferences: any): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('No authenticated user');
    
    // Update preferences on your backend
    await this.http.put(`${environment.apiUrl}/api/users/${user.uid}/preferences`, preferences).toPromise();
    
    // Update the current user in the state
    const currentUser = this.userSubject.value;
    if (currentUser) {
      this.userSubject.next({
        ...currentUser,
        preferences: {...currentUser.preferences, ...preferences}
      });
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
}