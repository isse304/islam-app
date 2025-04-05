import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FirebaseAuthService } from '../../services/firebase-auth.service';
import { Subscription, filter, take } from 'rxjs';
import { FormsModule } from '@angular/forms';

type ActiveFeature = 'tafsir' | 'dua-search' | 'dua-insights';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    FormsModule
  ]
})
export class LandingComponent implements OnInit, OnDestroy {
  activeFeature: ActiveFeature = 'tafsir';
  private autoRotateInterval: any;
  private isDestroyed = false;
  private authSubscription?: Subscription;
  earlyAccessEmail: string = '';

  constructor(
    private router: Router,
    private authService: FirebaseAuthService
  ) {}

  async ngOnInit() {
    this.startAutoRotate();
    
    // Re-added: Check if user is already authenticated and redirect to home
    // This might help prevent brief flashes of the landing page if the NoAuthGuard
    // takes a moment to resolve during initial load.
    const isAuthenticated = await this.authService.isAuthenticated();
    if (isAuthenticated) {
      this.router.navigate(['/home']);
      return;
    }

    // Subscribe to auth changes for subsequent sign-ins
    this.authSubscription = this.authService.user$.pipe(
      filter(user => user !== null)
    ).subscribe(() => {
      // No automatic redirect needed here either, guards handle this.
      // this.router.navigate(['/home']);
    });
  }

  ngOnDestroy() {
    this.isDestroyed = true;
    this.stopAutoRotate();
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

  async login() {
    try {
      await this.router.navigate(['/auth/login']);
    } catch (error) {
      console.error('Login error:', error);
    }
  }

  async register() {
    try {
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
} 