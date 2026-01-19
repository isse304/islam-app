import { Directive, Input, ElementRef, Renderer2, OnInit, OnDestroy, HostListener } from '@angular/core';

export interface HoverPreviewConfig {
  title: string;
  description: string;
  benefits: string[];
  icon: string;
  ctaText: string;
}

@Directive({
  selector: '[appPremiumHoverPreview]',
  standalone: true
})
export class PremiumHoverPreviewDirective implements OnInit, OnDestroy {
  @Input() appPremiumHoverPreview!: HoverPreviewConfig;
  
  private previewCard: HTMLElement | null = null;
  private hideTimeout: any;

  constructor(
    private el: ElementRef,
    private renderer: Renderer2
  ) {}

  ngOnInit() {
    // Make the host element relative for positioning
    this.renderer.setStyle(this.el.nativeElement, 'position', 'relative');
  }

  @HostListener('mouseenter')
  onMouseEnter() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }
    this.showPreview();
  }

  @HostListener('mouseleave')
  onMouseLeave() {
    this.hideTimeout = setTimeout(() => {
      this.hidePreview();
    }, 300); // Delay to allow moving to the preview card
  }

  private showPreview() {
    if (this.previewCard) return;

    const config = this.appPremiumHoverPreview;
    
    // Create preview card
    this.previewCard = this.renderer.createElement('div');
    this.renderer.addClass(this.previewCard, 'premium-hover-preview');
    
    if (this.previewCard) {
      this.previewCard.innerHTML = `
      <div class="preview-header">
        <div class="preview-icon">
          <i class="material-icons">${config.icon}</i>
        </div>
        <h3 class="preview-title">${config.title}</h3>
        <span class="premium-badge">
          <i class="material-icons">workspace_premium</i>
          Premium
        </span>
      </div>
      
      <p class="preview-description">${config.description}</p>
      
      <div class="preview-benefits">
        ${config.benefits.map(benefit => `
          <div class="benefit-item">
            <i class="material-icons">check_circle</i>
            <span>${benefit}</span>
          </div>
        `).join('')}
      </div>
      
      <div class="preview-cta">
        <i class="material-icons">arrow_forward</i>
        ${config.ctaText}
      </div>
    `;
    }

    // Append to host element
    if (this.previewCard) {
      this.renderer.appendChild(this.el.nativeElement, this.previewCard);

      // Prevent card from closing when hovering over it
      this.renderer.listen(this.previewCard, 'mouseenter', () => {
        if (this.hideTimeout) {
          clearTimeout(this.hideTimeout);
        }
      });

      this.renderer.listen(this.previewCard, 'mouseleave', () => {
        this.hidePreview();
      });

      // Animate in
      setTimeout(() => {
        if (this.previewCard) {
          this.renderer.addClass(this.previewCard, 'show');
        }
      }, 10);
    }
  }

  private hidePreview() {
    if (!this.previewCard) return;

    this.renderer.removeClass(this.previewCard, 'show');
    
    setTimeout(() => {
      if (this.previewCard && this.previewCard.parentNode) {
        this.renderer.removeChild(this.el.nativeElement, this.previewCard);
        this.previewCard = null;
      }
    }, 300);
  }

  ngOnDestroy() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }
    if (this.previewCard) {
      this.hidePreview();
    }
  }
}
