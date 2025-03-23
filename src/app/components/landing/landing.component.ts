import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FirebaseAuthService } from '../../services/firebase-auth.service';

type ActiveFeature = 'tafsir' | 'dua-search' | 'dua-insights';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatButtonModule
  ]
})
export class LandingComponent implements OnInit, OnDestroy {
  activeFeature: ActiveFeature = 'tafsir';
  private autoRotateInterval: any;
  private isDestroyed = false;

  constructor(
    private router: Router,
    private authService: FirebaseAuthService
  ) {}

  ngOnInit() {
    this.startAutoRotate();
  }

  ngOnDestroy() {
    this.isDestroyed = true;
    this.stopAutoRotate();
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
      await this.authService.login();
    } catch (error) {
      console.error('Login error:', error);
    }
  }

  async register() {
    try {
      // Navigate to registration page
      this.router.navigate(['/auth/register']);
    } catch (error) {
      console.error('Registration error:', error);
    }
  }

  getStarted() {
    // Check if user is logged in
    this.authService.isAuthenticated().then(isAuth => {
      if (isAuth) {
        this.router.navigate(['/home']);
      } else {
        this.router.navigate(['/auth/register']);
      }
    });
  }

  learnMore() {
    // Smooth scroll to features section
    const featuresSection = document.getElementById('features');
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: 'smooth' });
    }
  }
} 