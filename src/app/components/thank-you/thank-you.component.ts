import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-thank-you',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule],
  template: `
    <div class="min-h-screen bg-gradient-to-b from-[#1A365D] to-[#2A4365] text-white relative overflow-hidden flex items-center justify-center">
      <!-- Islamic Pattern Background -->
      <div class="absolute inset-0 bg-[url('/islamic-pattern-1.png')] opacity-10 bg-repeat"></div>
      
      <!-- Content -->
      <div class="relative z-10 text-center px-4">
        <mat-icon class="text-[#B7A57A] text-6xl mb-6">check_circle</mat-icon>
        <h1 class="text-4xl sm:text-5xl font-bold mb-4">Thank You!</h1>
        <p class="text-xl text-gray-300 mb-8 max-w-xl mx-auto">
          You've been added to our waitlist. We'll notify you as soon as Nura AI is ready.
        </p>
        <p class="text-gray-400 mb-8">
          In the meantime, follow us on social media for updates and sneak peeks.
        </p>
        <div class="flex justify-center space-x-6">
         
          <a href="https://www.linkedin.com/in/issekun/" target="_blank" class="text-gray-400 hover:text-[#B7A57A] transition-colors">
            <mat-icon>linkedin</mat-icon>
          </a>
        </div>
        <button routerLink="/" class="mt-12 px-8 py-3 rounded-lg border border-[#B7A57A] hover:bg-[#B7A57A] transition-colors">
          Back to Home
        </button>
      </div>
    </div>
  `
})
export class ThankYouComponent {} 