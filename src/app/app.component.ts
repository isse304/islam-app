import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { FirebaseAuthService } from './services/firebase-auth.service';
import { ThemeService } from './services/theme.service';
import { Observable, timer, combineLatest, Subject } from 'rxjs';
import { filter, map, startWith, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
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
    MatProgressSpinnerModule,
    ToastComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'IslamApp';
  displayLoading$: Observable<boolean>;
  showHeader$: Observable<boolean>;
  isHeaderVisible: boolean = true;
  private destroy$ = new Subject<void>();
  private minLoadingTime = 1500;

  constructor(
    private authService: FirebaseAuthService,
    private themeService: ThemeService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    const authIsLoading$ = this.authService.isLoading$;

    const minDisplayTime$ = timer(this.minLoadingTime).pipe(map(() => false), startWith(true));

    this.displayLoading$ = combineLatest([authIsLoading$, minDisplayTime$]).pipe(
      map(([authLoading, timerRunning]) => authLoading || timerRunning),
      startWith(true)
    );

    // Define routes where the header AND toggle should be hidden
    const authPath = '/auth';
    const rootPath = '/';

    const navigationEnd$ = this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    );

    this.showHeader$ = navigationEnd$.pipe(
      map(event => {
        const url = event.urlAfterRedirects;
        // Show header if URL is NOT exactly root AND does NOT start with /auth
        return url !== rootPath && !url.startsWith(authPath);
      }),
      // Set initial state based on the current URL
      startWith(this.router.url !== rootPath && !this.router.url.startsWith(authPath)),
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
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
