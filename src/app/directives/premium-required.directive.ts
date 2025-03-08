import { Directive, ElementRef, OnInit, OnDestroy, HostListener } from '@angular/core';
import { AuthStateService } from '../services/auth-state.service';
import { NotificationService } from '../services/notification.service';
import { Subscription } from 'rxjs';

@Directive({
  selector: '[premiumRequired]'
})
export class PremiumRequiredDirective implements OnInit, OnDestroy {
  private subscription: Subscription | undefined;
  private isPremium = false;

  constructor(
    private el: ElementRef,
    private authStateService: AuthStateService,
    private notificationService: NotificationService
  ) {}

  @HostListener('click', ['$event'])
  onClick(event: Event) {
    if (!this.isPremium) {
      event.preventDefault();
      event.stopPropagation();
      this.notificationService.info('This is a premium feature. Please upgrade to access AI-powered features.');
    }
  }

  ngOnInit() {
    // Hide the element by default
    this.el.nativeElement.style.display = 'none';
    
    this.subscription = this.authStateService.isPremiumUser$.subscribe(
      isPremium => {
        this.isPremium = isPremium;
        
        if (isPremium) {
          // Show element and enable interactions
          this.el.nativeElement.style.display = '';
          this.el.nativeElement.style.opacity = '';
          this.el.nativeElement.style.cursor = '';
        } else {
          // Hide element completely
          this.el.nativeElement.style.display = 'none';
        }
      }
    );
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
} 