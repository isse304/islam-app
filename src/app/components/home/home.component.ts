import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { Subscription, interval } from 'rxjs';

interface ShowcaseSlide {
  text: string;
  source: string;
  backgroundImage?: string;
}

@Component({
  selector: 'app-home',
  template: `
    <div class="min-h-screen bg-[#FAF3E0] dark:bg-gray-900 relative">
      <!-- Background Pattern -->
      <div class="absolute inset-0 opacity-10">
        <img src="/islamic-pattern-1.png" alt="" class="w-full h-full object-cover">
      </div>

      <!-- Content -->
      <div class="relative">
        <!-- Hero Section -->
        <div class="container mx-auto px-4 py-16">
          <div class="flex flex-col items-center justify-center text-center max-w-4xl mx-auto mb-16">
            <h1 class="text-5xl md:text-6xl font-bold text-gray-800 dark:text-white mb-6 leading-tight">
              Welcome to <span class="text-[#B7A57A]">Nura AI</span>
            </h1>
            <p class="text-xl md:text-2xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto leading-relaxed">
              Your spiritual companion for Quran, Duas, and Islamic learning. Explore Quran reader, Dua collection, and AI Tafsir Chat.
            </p>
          </div>

          <!-- ++ NEW: Inspirational Showcase Section ++ -->
          <section class="inspirational-showcase container mx-auto px-4 mb-16 relative overflow-hidden bg-[#FAF3E0] rounded-xl shadow-lg p-8 min-h-[250px] flex flex-col justify-center items-center text-center"
                   (mouseenter)="stopSlideShow()"
                   (mouseleave)="startSlideShow()">
              <!-- Slides Container -->
              <div class="relative w-full h-full">
                <ng-container *ngFor="let slide of slides; let i = index">
                  <div class="slide absolute inset-0 flex flex-col justify-center items-center transition-opacity duration-1000 ease-in-out"
                       [class.opacity-100]="i === currentSlideIndex"
                       [class.opacity-0]="i !== currentSlideIndex">
                       <!-- Optional Background Image Div -->
                       <!-- <div class="absolute inset-0 bg-cover bg-center opacity-10" [style.backgroundImage]="slide.backgroundImage"></div> -->
                       <p class="text-lg md:text-xl lg:text-2xl text-[#B7A57A] font-serif italic mb-4 leading-relaxed max-w-3xl relative z-10">
                           "{{ slide.text }}"
                       </p>
                       <p class="text-sm md:text-base text-[#1A365D] font-semibold relative z-10">
                           — {{ slide.source }}
                       </p>
                  </div>
                </ng-container>
              </div>

              <!-- Optional: Navigation Dots -->
              <div class="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2 z-20">
                  <button *ngFor="let slide of slides; let i = index"
                          (click)="goToSlide(i)"
                          [ngClass]="{
                            'w-2.5': true, 'h-2.5': true, 'rounded-full': true,
                            'transition-colors': true, 'duration-300': true,
                            'bg-[#1A365D]': i === currentSlideIndex,
                            'bg-[#1A365D]/40': i !== currentSlideIndex,
                            'hover:bg-[#1A365D]/70': i !== currentSlideIndex
                          }"
                          [attr.aria-label]="'Go to slide ' + (i + 1)">
                  </button>
              </div>
          </section>
          <!-- ++ END: Inspirational Showcase Section ++ -->

          <!-- Feature Cards -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            <div class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg p-8 transform hover:scale-105 transition-transform duration-300">
              <div class="text-[#B7A57A] dark:text-[#9b8a65] mb-4">
                <i class="fas fa-book-open text-4xl"></i>
              </div>
              <h2 class="text-2xl font-bold text-gray-800 dark:text-white mb-4">
                Quran Reader
              </h2>
              <p class="text-gray-600 dark:text-gray-300 mb-6">
                Read and listen to the Holy Quran with translations and tafsir. Track your progress and bookmark your favorite verses.
              </p>
              <a routerLink="/quran" 
                 class="inline-block px-6 py-3 bg-[#B7A57A] text-white rounded-lg hover:bg-[#9b8a65] transition-colors duration-300">
                Start Reading
              </a>
            </div>

            <div class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg p-8 transform hover:scale-105 transition-transform duration-300">
              <div class="text-[#B7A57A] dark:text-[#9b8a65] mb-4">
                <i class="fas fa-graduation-cap text-4xl"></i>
              </div>
              <h2 class="text-2xl font-bold text-gray-800 dark:text-white mb-4">
                AI Tafsir Chat
              </h2>
              <p class="text-gray-600 dark:text-gray-300 mb-6">
                Improve your Quran knowledge by asking Nura AI any question about the verses of the Holy Quran and receive a detailed explanation.
              </p>
              <a routerLink="/learn" 
                 class="inline-block px-6 py-3 bg-[#B7A57A] text-white rounded-lg hover:bg-[#9b8a65] transition-colors duration-300">
                Start Learning
              </a>
            </div>

            <div class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg p-8 transform hover:scale-105 transition-transform duration-300">
              <div class="text-[#B7A57A] dark:text-[#9b8a65] mb-4">
                <i class="fas fa-hands-praying text-4xl"></i>
              </div>
              <h2 class="text-2xl font-bold text-gray-800 dark:text-white mb-4">
                Daily Duas
              </h2>
              <p class="text-gray-600 dark:text-gray-300 mb-6">
                Collection of authentic duas for various occasions. Dive deeper into each dua with AI powered insights or get detailed islamic advice based on your feelings with emotional dua search.
              </p>
              <a routerLink="/dua" 
                 class="inline-block px-6 py-3 bg-[#B7A57A] text-white rounded-lg hover:bg-[#9b8a65] transition-colors duration-300">
                View Duas
              </a>
            </div>
          </div>

          <!-- AI Features Section -->
          <div class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg p-8 mb-16">
            <h2 class="text-3xl font-bold text-gray-800 dark:text-white mb-8 text-center">
              Powered by AI
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div class="text-center">
                <i class="fas fa-robot text-3xl text-[#B7A57A] dark:text-[#9b8a65] mb-3"></i>
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Smart Tafsir</h3>
                <p class="text-gray-600 dark:text-gray-300">AI-powered explanations of Quranic verses</p>
              </div>
              <div class="text-center">
                <i class="fas fa-brain text-3xl text-[#B7A57A] dark:text-[#9b8a65] mb-3"></i>
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Personalized Learning</h3>
                <p class="text-gray-600 dark:text-gray-300">Adaptive learning paths based on your progress</p>
              </div>
              <div class="text-center">
                <i class="fas fa-comments text-3xl text-[#B7A57A] dark:text-[#9b8a65] mb-3"></i>
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Smart Dua Suggestions</h3>
                <p class="text-gray-600 dark:text-gray-300">Context-aware dua recommendations</p>
              </div>
              <div class="text-center">
                <i class="fas fa-chart-line text-3xl text-[#B7A57A] dark:text-[#9b8a65] mb-3"></i>
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Progress Analytics</h3>
                <p class="text-gray-600 dark:text-gray-300">AI-driven insights into your learning journey</p>
              </div>
            </div>
          </div>

          <!-- Additional Features Section -->
          <div class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg p-8 mb-16">
            <h2 class="text-3xl font-bold text-gray-800 dark:text-white mb-8 text-center">
              Why Choose Nura?
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div class="text-center">
                <i class="fas fa-mobile-alt text-3xl text-[#B7A57A] dark:text-[#9b8a65] mb-3"></i>
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Mobile Friendly</h3>
                <p class="text-gray-600 dark:text-gray-300">Access anywhere, anytime</p>
              </div>
              <div class="text-center">
                <i class="fas fa-bookmark text-3xl text-[#B7A57A] dark:text-[#9b8a65] mb-3"></i>
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Save Progress</h3>
                <p class="text-gray-600 dark:text-gray-300">Track your learning journey</p>
              </div>
              <div class="text-center">
                <i class="fas fa-volume-up text-3xl text-[#B7A57A] dark:text-[#9b8a65] mb-3"></i>
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Audio Recitations</h3>
                <p class="text-gray-600 dark:text-gray-300">Listen to professional reciters</p>
              </div>
              <div class="text-center">
                <i class="fas fa-language text-3xl text-[#B7A57A] dark:text-[#9b8a65] mb-3"></i>
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Multiple Translations</h3>
                <p class="text-gray-600 dark:text-gray-300">Understand in your language</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <footer class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700">
          <div class="container mx-auto px-4 py-8">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div>
                <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-4">Nura</h3>
                <p class="text-gray-600 dark:text-gray-300">
                  Your spiritual companion for Quran, Duas, and Islamic learning.
                </p>
              </div>
              <div>
                <h4 class="text-lg font-semibold text-gray-800 dark:text-white mb-4">Quick Links</h4>
                <ul class="space-y-2">
                  <li><a routerLink="/quran" class="text-gray-600 dark:text-gray-300 hover:text-[#B7A57A] dark:hover:text-[#9b8a65]">Quran Reader</a></li>
                  <li><a routerLink="/learn" class="text-gray-600 dark:text-gray-300 hover:text-[#B7A57A] dark:hover:text-[#9b8a65]">AI Tafsir Chat</a></li>
                  <li><a routerLink="/dua" class="text-gray-600 dark:text-gray-300 hover:text-[#B7A57A] dark:hover:text-[#9b8a65]">Daily Duas</a></li>
                  <li><a routerLink="/profile" class="text-gray-600 dark:text-gray-300 hover:text-[#B7A57A] dark:hover:text-[#9b8a65]">My Profile</a></li>
                  <li><a routerLink="/about" class="text-gray-600 dark:text-gray-300 hover:text-[#B7A57A] dark:hover:text-[#9b8a65]">About</a></li>
                </ul>
              </div>
              <div>
                <h4 class="text-lg font-semibold text-gray-800 dark:text-white mb-4">Support</h4>
                <ul class="space-y-2">
                  <li><a routerLink="/contact" class="text-gray-600 dark:text-gray-300 hover:text-[#B7A57A] dark:hover:text-[#9b8a65]">Contact Us</a></li>
                </ul>
              </div>
              <div>
                <!-- <h4 class="text-lg font-semibold text-gray-800 dark:text-white mb-4">Connect</h4>
                <div class="flex space-x-4">
                  <a href="#" class="text-gray-600 dark:text-gray-300 hover:text-[#B7A57A] dark:hover:text-[#9b8a65]">
                    <i class="fab fa-facebook text-2xl"></i>
                  </a>
                  <a href="#" class="text-gray-600 dark:text-gray-300 hover:text-[#B7A57A] dark:hover:text-[#9b8a65]">
                    <i class="fab fa-twitter text-2xl"></i>
                  </a>
                  <a href="#" class="text-gray-600 dark:text-gray-300 hover:text-[#B7A57A] dark:hover:text-[#9b8a65]">
                    <i class="fab fa-instagram text-2xl"></i>
                  </a> -->
                <!-- </div> -->
              </div>
            </div>
            <div class="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700 text-center text-gray-600 dark:text-gray-300">
              <p>&copy; {{ currentYear }} Nura. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  `,
  standalone: true,
  imports: [
    CommonModule,
    RouterModule
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
  private slideIntervalSubscription: Subscription | null = null;
  slideInterval = 7000;

  constructor(
    private titleService: Title,
    private metaService: Meta,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.titleService.setTitle('Nura AI - Your Intelligent Islamic Assistant | Home');
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
    this.slideIntervalSubscription = interval(this.slideInterval).subscribe(() => {
      this.nextSlide();
      this.cdr.markForCheck();
    });
  }

  stopSlideShow(): void {
    if (this.slideIntervalSubscription) {
      this.slideIntervalSubscription.unsubscribe();
      this.slideIntervalSubscription = null;
    }
  }

  nextSlide(): void {
    this.currentSlideIndex = (this.currentSlideIndex + 1) % this.slides.length;
  }

  goToSlide(index: number): void {
    this.currentSlideIndex = index;
    this.stopSlideShow();
    this.startSlideShow();
  }
} 