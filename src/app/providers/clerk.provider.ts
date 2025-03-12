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
  // Remove the hardcoded URL as we're using the script tag in index.html
  // private readonly CLERK_SCRIPT_URL = 'https://clerk.nura-ai.app/npm/@clerk/clerk-js@5/dist/clerk.browser.js';

  async getClerk(): Promise<any> {
    if (this.clerk) {
      return this.clerk;
    }

    try {
      console.log('Waiting for Clerk to be available...');
      // Wait for Clerk to be available with a timeout
      await new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 100; // 10 seconds total (100ms * 100) - increased timeout
        
        const checkClerk = () => {
          attempts++;
          if (window.Clerk) {
            console.log('Clerk object found in window');
            resolve();
          } else if (attempts >= maxAttempts) {
            console.error('Clerk not found after maximum attempts. Ensure the Clerk script is properly loaded.');
            reject(new Error('Timeout waiting for Clerk to load'));
          } else {
            if (attempts % 10 === 0) { // Log only every 10 attempts to reduce console noise
              console.log(`Waiting for Clerk (attempt ${attempts}/${maxAttempts})...`);
            }
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