import { Injectable } from '@angular/core';
import { FirebaseAuthService } from './firebase-auth.service';
import { Router } from '@angular/router';

interface AnonymousUserData {
  preferences: {
    theme: string;
    fontSize: number;
    translation: string;
    reciter: string;
    arabicFont?: string;
    showTranslation?: boolean;
  };
  sessionHistory: Array<{
    surah: number;
    verse: number;
    timestamp: number;
  }>;
  deviceId: string;
}

/**
 * Anonymous User Service
 * 
 * Manages state and preferences for users who browse without logging in.
 * Stores data in localStorage and provides migration to authenticated accounts.
 */
@Injectable({
  providedIn: 'root'
})
export class AnonymousUserService {
  private readonly STORAGE_KEY = 'nura_anonymous_user';
  private readonly DEVICE_ID_KEY = 'nura_device_id';

  constructor(
    private authService: FirebaseAuthService,
    private router: Router
  ) {}

  /**
   * Get or create a unique device ID for this browser
   */
  getDeviceId(): string {
    let deviceId = localStorage.getItem(this.DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = this.generateDeviceId();
      localStorage.setItem(this.DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  }

  /**
   * Generate a unique device ID
   */
  private generateDeviceId(): string {
    return 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Save user preferences to localStorage
   */
  savePreferences(preferences: Partial<AnonymousUserData['preferences']>): void {
    const data = this.getAnonymousData();
    data.preferences = { ...data.preferences, ...preferences };
    this.saveAnonymousData(data);
  }

  /**
   * Get saved preferences from localStorage
   */
  getPreferences(): AnonymousUserData['preferences'] {
    const data = this.getAnonymousData();
    return data.preferences;
  }

  /**
   * Add an entry to session history (not persisted long-term)
   */
  addToSessionHistory(surah: number, verse: number): void {
    const data = this.getAnonymousData();
    data.sessionHistory.push({
      surah,
      verse,
      timestamp: Date.now()
    });
    
    // Keep only last 50 entries to prevent localStorage overflow
    if (data.sessionHistory.length > 50) {
      data.sessionHistory = data.sessionHistory.slice(-50);
    }
    
    this.saveAnonymousData(data);
  }

  /**
   * Get session history
   */
  getSessionHistory(): AnonymousUserData['sessionHistory'] {
    const data = this.getAnonymousData();
    return data.sessionHistory;
  }

  /**
   * Migrate anonymous user data to authenticated user account
   * Called after successful signup/login
   */
  async migrateToAuthenticatedUser(): Promise<void> {
    const anonymousData = this.getAnonymousData();
    
    try {
      // Get current user
      const user = await this.authService.getCurrentUser();
      if (!user) {
        console.error('[AnonymousUserService] No authenticated user to migrate to');
        return;
      }

      console.log('[AnonymousUserService] Migrating anonymous data to user:', user.uid);

      // Save preferences to Firestore
      await this.authService.updateUserPreferences(anonymousData.preferences as any);

      // Clear anonymous data from localStorage
      this.clearAnonymousData();

      console.log('[AnonymousUserService] Successfully migrated anonymous data');
    } catch (error) {
      console.error('[AnonymousUserService] Error migrating anonymous data:', error);
      // Don't throw - migration failure shouldn't block login
    }
  }

  /**
   * Show a prompt encouraging the user to sign up
   */
  promptSignUp(feature: string, currentUrl: string = this.router.url): void {
    // Navigate to signup with return URL and feature context
    this.router.navigate(['/auth/signup'], {
      queryParams: { 
        returnUrl: currentUrl, 
        prompt: feature 
      }
    });
  }

  /**
   * Check if user has anonymous data (useful for showing migration prompts)
   */
  hasAnonymousData(): boolean {
    const data = localStorage.getItem(this.STORAGE_KEY);
    return !!data;
  }

  /**
   * Get all anonymous data
   */
  private getAnonymousData(): AnonymousUserData {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (error) {
        console.error('[AnonymousUserService] Error parsing stored data:', error);
      }
    }

    // Return default data structure
    return {
      preferences: {
        theme: 'light',
        fontSize: 24,
        translation: '20', // Sahih International
        reciter: 'ar.alafasy',
        arabicFont: 'uthmani',
        showTranslation: true
      },
      sessionHistory: [],
      deviceId: this.getDeviceId()
    };
  }

  /**
   * Save anonymous data to localStorage
   */
  private saveAnonymousData(data: AnonymousUserData): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('[AnonymousUserService] Error saving to localStorage:', error);
      // localStorage might be full or disabled
      // Could fallback to sessionStorage here if needed
    }
  }

  /**
   * Clear all anonymous data from localStorage
   */
  private clearAnonymousData(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }

  /**
   * Clear session history only (keep preferences)
   */
  clearSessionHistory(): void {
    const data = this.getAnonymousData();
    data.sessionHistory = [];
    this.saveAnonymousData(data);
  }
}
