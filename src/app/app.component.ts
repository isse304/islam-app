import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { ThemeService } from './services/theme.service';
import { CallInvitationListenerService } from './services/call-invitation-listener.service';
import { AnalyticsService } from './services/analytics.service';
import { Observable, Subject } from 'rxjs';
import { filter, map, startWith, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { ToastComponent } from './components/shared/toast/toast.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    HeaderComponent,
    ToastComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'IslamApp';
  showHeader$: Observable<boolean>;
  isHeaderVisible: boolean = true;
  private destroy$ = new Subject<void>();

  constructor(
    private themeService: ThemeService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private callInvitationListener: CallInvitationListenerService,
    // Constructed at bootstrap so page views are tracked on every route.
    private analytics: AnalyticsService
  ) {
    // Define routes where the header AND toggle should be hidden
    const authPath = '/auth';
    const rootPath = '/';

    const navigationEnd$ = this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    );

    const shouldShowHeader = (url: string): boolean => {
      const path = (url || '').split('?')[0];
      return path !== rootPath
        && !path.startsWith(authPath)
        && !path.startsWith('/tafsir/read');
    };

    this.isHeaderVisible = shouldShowHeader(this.router.url);

    this.showHeader$ = navigationEnd$.pipe(
      map(event => shouldShowHeader(event.urlAfterRedirects)),
      startWith(shouldShowHeader(this.router.url)),
      distinctUntilChanged()
    );

    // console.log('[AppComponent] ThemeService injected and initialized.');
  }

  ngOnInit(): void {
    // Theme preference is automatically loaded from localStorage by ThemeService constructor
    // No need to set it here - let user's saved preference take effect
    
    this.showHeader$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(isVisible => {
      this.isHeaderVisible = isVisible;
      this.cdr.markForCheck();
    });

    // Start listening for call invitations
    this.callInvitationListener.startListening();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    // Stop listening for call invitations
    this.callInvitationListener.stopListening();
  }
}
