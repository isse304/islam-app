import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, HostListener, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { Subscription, Observable } from 'rxjs';
import { ThemeService, Theme } from '../../services/theme.service';
import { map } from 'rxjs/operators';
import { MatIconModule } from '@angular/material/icon';

interface ShowcaseSlide {
  text: string;
  source: string;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomeComponent implements OnInit, OnDestroy {
  currentYear = new Date().getFullYear();

  // ── Tafsir Continue Reading ──
  hasTafsirProgress = false;
  tafsirProgress: any = null;
  tafsirEditionName = '';
  tafsirSurahName = '';
  tafsirTimeAgo = '';
  tafsirCompletionPercent = 0;

  private static readonly SURAH_NAMES: string[] = [
    'Al-Fatihah', 'Al-Baqarah', "Ali 'Imran", 'An-Nisa', "Al-Ma'idah", "Al-An'am",
    "Al-A'raf", 'Al-Anfal', 'At-Tawbah', 'Yunus', 'Hud', 'Yusuf', "Ar-Ra'd",
    'Ibrahim', 'Al-Hijr', 'An-Nahl', "Al-Isra'", 'Al-Kahf', 'Maryam', 'Ta-Ha',
    "Al-Anbiya'", 'Al-Hajj', "Al-Mu'minun", 'An-Nur', 'Al-Furqan', "Ash-Shu'ara'",
    'An-Naml', 'Al-Qasas', "Al-'Ankabut", 'Ar-Rum', 'Luqman', 'As-Sajdah',
    'Al-Ahzab', "Saba'", 'Fatir', 'Ya-Sin', 'As-Saffat', 'Sad', 'Az-Zumar',
    'Ghafir', 'Fussilat', 'Ash-Shura', 'Az-Zukhruf', 'Ad-Dukhan', 'Al-Jathiyah',
    'Al-Ahqaf', 'Muhammad', 'Al-Fath', 'Al-Hujurat', 'Qaf', 'Adh-Dhariyat',
    'At-Tur', 'An-Najm', 'Al-Qamar', 'Ar-Rahman', "Al-Waqi'ah", 'Al-Hadid',
    'Al-Mujadilah', 'Al-Hashr', 'Al-Mumtahanah', 'As-Saff', "Al-Jumu'ah",
    'Al-Munafiqun', 'At-Taghabun', 'At-Talaq', 'At-Tahrim', 'Al-Mulk', 'Al-Qalam',
    'Al-Haqqah', "Al-Ma'arij", 'Nuh', 'Al-Jinn', 'Al-Muzzammil', 'Al-Muddaththir',
    'Al-Qiyamah', 'Al-Insan', 'Al-Mursalat', "An-Naba'", "An-Nazi'at", "'Abasa",
    'At-Takwir', 'Al-Infitar', 'Al-Mutaffifin', 'Al-Inshiqaq', 'Al-Buruj',
    'At-Tariq', "Al-A'la", 'Al-Ghashiyah', 'Al-Fajr', 'Al-Balad', 'Ash-Shams',
    'Al-Layl', 'Ad-Duha', 'Ash-Sharh', 'At-Tin', "Al-'Alaq", 'Al-Qadr',
    'Al-Bayyinah', 'Az-Zalzalah', "Al-'Adiyat", "Al-Qari'ah", 'At-Takathur',
    "Al-'Asr", 'Al-Humazah', 'Al-Fil', 'Quraysh', "Al-Ma'un", 'Al-Kawthar',
    'Al-Kafirun', 'An-Nasr', 'Al-Masad', 'Al-Ikhlas', 'Al-Falaq', 'An-Nas'
  ];

  private static readonly EDITION_NAMES: Record<string, string> = {
    'en-ibn-kathir': 'Tafsir Ibn Kathir',
    'ar-ibn-kathir': 'Tafsir Ibn Kathir (Arabic)',
    'en-maarif-ul-quran': "Ma'arif al-Qur'an",
    'en-tazkirul-quran': 'Tazkirul Quran'
  };

  private static readonly TOTAL_QURAN_VERSES = 6236;

  slides: ShowcaseSlide[] = [
    {
      text: "This is a blessed Book which We have revealed to you, so that they may reflect upon its verses and those of understanding would be reminded.",
      source: "Surah Sad, 38:29",
    },
    {
      text: "The best of you are those who learn the Quran and teach it.",
      source: "Sahih al-Bukhari, 5027",
    },
    {
      text: "The Quran is not only meant to be recited, but to be lived. Every verse is a call to action.",
      source: "Imam Ibn Taymiyyah",
    },
    {
      text: "And We have certainly made the Quran easy for remembrance, so is there any who will remember?",
      source: "Surah Al-Qamar, 54:17",
    },
    {
      text: "If you want to converse with Allah, recite the Quran.",
      source: "Imam Al-Shafi'i",
    },
    {
      text: "Whoever follows a path in pursuit of knowledge, Allah will make a path to Paradise easy for him.",
      source: "Sahih Muslim, 2699",
    }
  ];
  currentSlideIndex = 0;
  scrollProgress = 0;
  private slideTimer: ReturnType<typeof setInterval> | null = null;
  public isDarkMode$: Observable<boolean>;

  constructor(
    private titleService: Title,
    private metaService: Meta,
    private cdr: ChangeDetectorRef,
    private themeService: ThemeService,
    private ngZone: NgZone
  ) {
    this.isDarkMode$ = this.themeService.currentTheme$.pipe(
      map(theme => theme === 'dark')
    );
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    const maxScroll = window.innerHeight * 0.55;
    this.scrollProgress = Math.min(window.scrollY / maxScroll, 1);
  }

  ngOnInit(): void {
    this.titleService.setTitle('Nura AI - Your Intelligent Muslim Companion | Home');
    this.metaService.addTags([
      { name: 'description', content: 'Welcome to Nura AI, your spiritual companion for Quran, Duas, and AI-powered Islamic learning. Explore Quran reader, Dua collection, and interactive learning tools.' },
      { name: 'keywords', content: 'islamic app, quran reader, dua collection, islamic learning, ai assistant, nura ai, islam' }
    ]);

    this.startSlideShow();
    this.loadTafsirProgress();
  }

  ngOnDestroy(): void {
    this.stopSlideShow();
  }

  startSlideShow(): void {
    this.stopSlideShow();
    this.ngZone.runOutsideAngular(() => {
      this.slideTimer = setInterval(() => {
        this.ngZone.run(() => {
          this.nextSlide();
          this.cdr.detectChanges();
        });
      }, 6000);
    });
  }

  stopSlideShow(): void {
    if (this.slideTimer) {
      clearInterval(this.slideTimer);
      this.slideTimer = null;
    }
  }

  nextSlide(): void {
    this.currentSlideIndex = (this.currentSlideIndex + 1) % this.slides.length;
  }

  goToSlide(index: number): void {
    this.currentSlideIndex = index;
    this.stopSlideShow();
    this.startSlideShow();
    this.cdr.detectChanges();
  }

  // ── Tafsir Continue Reading ──

  loadTafsirProgress(): void {
    let mostRecent: any = null;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('tafsir_progress_')) {
        try {
          const data = JSON.parse(localStorage.getItem(key)!);
          if (data && data.lastReadAt) {
            if (!mostRecent || new Date(data.lastReadAt) > new Date(mostRecent.lastReadAt)) {
              mostRecent = data;
            }
          }
        } catch {
          // skip malformed entries
        }
      }
    }

