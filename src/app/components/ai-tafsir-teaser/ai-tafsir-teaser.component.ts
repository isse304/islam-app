import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import { ThemeService } from '../../services/theme.service';
import { FirebaseAuthService } from '../../services/firebase-auth.service';
import { Observable } from 'rxjs';
import { map, take } from 'rxjs/operators';

interface Feature {
  icon: string;
  title: string;
  description: string;
  preview: string;
}

@Component({
  selector: 'app-ai-tafsir-teaser',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './ai-tafsir-teaser.component.html',
  styleUrls: ['./ai-tafsir-teaser.component.scss'],
  animations: [
    trigger('fadeInUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(30px)' }),
        animate('800ms cubic-bezier(0.35, 0, 0.25, 1)', 
          style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),
    trigger('staggerFade', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'scale(0.95) translateY(20px)' }),
          stagger(150, [
            animate('600ms cubic-bezier(0.35, 0, 0.25, 1)',
              style({ opacity: 1, transform: 'scale(1) translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ]),
    trigger('floatAnimation', [
      transition('* => *', [
        animate('3000ms ease-in-out')
      ])
    ])
  ]
})
export class AiTafsirTeaserComponent implements OnInit, OnDestroy {
  isDarkMode$: Observable<boolean>;
  currentFeatureIndex = 0;
  private intervalId: any;
  isAuthenticated = false;
  isPremium = false;

  features: Feature[] = [
    {
      icon: 'psychology',
      title: 'Intelligent Tafsir Explanations',
      description: 'Get detailed, context-aware explanations of Quranic verses using AI trained on classical tafsir works.',
      preview: '"What does Surah Al-Baqarah verse 255 teach us about Allah\'s knowledge?" Get instant, comprehensive answers.'
    },
    {
      icon: 'chat',
      title: 'Interactive Q&A',
      description: 'Ask follow-up questions and have natural conversations about the meanings and applications of verses.',
      preview: 'Explore deeper meanings, historical context, and practical applications through intelligent dialogue.'
    },
    {
      icon: 'lightbulb',
      title: 'Contextual Insights',
      description: 'Discover connections between verses, themes, and how to apply Quranic wisdom in daily life.',
      preview: 'Learn how verses relate to each other and gain practical guidance for modern challenges.'
    },
    {
      icon: 'auto_awesome',
      title: 'Personalized Learning',
      description: 'The AI adapts to your learning style and provides explanations tailored to your understanding level.',
      preview: 'Whether you\'re a beginner or advanced student, get explanations that match your knowledge.'
    }
  ];

  benefits = [
    '✨ Unlimited AI-powered tafsir conversations',
    '📚 Access to classical tafsir sources',
    '🎯 Personalized learning experience',
    '⚡ Instant answers to your questions',
    '🔍 Deep contextual analysis',
    '🌙 Available 24/7 whenever you need guidance'
  ];

  testimonials = [
    {
      quote: 'The AI Tafsir has transformed how I study the Quran. It\'s like having a knowledgeable teacher available anytime.',
      author: 'Ahmad K.',
      role: 'Premium Member'
    },
    {
      quote: 'I can finally understand the deeper meanings and context. The explanations are clear and well-referenced.',
      author: 'Fatima M.',
      role: 'Student'
    },
    {
      quote: 'This feature alone is worth the premium subscription. The insights are profound and actionable.',
      author: 'Dr. Ibrahim S.',
      role: 'Teacher'
    }
  ];

  constructor(
    private router: Router,
    private themeService: ThemeService,
    private authService: FirebaseAuthService
  ) {
    this.isDarkMode$ = this.themeService.currentTheme$.pipe(
      map(theme => theme === 'dark')
    );
  }

  async ngOnInit(): Promise<void> {
    // Check user authentication status
    const user = await this.authService.getCurrentUser();
    this.isAuthenticated = !!user;

    // Check premium status if authenticated
    if (this.isAuthenticated) {
      this.isPremium = await this.authService.isPremiumUser();
      
      // If user is premium, redirect directly to /learn
      if (this.isPremium) {
        this.router.navigate(['/learn']);
        return;
      }
    }

    // Auto-rotate features every 4 seconds
    this.intervalId = setInterval(() => {
      this.currentFeatureIndex = (this.currentFeatureIndex + 1) % this.features.length;
    }, 4000);
  }

  ngOnDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  selectFeature(index: number): void {
    this.currentFeatureIndex = index;
  }

  navigateToSignup(): void {
    this.router.navigate(['/auth/signup'], { 
      queryParams: { returnUrl: '/learn', feature: 'AI Tafsir Chat' } 
    });
  }

  navigateToLogin(): void {
    this.router.navigate(['/auth/login'], { 
      queryParams: { returnUrl: '/learn', feature: 'AI Tafsir Chat' } 
    });
  }

  navigateToSubscription(): void {
    this.router.navigate(['/subscription'], { 
      queryParams: { feature: 'AI Tafsir Chat' } 
    });
  }
}
