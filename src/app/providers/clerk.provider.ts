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
  private readonly CLERK_SCRIPT_URL = 'https://clerk.nura-ai.app/npm/@clerk/clerk-js@5/dist/clerk.browser.js';

  async getClerk(): Promise<any> {
    if (this.clerk) {
      return this.clerk;
    }

    try {
      console.log('Waiting for Clerk to be available...');
      // Wait for Clerk to be available with a timeout
      await new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds total (100ms * 50)
        
        const checkClerk = () => {
          attempts++;
          if (window.Clerk) {
            console.log('Clerk object found in window');
            resolve();
          } else if (attempts >= maxAttempts) {
            reject(new Error('Timeout waiting for Clerk to load'));
          } else {
            console.log(`Waiting for Clerk (attempt ${attempts}/${maxAttempts})...`);
            setTimeout(checkClerk, 100);
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