    if (mostRecent) {
      this.hasTafsirProgress = true;
      this.tafsirProgress = mostRecent;
      this.tafsirEditionName =
        HomeComponent.EDITION_NAMES[mostRecent.editionId] || mostRecent.editionId;
      this.tafsirSurahName =
        HomeComponent.SURAH_NAMES[mostRecent.surah - 1] || `Surah ${mostRecent.surah}`;
      this.tafsirTimeAgo = this.getRelativeTime(mostRecent.lastReadAt);
      this.tafsirCompletionPercent =
        Math.min(Math.round((mostRecent.verse / HomeComponent.TOTAL_QURAN_VERSES) * 100 * 10) / 10, 100);
      this.cdr.detectChanges();
    }
  }

  getReadingTimeFormatted(): string {
    const totalSeconds = this.tafsirProgress?.totalReadTime ?? 0;
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    if (hrs > 0) return mins > 0 ? `${hrs} hr ${mins} min` : `${hrs} hr`;
    return `${mins} min`;
  }

  private getRelativeTime(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay} days ago`;
    if (diffDay < 30) return `${Math.floor(diffDay / 7)} week${Math.floor(diffDay / 7) > 1 ? 's' : ''} ago`;
    return `${Math.floor(diffDay / 30)} month${Math.floor(diffDay / 30) > 1 ? 's' : ''} ago`;
  }
} 