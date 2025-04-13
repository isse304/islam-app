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
  private isBrowser: boolean = false;
  private systemThemeListener: (e: MediaQueryListEvent) => void = () => {};
  private systemPrefersDark: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  // Public observable for components to react to theme changes if needed
  public currentTheme$ = this.currentAppliedTheme.asObservable();

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof localStorage !== 'undefined') {
      this.isBrowser = true;
      this.userPreference = (localStorage.getItem(this.storageKey) as ThemePreference | null) || 'system';
      this.systemThemeListener = (e) => {
        this.systemPrefersDark.next(e.matches);
        if (this.userPreference === 'system') {
          this.applyTheme();
        }
      };
      this.colorSchemeQueryList = window.matchMedia('(prefers-color-scheme: dark)');
      this.applyTheme();
      this.setupSystemThemeListener();
    } else {
      // console.log('[ThemeService] Skipping initialization (not in browser).');
    }
  }

  ngOnDestroy(): void {
    if (this.isBrowser && this.colorSchemeQueryList) {
      this.colorSchemeQueryList.removeEventListener('change', this.systemThemeListener);
      // console.log('[ThemeService] System theme change listener removed.');
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSystemThemeListener(): void {
    if (this.isBrowser && this.colorSchemeQueryList) {
      try {
        this.colorSchemeQueryList.addEventListener('change', this.systemThemeListener);
        // console.log('[ThemeService] Added system theme change listener.');
      } catch (e) {
        // console.error('[ThemeService] Error adding system theme change listener:', e);
      }
    }
  }

  public setThemePreference(preference: ThemePreference): void {
    if (!this.isBrowser) return; // Guard against server-side execution

    this.userPreference = preference;
    try {
        localStorage.setItem(this.storageKey, preference);
        // console.log(`[ThemeService] User set theme preference to: ${preference}`);
    } catch (e) {
        // console.error('[ThemeService] Failed to save theme preference to localStorage:', e);
    }
    this.applyTheme();
  }

  public getCurrentPreference(): ThemePreference {
    return this.userPreference;
  }

  private applyTheme(): void {
    if (!this.isBrowser || typeof document === 'undefined') {
       // console.log('[ThemeService] applyTheme skipped (not in browser or document unavailable).');
       return; // Guard against server-side execution or missing document
    }

    let themeToApply: Theme;

    if (this.userPreference === 'system') {
      // Safely check colorSchemeQueryList before accessing matches
      themeToApply = this.colorSchemeQueryList?.matches ? 'dark' : 'light';
      // console.log(`[ThemeService] Applying theme based on system preference: ${themeToApply}`);
    } else {
      themeToApply = this.userPreference;
      // console.log(`[ThemeService] Applying theme based on user preference: ${themeToApply}`);
    }

    // Apply the class to the body
    try {
        const bodyClassList = document.body.classList;
        if (themeToApply === 'dark') {
            if (!bodyClassList.contains('dark')) {
                bodyClassList.add('dark');
                // console.log('[ThemeService] Added "dark" class to body.');
            }
        } else {
             if (bodyClassList.contains('dark')) {
                bodyClassList.remove('dark');
                // console.log('[ThemeService] Removed "dark" class from body.');
            }
        }
    } catch(e) {
        // console.error('[ThemeService] Error manipulating body classList:', e);
    }

    // Update BehaviorSubject only if the theme actually changed
    if (this.currentAppliedTheme.value !== themeToApply) {
      this.currentAppliedTheme.next(themeToApply);
      // console.log(`[ThemeService] Current applied theme BehaviorSubject updated to: ${themeToApply}`);
    } else {
      // // console.log(`[ThemeService] Applied theme (${themeToApply}) is the same as current BehaviorSubject value. No update needed.`);
    }
  }
}