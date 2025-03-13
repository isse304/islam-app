import { Component, ElementRef, ViewChild, NgZone } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-auth-buttons',
  template: `
    <div class="auth-buttons">
      <ng-container *ngIf="(authService.isLoggedIn$ | async) === false; else loggedIn">
        <button (click)="authService.openSignIn()" 
                class="btn-signin"
                #signInButton
                aria-label="Sign In">
          <i class="fas fa-sign-in-alt mr-2" 
             aria-hidden="true" 
             tabindex="-1"></i>
          <span>Sign In</span>
        </button>
        <button (click)="authService.openSignUp()"
                class="btn-signup"
                #signUpButton
                aria-label="Sign Up">
          <i class="fas fa-user-plus mr-2" 
             aria-hidden="true" 
             tabindex="-1"></i>
          <span>Sign Up</span>
        </button>
      </ng-container>
      
      <ng-template #loggedIn>
        <div class="user-profile">
          <button *ngIf="authService.user$ | async as user" 
                  class="user-info" 
                  (click)="navigateToProfile()"
                  #userInfo>
            <img *ngIf="user.imageUrl" 
                 [src]="user.imageUrl" 
                 class="user-avatar" 
                 alt=""
                 role="presentation">
            <span class="user-name">{{ user.firstName || user.email }}</span>
          </button>
          <button (click)="signOut()"
                  class="btn-signout"
                  #signOutButton
                  aria-label="Sign Out">
            <i class="fas fa-sign-out-alt mr-2" 
               aria-hidden="true" 
               tabindex="-1"></i>
            <span>Sign Out</span>
          </button>
        </div>
      </ng-template>
    </div>
  `,
  styles: [`
    .auth-buttons {
      display: flex;
      gap: 1rem;
      align-items: center;
    }
    
    .btn-signin, .btn-signup, .btn-signout {
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 120px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      border: none;
      outline: none;
    }
    
    .btn-signin {
      background-color: #B7A57A;
      color: white;
    }
    
    .btn-signin:hover, .btn-signin:focus {
      background-color: #9b8a65;
      transform: translateY(-1px);
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .btn-signup, .btn-signout {
      background-color: white;
      color: #B7A57A;
      border: 2px solid #B7A57A;
    }
    
    .btn-signup:hover, .btn-signup:focus,
    .btn-signout:hover, .btn-signout:focus {
      background-color: #f8f4eb;
      transform: translateY(-1px);
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .user-profile {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    
    .user-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      cursor: pointer;
      padding: 0.5rem;
      border-radius: 0.5rem;
      transition: background-color 0.2s ease;
      outline: none;
      background: none;
      border: none;
      color: inherit;
      font: inherit;
      width: auto;
    }
    
    .user-info:hover, .user-info:focus {
      background-color: #f8f4eb;
    }
    
    .user-avatar {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid #B7A57A;
    }
    
    .user-name {
      font-size: 0.95rem;
      color: #4b5563;
      max-width: 150px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 500;
    }
    
    @media (max-width: 768px) {
      .auth-buttons {
        width: 100%;
        flex-direction: column;
      }
      
      .user-profile {
        flex-direction: column;
        width: 100%;
      }
      
      .btn-signin, .btn-signup, .btn-signout {
        width: 100%;
        margin-bottom: 0.5rem;
      }
      
      .user-info {
        width: 100%;
        justify-content: center;
      }
    }
  `]
})
export class AuthButtonsComponent {
  @ViewChild('signInButton') signInButton!: ElementRef;
  @ViewChild('signUpButton') signUpButton!: ElementRef;
  @ViewChild('signOutButton') signOutButton!: ElementRef;
  @ViewChild('userInfo') userInfo!: ElementRef;

  constructor(
    public authService: AuthService,
    private router: Router,
    private ngZone: NgZone
  ) {}
  
  navigateToProfile() {
    this.router.navigate(['/profile']);
  }

  async signOut() {
    console.log('Sign out button clicked');
    try {
      await this.authService.signOut();
      console.log('Sign out successful');
      // Force reload the page to clear any cached state
      window.location.href = '/';
    } catch (error) {
      console.error('Error during sign out:', error);
      // Attempt direct Clerk signOut as fallback
      try {
        await window.Clerk?.signOut();
        window.location.href = '/';
      } catch (clerkError) {
        console.error('Clerk direct sign out failed:', clerkError);
      }
    }
  }
}