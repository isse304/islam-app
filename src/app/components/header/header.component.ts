import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { FirebaseAuthService } from '../../services/firebase-auth.service';
import { AuthButtonsComponent } from '../../auth-buttons/auth-buttons.component';
import { NgZone } from '@angular/core';
import { SubscriptionService } from '../../services/subscription.service';
import { tap } from 'rxjs/operators';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    AuthButtonsComponent
  ]
})
export class HeaderComponent implements OnInit, OnDestroy {
  isMobileMenuOpen = false;
  isLandingPage = false;
  isAuthenticated = false;
  private routerSubscription: Subscription;
  private authSubscription: Subscription;
  user: any;
  showHeader = true;

  constructor(
    public authService: FirebaseAuthService,
    private router: Router,
    private ngZone: NgZone,
    private subscriptionService: SubscriptionService
  ) {
    // console.log('[HeaderComponent] Constructor: Initializing...');
    // Subscribe to route changes
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event) => {
        if (event instanceof NavigationEnd) {
          // console.log(`[HeaderComponent] NavigationEnd: ${event.url}`);
          this.updateHeaderVisibility(event.url);
          this.closeMobileMenu();
        }
      });

    // Subscribe to auth state
    this.authSubscription = this.authService.user$.subscribe(user => {
      const wasAuthenticated = this.isAuthenticated;
      this.isAuthenticated = !!user;
      this.user = user;
      // console.log(`[HeaderComponent] Auth State Changed: User ${user ? 'detected' : 'null'}. isAuthenticated = ${this.isAuthenticated}`);
      this.updateHeaderVisibility(this.router.url);
    });
  }

  ngOnInit(): void {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      tap(event => {
        if (event instanceof NavigationEnd) {
          // console.log(`[HeaderComponent] NavigationEnd: ${event.url}`);
          this.updateHeaderVisibility(event.url);
        }
      })
    ).subscribe();

    this.authService.user$.pipe(
      tap(user => {
        this.isAuthenticated = !!user;
        this.user = user;
        // console.log(`[HeaderComponent] Auth State Changed: User ${user ? 'detected' : 'null'}. isAuthenticated = ${this.isAuthenticated}`);
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
    // Hide header on landing page and auth pages when not authenticated
    this.isLandingPage = !this.isAuthenticated && (
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
