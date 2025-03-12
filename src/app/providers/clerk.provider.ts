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
      
      // Check if the script is actually loaded
      const scriptLoaded = Array.from(document.scripts).some(script => 
        script.src.includes('clerk.js') || script.src.includes('clerk') || script.dataset['clerkPublishableKey']
      );
      
      if (!scriptLoaded) {
        console.warn('Clerk script tag not found in document. Adding it dynamically...');
        this.loadClerkScriptDynamically();
      }
      
      // Wait for Clerk to be available with a timeout
      await new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 150; // 15 seconds total (100ms * 150) - increased timeout
        
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
  
  // Add this method to dynamically load Clerk script if needed
  private loadClerkScriptDynamically(): void {
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset['clerkPublishableKey'] = environment.clerkPublishableKey;
    script.src = 'https://cdn.clerk.dev/v1/clerk.js';
    script.type = 'text/javascript';
    
    script.onload = () => console.log('Clerk script dynamically loaded');
    script.onerror = (event) => console.error('Error loading Clerk script dynamically:', event);
    
    document.head.appendChild(script);
  }
} 