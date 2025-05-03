import { Component, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter, map, tap } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { FirebaseAuthService } from '../../services/firebase-auth.service';
import { AuthButtonsComponent } from '../../auth-buttons/auth-buttons.component';
import { NgZone } from '@angular/core';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  encapsulation: ViewEncapsulation.None,
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    AuthButtonsComponent,
    ThemeToggleComponent
  ]
})
export class HeaderComponent implements OnInit, OnDestroy {
  isMobileMenuOpen = false;
  isLandingPage = false;
  isAuthenticated = false;
  isPremiumUser = false;
  private routerSubscription: Subscription | undefined;
  private authSubscription: Subscription | undefined;
  showHeader = true;

  constructor(
    public authService: FirebaseAuthService,
    private router: Router,
    private ngZone: NgZone
  ) {
    // console.log('[HeaderComponent] Constructor: Initializing...');
  }

  ngOnInit(): void {
    // Subscribe to route changes for header visibility
    this.routerSubscription = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      tap(event => {
        if (event instanceof NavigationEnd) {
          // console.log(`[HeaderComponent] NavigationEnd: ${event.url}`);
          this.updateHeaderVisibility(event.url);
          this.closeMobileMenu();
        }
      })
    ).subscribe();

    // Subscribe to auth state for authentication and premium status
    this.authSubscription = this.authService.user$.pipe(
      tap(user => {
        this.isAuthenticated = !!user;
        this.isPremiumUser = user?.isPremium ?? false;
        this.updateHeaderVisibility(this.router.url);
      })
    ).subscribe();

    // Initial check in case user is already logged in and on a specific page
    // console.log('[HeaderComponent] ngOnInit: Checking initial route.');
    this.updateHeaderVisibility(this.router.url);
  }

  ngOnDestroy(): void {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
  }

  private updateHeaderVisibility(url: string): void {
    const previousLandingPageState = this.isLandingPage;
    // Hide header on landing page and auth pages *only* when not authenticated
    this.isLandingPage = !this.isAuthenticated && (
      url === '/landing' ||
      url === '/' ||
      url.startsWith('/auth/')
    );
    // console.log(`[HeaderComponent] updateHeaderVisibility: URL='${url}', isAuthenticated=${this.isAuthenticated}, Calculated isLandingPage=${this.isLandingPage}`);

    // Logic: Show header if (user is authenticated) OR (user is not authenticated AND not on a landing/auth page)
    this.showHeader = this.isAuthenticated || (!this.isAuthenticated && !this.isLandingPage);
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen = false;
  }
}
