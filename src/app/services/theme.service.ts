import { Injectable, Inject, PLATFORM_ID, OnDestroy } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';

@Injectable({
  providedIn: 'root'
})
export class ThemeService implements OnDestroy {
  private readonly storageKey = 'theme-preference';
  private currentAppliedTheme: BehaviorSubject<Theme> = new BehaviorSubject<Theme>('light');
  private userPreference: ThemePreference = 'system';
  private destroy$ = new Subject<void>();
  private colorSchemeQueryList: MediaQueryList | null = null;

  // Public observable for components to react to theme changes if needed
  public currentTheme$ = this.currentAppliedTheme.asObservable();

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    // Only run theme logic in the browser
    if (isPlatformBrowser(this.platformId)) {
      this.initializeTheme();
    } else {
      console.log('[ThemeService] Skipping initialization (not in browser).');
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    // Ensure listener is removed when service is destroyed
    if (this.colorSchemeQueryList && isPlatformBrowser(this.platformId)) {
       try {
         this.colorSchemeQueryList.removeEventListener('change', this.systemThemeChangeHandler);
         console.log('[ThemeService] System theme change listener removed.');
       } catch (e) {
         console.error('[ThemeService] Error removing listener (might have been removed already):', e);
       }
    }
  }

  private initializeTheme(): void {
    // Check if window and matchMedia are available
    if (typeof window === 'undefined' || !window.matchMedia) {
        console.warn('[ThemeService] Window or matchMedia not available. Cannot initialize theme detection.');
        this.currentAppliedTheme.next('light'); // Default to light if detection isn't possible
        return;
    }

    this.userPreference = (localStorage.getItem(this.storageKey) as ThemePreference) || 'system';
    console.log(`[ThemeService] Initializing theme. User Preference: ${this.userPreference}`);

    this.colorSchemeQueryList = window.matchMedia('(prefers-color-scheme: dark)');

    // Apply the initial theme based on preference and system setting
    this.applyTheme();

    // Listen for system theme changes
    // Use try-catch as addEventListener might fail in some environments or if already added
    try {
        this.colorSchemeQueryList.addEventListener('change', this.systemThemeChangeHandler);
        console.log('[ThemeService] Added system theme change listener.');
    } catch (e) {
         console.error('[ThemeService] Error adding system theme change listener:', e);
    }
  }

  // Handler needs to be a bound function or an arrow function to maintain 'this' context
  private systemThemeChangeHandler = (e: MediaQueryListEvent): void => {
    console.log(`[ThemeService] System theme changed event. Dark mode active: ${e.matches}`);
    // Only re-apply if the user preference is 'system'
    if (this.userPreference === 'system') {
      this.applyTheme();
    }
  };

  public setThemePreference(preference: ThemePreference): void {
    if (!isPlatformBrowser(this.platformId)) return; // Guard against server-side execution

    this.userPreference = preference;
    try {
        localStorage.setItem(this.storageKey, preference);
        console.log(`[ThemeService] User set theme preference to: ${preference}`);
    } catch (e) {
        console.error('[ThemeService] Failed to save theme preference to localStorage:', e);
    }
    this.applyTheme();
  }

  public getCurrentPreference(): ThemePreference {
    return this.userPreference;
  }

  private applyTheme(): void {
    if (!isPlatformBrowser(this.platformId) || typeof document === 'undefined') {
       // console.log('[ThemeService] applyTheme skipped (not in browser or document unavailable).');
       return; // Guard against server-side execution or missing document
    }

    let themeToApply: Theme;

    if (this.userPreference === 'system') {
      // Safely check colorSchemeQueryList before accessing matches
      themeToApply = this.colorSchemeQueryList?.matches ? 'dark' : 'light';
      console.log(`[ThemeService] Applying theme based on system preference: ${themeToApply}`);
    } else {
      themeToApply = this.userPreference;
      console.log(`[ThemeService] Applying theme based on user preference: ${themeToApply}`);
    }

    // Apply the class to the body
    try {
        const bodyClassList = document.body.classList;
        if (themeToApply === 'dark') {
            if (!bodyClassList.contains('dark')) {
                bodyClassList.add('dark');
                console.log('[ThemeService] Added "dark" class to body.');
            }
        } else {
             if (bodyClassList.contains('dark')) {
                bodyClassList.remove('dark');
                console.log('[ThemeService] Removed "dark" class from body.');
            }
        }
    } catch(e) {
        console.error('[ThemeService] Error manipulating body classList:', e);
    }


    // Update the observable if the applied theme actually changed
    if (this.currentAppliedTheme.getValue() !== themeToApply) {
        this.currentAppliedTheme.next(themeToApply);
        console.log(`[ThemeService] Current applied theme BehaviorSubject updated to: ${themeToApply}`);
    } else {
         // console.log(`[ThemeService] Applied theme (${themeToApply}) is the same as current BehaviorSubject value. No update needed.`);
    }
  }
}