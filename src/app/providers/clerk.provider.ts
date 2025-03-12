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
  // Using the standard Clerk script URL format
  private readonly CLERK_SCRIPT_URL = 'https://clerk.nura-ai.app/v1/script.js';

  async getClerk(): Promise<any> {
    if (this.clerk) {
      return this.clerk;
    }

    const publishableKey = environment.clerkPublishableKey;
    if (!publishableKey) {
      throw new Error('Clerk publishable key is not configured in environment');
    }

    try {
      console.log('Loading Clerk script from:', this.CLERK_SCRIPT_URL);
      // Load the script synchronously
      const script = document.createElement('script');
      script.src = this.CLERK_SCRIPT_URL;
      script.async = false;
      script.crossOrigin = 'anonymous';
      script.setAttribute('data-clerk-publishable-key', publishableKey);
      
      await new Promise<void>((resolve, reject) => {
        script.onload = () => {
          console.log('Clerk script loaded successfully');
          resolve();
        };
        script.onerror = (e) => {
          console.error('Failed to load Clerk script:', e);
          reject(new Error('Failed to load Clerk script'));
        };
        document.head.appendChild(script);
      });

      // Wait for Clerk to be available
      await new Promise<void>((resolve) => {
        const checkClerk = () => {
          if (window.Clerk) {
            console.log('Clerk object found in window');
            resolve();
          } else {
            console.log('Waiting for Clerk to be available...');
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