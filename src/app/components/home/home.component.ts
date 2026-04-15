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
} 