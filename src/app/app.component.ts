import { Component, OnInit } from '@angular/core';
import { ClerkProvider } from './providers/clerk.provider';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'IslamApp';

  constructor(private clerkProvider: ClerkProvider) {}

  async ngOnInit() {
    try {
      await this.clerkProvider.getClerk();
      console.log('Clerk initialized successfully');
    } catch (error) {
      console.error('Error initializing Clerk:', error);
    }
  }
}
