import { Injectable, Injector } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { FirebaseAuthService } from './firebase-auth.service';

export type AnalyticsParams = Record<string, string | number | boolean | undefined>;

const MEASUREMENT_ID = environment.firebase.measurementId;
const QUERY_ALLOWLIST = new Set([
  'surah',
  'verse',
  'page',
  'mode',
  'translation',
  'reciter',
  'editionId',
  'feature',
  'intent'
]);

/**
 * Google Analytics 4 for the Angular SPA.
 * Sends page views on route changes, engagement time via gtag.js,
 * and custom events for Quran / dua / tafsir / auth / checkout.
 */
@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private initialized = false;
  private lastPageKey = '';
  private lastTafsirKey = '';

  constructor(
    private router: Router,
    private injector: Injector
  ) {
    this.bootstrap();
  }

  trackEvent(name: string, params: AnalyticsParams = {}): void {
    if (!this.initialized || typeof window.gtag !== 'function') {
      return;
    }

    window.gtag('event', name, this.sanitizeParams(params));
  }

  trackQuranRead(surah: number, verse?: number, viewMode?: string): void {
    this.trackEvent('quran_read', {
      surah,
      verse: verse ?? 1,
      view_mode: viewMode || 'translation'
    });
  }

  trackRecitationPlay(surah: number, verse: number | null): void {
    this.trackEvent('recitation_play', {
      surah,
      verse: verse ?? 0
    });
  }

  trackDuaCategory(category: string): void {
    this.trackEvent('dua_category_view', { category });
  }

  trackDuaView(duaId: string | number, title?: string, category?: string): void {
    this.trackEvent('dua_view', {
      dua_id: String(duaId),
      dua_title: title,
      category
    });
  }

  trackTafsirRead(editionId: string, surah: number, verse: number): void {
    const key = `${editionId}:${surah}`;
    if (key === this.lastTafsirKey) {
      return;
    }
    this.lastTafsirKey = key;
    this.trackEvent('tafsir_read', {
      edition_id: editionId,
      surah,
      verse
    });
  }

  trackLogin(method: string): void {
    this.trackEvent('login', { method });
  }

  trackSignUp(method: string): void {
    this.trackEvent('sign_up', { method });
  }

  trackBeginCheckout(): void {
    this.trackEvent('begin_checkout', {
      currency: 'USD',
      value: 4.99
    });
  }

  trackPurchase(): void {
    this.trackEvent('purchase', {
      currency: 'USD',
      value: 4.99,
      items: 'premium'
    });
  }

  private bootstrap(): void {
    if (!MEASUREMENT_ID || typeof document === 'undefined') {
      return;
    }

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
      window.dataLayer.push(arguments);
    };

    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      debug_mode: !environment.production
    });

    this.injectScript(MEASUREMENT_ID);
    this.initialized = true;
    this.trackSpaPageViews();
    this.bindUserProperties();
  }

  private injectScript(measurementId: string): void {
    if (document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${measurementId}"]`)) {
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script);
  }

  private trackSpaPageViews(): void {
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe(event => {
      this.sendPageView(event.urlAfterRedirects);
    });

    const initialUrl = this.router.url;
    if (initialUrl && initialUrl !== '/') {
      this.sendPageView(initialUrl);
    }
  }

  private sendPageView(rawUrl: string): void {
    if (!this.initialized || typeof window.gtag !== 'function') {
      return;
    }

    const path = this.safePath(rawUrl);
    const pageKey = `${path}|${document.title}`;
    if (pageKey === this.lastPageKey) {
      return;
    }
    this.lastPageKey = pageKey;

    window.gtag('event', 'page_view', {
      page_title: document.title,
      page_location: `${window.location.origin}${path}`,
      page_path: path,
      content_group: this.contentGroup(path)
    });
  }

  private bindUserProperties(): void {
    let auth: FirebaseAuthService | null = null;
    try {
      auth = this.injector.get(FirebaseAuthService, null);
    } catch {
      return;
    }
    if (!auth) {
      return;
    }

    auth.user$.subscribe(user => {
      if (typeof window.gtag !== 'function') {
        return;
      }

      if (user?.uid) {
        window.gtag('set', { user_id: user.uid });
        window.gtag('set', 'user_properties', {
          logged_in: 'true',
          plan: user.isPremium ? 'premium' : 'free',
          role: user.role || 'none'
        });
      } else {
        window.gtag('set', 'user_properties', {
          logged_in: 'false',
          plan: 'anonymous',
          role: 'none'
        });
      }
    });
  }

  private safePath(rawUrl: string): string {
    const [pathname, query = ''] = rawUrl.split('?');
    if (!query) {
      return pathname || '/';
    }

    const params = new URLSearchParams(query);
    const kept = new URLSearchParams();
    params.forEach((value, key) => {
      if (QUERY_ALLOWLIST.has(key) && value) {
        kept.set(key, value);
      }
    });

    const filtered = kept.toString();
    return filtered ? `${pathname}?${filtered}` : (pathname || '/');
  }

  private contentGroup(path: string): string {
    const segment = path.split('?')[0].split('/').filter(Boolean)[0] || 'home';
    const groups: Record<string, string> = {
      home: 'Home',
      quran: 'Quran',
      dua: 'Duas',
      tafsir: 'Tafsir',
      auth: 'Auth',
      profile: 'Profile',
      subscription: 'Subscription',
      classroom: 'Classroom',
      s: 'Classroom',
      t: 'Classroom',
      p: 'Classroom',
      reader: 'Quran',
      about: 'About',
      contact: 'Contact',
      landing: 'Marketing',
      call: 'Calls'
    };
    return groups[segment] || 'Other';
  }

  private sanitizeParams(params: AnalyticsParams): AnalyticsParams {
    const clean: AnalyticsParams = {};
    Object.keys(params).forEach(key => {
      const value = params[key];
      if (value !== undefined && value !== null && value !== '') {
        clean[key] = value;
      }
    });
    return clean;
  }
}
