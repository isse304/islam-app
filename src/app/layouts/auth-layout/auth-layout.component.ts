import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [CommonModule, RouterModule], // Import necessary modules
  template: `
    <!-- No header or footer here -->
    <router-outlet></router-outlet>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh; /* Ensure it takes full height */
    }
  `]
})
export class AuthLayoutComponent {} 