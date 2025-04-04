import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component'; // Adjust path if needed
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, HeaderComponent], // Import necessary modules
  template: `
    <app-header></app-header>
    <main class="main-content">
      <router-outlet></router-outlet>
    </main>
    <!-- Add footer here if needed -->
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    .main-content {
      flex-grow: 1;
      /* Add padding/margins if needed to avoid overlap with fixed header */
      /* padding-top: 64px; Example if header has fixed height */
    }
  `]
})
export class MainLayoutComponent {} 