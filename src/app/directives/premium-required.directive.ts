import { Directive, ElementRef, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStateService } from '../services/auth-state.service';
import { SubscriptionService } from '../services/subscription.service';

@Directive({
  selector: '[premiumRequired]'
})
export class PremiumRequiredDirective implements OnInit, OnDestroy {
  private isPremium = false;

  constructor(
    private el: ElementRef,
    private authStateService: AuthStateService,
    private subscriptionService: SubscriptionService,
    private router: Router
  ) {}

  @HostListener('click', ['$event'])
  async onClick(event: Event) {
    if (!this.isPremium) {
      event.preventDefault();
      event.stopPropagation();
      await this.subscriptionService.showSubscriptionDialog('Premium Feature');
    }
  }

  ngOnInit() {
    this.authStateService.isPremiumUser$.subscribe(isPremium => {
      this.isPremium = isPremium;
      if (!isPremium) {
        this.el.nativeElement.style.opacity = '0.5';
        this.el.nativeElement.style.cursor = 'not-allowed';
        
        // Add lock icon if it doesn't exist
        if (!this.el.nativeElement.querySelector('.premium-lock-icon')) {
          const lockIcon = document.createElement('i');
          lockIcon.className = 'fas fa-lock premium-lock-icon';
          lockIcon.style.marginLeft = '0.5rem';
          this.el.nativeElement.appendChild(lockIcon);
        }
      } else {
        this.el.nativeElement.style.opacity = '';
        this.el.nativeElement.style.cursor = '';
        const lockIcon = this.el.nativeElement.querySelector('.premium-lock-icon');
        if (lockIcon) {
          lockIcon.remove();
        }
      }
    });
  }

  ngOnDestroy() {
    // Cleanup if needed
  }
} 