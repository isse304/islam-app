import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FirebaseAuthService } from '../../services/firebase-auth.service';
import { Subscription, filter, take, interval } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

type ActiveFeature = 'tafsir' | 'dua-search' | 'dua-insights';

// Interface for Showcase Slides (copied from HomeComponent)
interface ShowcaseSlide {
  text: string;
  source: string;
  backgroundImage?: string;
}

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    FormsModule
  ],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss']
})
export class LandingComponent implements OnInit, OnDestroy {
  activeFeature: ActiveFeature = 'tafsir';
  private autoRotateInterval: any;
  private isDestroyed = false;
  private authSubscription?: Subscription;
  earlyAccessEmail: string = '';
  currentYear: number = new Date().getFullYear();

  // Properties for Inspirational Showcase (copied from HomeComponent)
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
    private router: Router,
    private authService: FirebaseAuthService,
    private cdr: ChangeDetectorRef // Injected ChangeDetectorRef
  ) {}

  async ngOnInit() {
    this.startAutoRotate();
    this.startSlideShow(); // Start the inspirational showcase slideshow

    // Subscribe to auth changes for subsequent sign-ins (Keep this for reactivity if needed, but guards handle initial redirect)
    this.authSubscription = this.authService.user$.pipe(
      filter(user => user !== null)
    ).subscribe(() => {
      // console.log('User became authenticated while on landing page, redirecting to /home');
      // Optionally redirect if user logs in *while* on the landing page
      // this.router.navigate(['/home']); 
    });
  }

  ngOnDestroy() {
    this.isDestroyed = true;
    this.stopAutoRotate();
    this.stopSlideShow(); // Stop the inspirational showcase slideshow
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
  }

  private startAutoRotate() {
    if (this.isDestroyed) return;
    
    this.stopAutoRotate(); // Clear any existing interval
    
    this.autoRotateInterval = setInterval(() => {
      if (this.isDestroyed) {
        this.stopAutoRotate();
        return;
      }

      try {
        const features: ActiveFeature[] = ['tafsir', 'dua-search', 'dua-insights'];
        const currentIndex = features.indexOf(this.activeFeature);
        const nextIndex = (currentIndex + 1) % features.length;
        this.activeFeature = features[nextIndex];
      } catch (error) {
        console.error('Error during auto-rotation:', error);
        this.stopAutoRotate();
      }
    }, 6000);
  }

  private stopAutoRotate() {
    if (this.autoRotateInterval) {
      clearInterval(this.autoRotateInterval);
      this.autoRotateInterval = null;
    }
  }

  showFeature(feature: ActiveFeature) {
    if (this.isDestroyed) return;
    
    this.stopAutoRotate();
    this.activeFeature = feature;
    this.startAutoRotate();
  }

  // Methods for Inspirational Showcase (copied from HomeComponent)
  startSlideShow(): void {
    this.stopSlideShow();
    this.slideIntervalSubscription = interval(this.slideInterval).subscribe(() => {
      this.nextSlide();
      this.cdr.markForCheck(); // Use ChangeDetectorRef
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
    this.stopSlideShow(); // Stop and restart timer when manually changing slide
    this.startSlideShow();
  }

  async login() {
    try {
      // Navigate to login, passing the intent for starting a trial
      await this.router.navigate(['/auth/login']);
    } catch (error) {
      console.error('Login error:', error);
    }
  }

  async register() {
    try {
      // Navigate to signup, passing the intent for starting a trial
      await this.router.navigate(['/auth/signup']);
    } catch (error) {
      console.error('Registration error:', error);
    }
  }

  learnMore() {
    // Smooth scroll to features section
    const featuresSection = document.getElementById('features');
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: 'smooth' });
    }
  }

  startFreeTrial(): void {
    // Store the intent before navigating
    localStorage.setItem('signupIntent', 'start_trial');
    // This button should ideally lead to signup, so keep it navigating there with the intent.
    // Alternatively, it could open a modal asking Login or Signup, both passing the intent.
    this.router.navigate(['/auth/signup'], { queryParams: { intent: 'start_trial' } });
  }
} 