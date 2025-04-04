import { Component, OnInit, OnDestroy, Renderer2, Inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { FirebaseAuthService } from './services/firebase-auth.service';
import { PreferencesService } from './services/preferences.service';
import { Subscription, Observable } from 'rxjs';
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
  private preferencesSubscription: Subscription | undefined;
  isLoading$: Observable<boolean>;

  constructor(
    private authService: FirebaseAuthService,
    private preferencesService: PreferencesService,
    private renderer: Renderer2,
    @Inject(DOCUMENT) private document: Document
  ) {
    this.isLoading$ = this.authService.isLoading$;
  }

  ngOnInit(): void {
    this.preferencesSubscription = this.preferencesService.getPreferences().subscribe(prefs => {
      if (prefs?.isDarkMode) {
        this.renderer.addClass(this.document.body, 'dark');
      } else {
        this.renderer.removeClass(this.document.body, 'dark');
      }
    });
  }

  ngOnDestroy(): void {
    if (this.preferencesSubscription) {
      this.preferencesSubscription.unsubscribe();
    }
  }
}
