import { Component, OnInit } from '@angular/core';
import { FirebaseAuthService } from './services/firebase-auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'IslamApp';
  isLoading = false;

  constructor(
    private authService: FirebaseAuthService,
    private router: Router
  ) {}

  ngOnInit() {
    // Check for redirect result from Google auth
    this.handleAuthRedirect();
  }

  private async handleAuthRedirect() {
    try {
      const result = await this.authService.handleRedirectResult();
      if (result && result.user) {
        console.log('Successfully signed in after redirect');
        // Navigate to home or saved route
        this.authService.navigateToSavedRoute();
      }
    } catch (error) {
      console.error('Error handling auth redirect:', error);
    }
  }
}
