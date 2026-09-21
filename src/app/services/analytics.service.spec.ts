import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AnalyticsService } from './analytics.service';
import { FirebaseAuthService } from './firebase-auth.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let gtagSpy: jasmine.Spy;
  let routerEvents: Subject<unknown>;

  beforeEach(() => {
    routerEvents = new Subject<unknown>();
    gtagSpy = jasmine.createSpy('gtag');
    window.dataLayer = [];
    window.gtag = gtagSpy;

    TestBed.configureTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: Router,
          useValue: {
            events: routerEvents.asObservable(),
            url: '/home'
          }
        },
        {
          provide: FirebaseAuthService,
          useValue: {
            user$: new Subject()
          }
        }
      ]
    });

    service = TestBed.inject(AnalyticsService);
    gtagSpy.calls.reset();
  });

  it('sends a page_view when the router navigates', fakeAsync(() => {
    routerEvents.next(new NavigationEnd(1, '/quran?surah=1', '/quran?surah=1'));
    tick();

    expect(gtagSpy).toHaveBeenCalledWith('event', 'page_view', jasmine.objectContaining({
      page_path: '/quran?surah=1',
      content_group: 'Quran'
    }));
  }));

  it('strips sensitive query params from page paths', fakeAsync(() => {
    routerEvents.next(new NavigationEnd(2, '/auth/login?email=user@example.com&surah=2', '/auth/login?email=user@example.com&surah=2'));
    tick();

    expect(gtagSpy).toHaveBeenCalledWith('event', 'page_view', jasmine.objectContaining({
      page_path: '/auth/login?surah=2',
      content_group: 'Auth'
    }));
  }));

  it('records custom product events', () => {
    service.trackQuranRead(2, 255, 'translation');
    service.trackRecitationPlay(1, 1);
    service.trackDuaView(12, 'Morning dua', 'morning');
    service.trackLogin('email');

    expect(gtagSpy).toHaveBeenCalledWith('event', 'quran_read', jasmine.objectContaining({
      surah: 2,
      verse: 255,
      view_mode: 'translation'
    }));
    expect(gtagSpy).toHaveBeenCalledWith('event', 'recitation_play', jasmine.objectContaining({
      surah: 1,
      verse: 1
    }));
    expect(gtagSpy).toHaveBeenCalledWith('event', 'dua_view', jasmine.objectContaining({
      dua_id: '12',
      category: 'morning'
    }));
    expect(gtagSpy).toHaveBeenCalledWith('event', 'login', jasmine.objectContaining({
      method: 'email'
    }));
  });

  it('does not send duplicate tafsir_read events for the same surah', () => {
    service.trackTafsirRead('ibn-kathir', 1, 1);
    service.trackTafsirRead('ibn-kathir', 1, 2);
    service.trackTafsirRead('ibn-kathir', 2, 1);

    const tafsirCalls = gtagSpy.calls.all().filter(call => call.args[1] === 'tafsir_read');
    expect(tafsirCalls.length).toBe(2);
  });
});
