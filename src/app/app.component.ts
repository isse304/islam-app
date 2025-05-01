import { Component, OnInit, OnDestroy, Renderer2, Inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { FirebaseAuthService } from './services/firebase-auth.service';
import { ThemeService } from './services/theme.service';
import { Subscription, Observable, timer, combineLatest, of } from 'rxjs';
import { filter, map, startWith, switchMap, take, tap } from 'rxjs/operators';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ThemeToggleComponent } from './components/theme-toggle/theme-toggle.component';

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
  ]
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'IslamApp';
  displayLoading$: Observable<boolean>;
  showHeader$: Observable<boolean>;
  showThemeToggle$: Observable<boolean>;

  constructor(
    private authService: FirebaseAuthService,
    private themeService: ThemeService,
    private router: Router
  ) {
    const authIsLoading$ = this.authService.isLoading$;

    const minDisplayTime$ = timer(1500).pipe(map(() => false), startWith(true));

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
      startWith(!this.router.url.startsWith('/auth'))
    );

    this.showThemeToggle$ = navigationEnd$.pipe(
      map(event => {
        const currentUrl = event.urlAfterRedirects;
        return !hiddenRoutes.some(route => currentUrl.startsWith(route)) && currentUrl !== '/';
      }),
      startWith((() => { 
        const currentUrl = this.router.url;
        return !hiddenRoutes.some(route => currentUrl.startsWith(route)) && currentUrl !== '/';
      })())
    );

    console.log('[AppComponent] ThemeService injected and initialized.');
  }

  ngOnInit(): void {
    // No theme subscription logic needed here
  }

  ngOnDestroy(): void {
    // No theme unsubscribe logic needed here
  }
}
