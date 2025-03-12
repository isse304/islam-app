import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

declare global {
  interface Window {
    Clerk: any;
  }
}

@Injectable({ providedIn: 'root' })
export class ClerkProvider {
  private clerk: any | null = null;
  private readonly CLERK_SCRIPT_URL = 'https://robust-crawdad-47.clerk.accounts.dev/npm/@clerk/clerk-js@5/dist/clerk.browser.js';

  async getClerk(): Promise<any> {
    if (this.clerk) {
      return this.clerk;
    }

    const publishableKey = environment.clerkPublishableKey;
    if (!publishableKey) {
      throw new Error('Clerk publishable key is not configured in environment');
    }

    try {
      // Load the script synchronously
      const script = document.createElement('script');
      script.src = this.CLERK_SCRIPT_URL;
      script.async = false;
      script.crossOrigin = 'anonymous';
      script.setAttribute('data-clerk-publishable-key', publishableKey);
      
      await new Promise<void>((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Clerk script'));
        document.head.appendChild(script);
      });

      // Wait for Clerk to be available
      await new Promise<void>((resolve) => {
        const checkClerk = () => {
          if (window.Clerk) {
            resolve();
          } else {
            setTimeout(checkClerk, 50);
          }
        };
        checkClerk();
      });

      // Get the initialized Clerk instance
      this.clerk = window.Clerk;
      console.log('Clerk initialized successfully');
      return this.clerk;
    } catch (error) {
      console.error('Error initializing Clerk:', error);
      throw error;
    }
  }
} 