import { Component, OnInit, OnDestroy, ViewEncapsulation, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { Observable, Subject } from 'rxjs';
import { filter, takeUntil, map } from 'rxjs/operators';
import { FirebaseAuthService } from '../../services/firebase-auth.service';
import { AuthButtonsComponent } from '../../auth-buttons/auth-buttons.component';
import { ThemeService } from '../../services/theme.service';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { NotificationService } from 'src/app/services/notification.service';
import { Notification } from 'src/app/models/classroom.models';
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
    MatMenuModule,
    MatIconModule,
    MatBadgeModule,
    ThemeToggleComponent,
  ]
})
export class HeaderComponent implements OnInit, OnDestroy {
  isMobileMenuOpen = false;
  isLandingPage = false;
  isAuthenticated = false;
  isPremiumUser = false;
  userRole: 'teacher' | 'student' | 'parent' | undefined;
  private routerSubscription: Subject<void> | undefined;
  private authSubscription: Subject<void> | undefined;
  showHeader = true;
  public currentTheme$: Observable<string>;
  public theme: string = 'light';
  notifications$!: Observable<Notification[]>;
  unreadCount$!: Observable<number>;

  constructor(
    public authService: FirebaseAuthService,
    private router: Router,
    private ngZone: NgZone,
    public themeService: ThemeService,
    private notificationService: NotificationService,
  ) {
    // console.log('[HeaderComponent] Constructor: Initializing...');
    this.currentTheme$ = this.themeService.currentTheme$;
  }

  ngOnInit(): void {
    // Subscribe to route changes for header visibility
    this.routerSubscription = new Subject<void>();
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntil(this.routerSubscription)
    ).subscribe(event => {
      if (event instanceof NavigationEnd) {
        // console.log(`[HeaderComponent] NavigationEnd: ${event.url}`);
        this.updateHeaderVisibility(event.url);
        this.closeMobileMenu();
      }
    });

    // Subscribe to auth state for authentication and premium status
    this.authSubscription = new Subject<void>();
    this.authService.user$.pipe(
      takeUntil(this.authSubscription)
    ).subscribe(user => {
      this.isAuthenticated = !!user;
      this.isPremiumUser = user?.isPremium ?? false;
      this.userRole = user?.role;
      this.updateHeaderVisibility(this.router.url);
    });

    // Initial check in case user is already logged in and on a specific page
    // console.log('[HeaderComponent] ngOnInit: Checking initial route.');
    this.updateHeaderVisibility(this.router.url);
    
    // Use real-time notifications
    this.notifications$ = this.notificationService.listenToMyNotifications();
    this.unreadCount$ = this.notificationService.getUnreadCount();
  }

  ngOnDestroy(): void {
    if (this.routerSubscription) {
      this.routerSubscription.next();
      this.routerSubscription.complete();
    }
    if (this.authSubscription) {
      this.authSubscription.next();
      this.authSubscription.complete();
    }
  }

  private updateHeaderVisibility(url: string): void {
    const previousLandingPageState = this.isLandingPage;
    // Hide header on landing page and auth pages *only* when not authenticated
    // Note: '/' now redirects to '/home', so we only hide on '/landing' and '/auth/' for anonymous users
    this.isLandingPage = !this.isAuthenticated && (
      url === '/landing' ||
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

  async markAsRead(notification: Notification) {
    // Mark as read
    if (!notification.read) {
      await this.notificationService.markAsRead(notification.id);
    }
    
    // Navigate to relevant location
    this.navigateToNotification(notification);
  }

  navigateToNotification(notification: Notification) {
    if (!notification.ref) return;

    switch (notification.type) {
      case 'assignment_posted':
        // Navigate to assignments page
        if (this.userRole === 'student') {
          this.router.navigate(['/s/assignments']);
        } else if (this.userRole === 'teacher') {
          this.router.navigate(['/t/classes']);
        }
        break;
      
      case 'submission_received':
        // Navigate to teacher dashboard
        if (this.userRole === 'teacher') {
          this.router.navigate(['/t/classes']);
        }
        break;
      
      case 'graded':
        // Navigate to student assignments to see graded work
        if (this.userRole === 'student') {
          this.router.navigate(['/s/assignments']);
        }
        break;
      
      case 'due_soon':
        // Navigate to assignments
        if (this.userRole === 'student') {
          this.router.navigate(['/s/assignments']);
        }
        break;
      
      case 'comment':
        // Navigate based on user role
        if (this.userRole === 'student') {
          this.router.navigate(['/s/assignments']);
        } else if (this.userRole === 'teacher') {
          this.router.navigate(['/t/classes']);
        }
        break;
      
      default:
        console.log('Unknown notification type:', notification.type);
    }
  }

  async deleteNotification(event: Event, notificationId: string) {
    event.stopPropagation(); // Prevent marking as read
    await this.notificationService.deleteNotification(notificationId);
  }

  async clearAllNotifications() {
    if (confirm('Are you sure you want to clear all notifications?')) {
      await this.notificationService.clearAllNotifications();
    }
  }

  getNotificationTime(notification: Notification): string {
    if (!notification.createdAt) return '';
    
    const notifDate = notification.createdAt.toDate();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const notifDay = new Date(notifDate.getFullYear(), notifDate.getMonth(), notifDate.getDate());
    
    const diffMs = today.getTime() - notifDay.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    // Format time
    const timeStr = notifDate.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    
    // Same day - show only time
    if (diffDays === 0) {
      return timeStr;
    }
    
    // Yesterday
    if (diffDays === 1) {
      return `Yesterday, ${timeStr}`;
    }
    
    // This week
    if (diffDays < 7) {
      const dayName = notifDate.toLocaleDateString('en-US', { weekday: 'long' });
      return `${dayName}, ${timeStr}`;
    }
    
    // Older - show full date
    const dateStr = notifDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: notifDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
    return `${dateStr}, ${timeStr}`;
  }
}
