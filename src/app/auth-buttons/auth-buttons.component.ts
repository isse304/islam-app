import { Component, ElementRef, ViewChild, NgZone, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FirebaseAuthService } from '../services/firebase-auth.service';
import { Router } from '@angular/router';
import { BehaviorSubject, Subscription, timer } from 'rxjs';
import { take } from 'rxjs/operators';
import { AuthStateService } from '../services/auth-state.service';

@Component({
  selector: 'app-auth-buttons',
  template: `
    <div class="auth-buttons">
      <!-- Loading state while auth state is being determined -->
      <ng-container *ngIf="isLoading; else authButtons">
        <div class="loading-btn">
          <div class="spinner"></div>
        </div>
      </ng-container>
      
      <ng-template #authButtons>
        <ng-container *ngIf="(authService.isLoggedIn$ | async) === false; else loggedIn">
          <button (click)="openSignIn()" 
                  class="btn-signin"
                  #signInButton
                  aria-label="Sign In">
            <i class="fas fa-sign-in-alt mr-2" 
               aria-hidden="true" 
               tabindex="-1"></i>
            <span>Sign In</span>
          </button>
          <button (click)="openSignUp()"
                  class="btn-signup"
                  #signUpButton
                  aria-label="Sign Up">
            <i class="fas fa-user-plus mr-2" 
               aria-hidden="true" 
               tabindex="-1"></i>
            <span>Sign Up</span>
          </button>
        </ng-container>
      </ng-template>
      
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
    
    .loading-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 120px;
      height: 40px;
    }
    
    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid rgba(183, 165, 122, 0.3);
      border-radius: 50%;
      border-top-color: #B7A57A;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
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
  `],
  standalone: true,
  imports: [CommonModule, RouterModule]
})
export class AuthButtonsComponent implements OnInit, OnDestroy {
  @ViewChild('signInButton') signInButton!: ElementRef;
  @ViewChild('signUpButton') signUpButton!: ElementRef;
  @ViewChild('signOutButton') signOutButton!: ElementRef;
  @ViewChild('userInfo') userInfo!: ElementRef;
  
  isLoading = true;
  private subscriptions: Subscription[] = [];
  private minLoadingTime = 500; // Minimum time to show loading state in ms

  constructor(
    public authService: FirebaseAuthService,
    private router: Router,
    private zone: NgZone,
    private authStateService: AuthStateService
  ) {}
  
  ngOnInit() {
    // First check if we have a cached user for immediate response
    this.checkCachedUser();
    
    // Set up subscriptions array for cleanup
    const subscriptions: Subscription[] = [];
    
    // Subscribe to auth state changes
    subscriptions.push(
        this.authService.user$.subscribe(user => {
            this.zone.run(() => {
                // Update loading state based on auth response
                this.isLoading = false;
                
                // If we have a user, ensure authenticated state is set
                if (user) {
                    localStorage.setItem('isAuthenticated', 'true');
                }
            });
        })
    );
    
    // Set a maximum loading time
    subscriptions.push(
        timer(2000).subscribe(() => {
            this.zone.run(() => {
                // Force hide loading after maximum time
                this.isLoading = false;
            });
        })
    );
    
    // Store subscriptions for cleanup
    this.subscriptions = subscriptions;
  }
  
  private checkCachedUser() {
    try {
        const cachedUser = localStorage.getItem('currentUser');
        const isAuthenticated = localStorage.getItem('isAuthenticated');
        
        if (cachedUser && isAuthenticated === 'true') {
            // If we have valid cached data, hide loading faster
            this.zone.run(() => {
                timer(300).pipe(take(1)).subscribe(() => {
                    this.isLoading = false;
                });
            });
        }
    } catch (error) {
        // Ignore localStorage errors
        console.warn('Error checking cached user:', error);
    }
  }

  ngOnDestroy() {
    // Clean up subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
  
  navigateToProfile() {
    this.router.navigate(['/profile']);
  }

  // Navigate to sign in page
  openSignIn() {
    this.router.navigate(['/auth/login']);
  }

  // Navigate to sign up page
  openSignUp() {
    this.router.navigate(['/auth/signup']);
  }

  async signOut() {
    try {
        // Show loading state
        this.isLoading = true;
        
        // Need a small delay to ensure loading state is visible
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await this.authService.signOut();
        
        // Force UI update after sign out
        this.zone.run(() => {
            // Reset loading state
            this.isLoading = false;
            
            // Clear any cached auth state
            localStorage.removeItem('isAuthenticated');
            
            // Navigate to home page
            this.router.navigate(['/']);
        });
    } catch (error) {
        console.error('Error signing out:', error);
        // Ensure loading state is reset even on error
        this.zone.run(() => {
            this.isLoading = false;
        });
    }
  }
}