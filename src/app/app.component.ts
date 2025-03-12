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
  initAttempts = 0;
  maxAttempts = 3;

  constructor(private clerkProvider: ClerkProvider) {}

  async ngOnInit() {
    await this.initializeClerk();
  }

  async initializeClerk() {
    this.isLoading = true;
    this.initError = null;
    this.initAttempts++;
    
    try {
      console.log(`Attempt ${this.initAttempts} to initialize Clerk...`);
      await this.clerkProvider.getClerk();
      console.log('Clerk initialized successfully');
      this.isLoading = false;
      this.initAttempts = 0; // Reset attempts on success
    } catch (error) {
      console.error('Error initializing Clerk:', error);
      
      if (this.initAttempts < this.maxAttempts) {
        console.log(`Retrying in 2 seconds... (Attempt ${this.initAttempts} of ${this.maxAttempts})`);
        setTimeout(() => this.initializeClerk(), 2000);
      } else {
        this.initError = error instanceof Error ? error.message : 'Unknown error initializing Clerk';
        this.isLoading = false;
        console.error('Max retry attempts reached');
      }
    }
  }

  async retryInitialization() {
    this.initAttempts = 0; // Reset attempts for manual retry
    await this.initializeClerk();
  }
}
