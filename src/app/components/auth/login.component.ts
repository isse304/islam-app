import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  template: `
    <div class="login-container">
      <!-- Your login form/UI here -->
    </div>
  `
})
export class LoginComponent implements OnInit {
  constructor(private authService: AuthService) {}

  ngOnInit() {
    // Check if already authenticated
    this.authService.getAuthState().subscribe(isAuthenticated => {
      if (isAuthenticated) {
        // Restore previous route if authenticated
        this.authService.restoreRoute();
      }
    });
  }

  async onLoginSuccess() {
    // After successful login
    await this.authService.restoreRoute();
  }
} 