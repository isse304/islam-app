import { Component, OnInit, OnDestroy, Renderer2, Inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { RouterOutlet, Router, NavigationEnd, Event as NavigationEvent, ActivatedRoute } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { FirebaseAuthService } from './services/firebase-auth.service';
import { ThemeService } from './services/theme.service';
import { Subscription, Observable, timer, combineLatest, of, Subject } from 'rxjs';
import { filter, map, startWith, switchMap, take, tap, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ThemeToggleComponent } from './components/theme-toggle/theme-toggle.component';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { MatSnackBar } from '@angular/material/snack-bar';

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
    ThemeToggleComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'IslamApp';
  displayLoading$: Observable<boolean>;
  showHeader$: Observable<boolean>;
  showThemeToggle$: Observable<boolean>;
  isHeaderVisible: boolean = true;
  private destroy$ = new Subject<void>();
  private minLoadingTime = 1500;

  constructor(
    private authService: FirebaseAuthService,
    private themeService: ThemeService,
    private router: Router,
    private route: ActivatedRoute,
    private swUpdate: SwUpdate,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {
    const authIsLoading$ = this.authService.isLoading$;

    const minDisplayTime$ = timer(this.minLoadingTime).pipe(map(() => false), startWith(true));

    this.displayLoading$ = combineLatest([authIsLoading$, minDisplayTime$]).pipe(
      map(([authLoading, timerRunning]) => authLoading || timerRunning),
      startWith(true)
    );

    const hiddenRoutes = ['/landing', '/auth'];

    const navigationEnd$ = this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    );

    this.showHeader$ = navigationEnd$.pipe(
      map(event => !event.urlAfterRedirects.startsWith('/auth')),
      startWith(!this.router.url.startsWith('/auth')),
      distinctUntilChanged()
    );

    this.showThemeToggle$ = this.showHeader$;

    console.log('[AppComponent] ThemeService injected and initialized.');
  }

  ngOnInit(): void {
    this.themeService.setThemePreference('system');
    
    this.showHeader$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(isVisible => {
      this.isHeaderVisible = isVisible;
      this.cdr.markForCheck();
    });

    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(
          filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'),
          takeUntil(this.destroy$)
        )
        .subscribe(evt => {
          console.log(`New version available: ${evt.latestVersion.hash}. Current version: ${evt.currentVersion.hash}.`);
          const snackBarRef = this.snackBar.open('New version available!', 'Reload', {
            duration: 10000
          });
          snackBarRef.onAction().subscribe(() => {
            document.location.reload();
          });
        });
        
      this.swUpdate.checkForUpdate().then(updateFound => {
         console.log(updateFound ? 'Service worker update found on check.' : 'Service worker is up to date on check.');
      }).catch(err => {
         console.error('Service worker check failed:', err);
      });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private shouldShowHeader(url: string): boolean {
    return !(url === '/' || url.startsWith('/auth'));
  }
}
