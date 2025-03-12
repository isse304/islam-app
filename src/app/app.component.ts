import { Component, OnInit } from '@angular/core';
import { ClerkProvider } from './providers/clerk.provider';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'IslamApp';
  initError: string | null = null;
  isLoading = true;

  constructor(private clerkProvider: ClerkProvider) {}

  async ngOnInit() {
    await this.initializeClerk();
  }

  async initializeClerk() {
    this.isLoading = true;
    this.initError = null;
    
    try {
      console.log('Starting Clerk initialization...');
      await this.clerkProvider.getClerk();
      console.log('Clerk initialized successfully');
      this.isLoading = false;
    } catch (error) {
      this.initError = error instanceof Error ? error.message : 'Unknown error initializing Clerk';
      console.error('Error initializing Clerk:', error);
      this.isLoading = false;
      
      // Add this to help debug in production
      const errorElement = document.createElement('div');
      errorElement.style.position = 'fixed';
      errorElement.style.top = '0';
      errorElement.style.left = '0';
      errorElement.style.right = '0';
      errorElement.style.padding = '20px';
      errorElement.style.background = 'rgba(255, 0, 0, 0.8)';
      errorElement.style.color = 'white';
      errorElement.style.zIndex = '9999';
      errorElement.textContent = `Initialization Error: ${this.initError}`;
      document.body.appendChild(errorElement);
    }
  }

  async retryInitialization() {
    await this.initializeClerk();
  }
}
