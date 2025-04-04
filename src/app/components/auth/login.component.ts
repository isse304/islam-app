import { Component, OnInit } from '@angular/core';
import { FirebaseAuthService } from '../../services/firebase-auth.service';

@Component({
  selector: 'app-login',
  template: `
    <div class="login-container">
      <!-- Your login form/UI here -->
      <!-- This component seems unused, consider removing it -->
    </div>
  `
})
export class LoginComponent implements OnInit {
  constructor(private authService: FirebaseAuthService) {}

  ngOnInit() {
    // Commenting out potentially outdated logic
    /*
    // Check if already authenticated
    this.authService.getAuthState().subscribe(isAuthenticated => {
      if (isAuthenticated) {
        // Restore previous route if authenticated
        this.authService.restoreRoute();
      }
    });
    */
  }

  async onLoginSuccess() {
    // Commenting out potentially outdated logic
    /*
    // After successful login
    await this.authService.restoreRoute();
    */
  }
} 