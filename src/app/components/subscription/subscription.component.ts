import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-subscription',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-[#FAF3E0] py-8">
      <div class="container mx-auto px-4">
        <h1 class="text-3xl font-bold text-[#B7A57A] text-center mb-8">Premium Features</h1>
        <!-- Premium content here -->
      </div>
    </div>
  `
})
export class SubscriptionComponent {
  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}
} 