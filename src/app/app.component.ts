import { Component, OnInit, OnDestroy, Renderer2, Inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { FirebaseAuthService } from './services/firebase-auth.service';
import { ThemeService } from './services/theme.service';
import { Subscription, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    HeaderComponent,
    MatProgressSpinnerModule
  ]
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'IslamApp';
  isLoading$: Observable<boolean>;
  showHeader$: Observable<boolean>;

  constructor(
    private authService: FirebaseAuthService,
    private themeService: ThemeService,
    private renderer: Renderer2,
    @Inject(DOCUMENT) private document: Document,
    private router: Router
  ) {
    this.isLoading$ = this.authService.isLoading$;

    this.showHeader$ = this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event: NavigationEnd) => !event.urlAfterRedirects.startsWith('/auth'))
    );

    console.log('[AppComponent] ThemeService injected and initialized.');
  }

  ngOnInit(): void {
  }

  ngOnDestroy(): void {
  }
}
