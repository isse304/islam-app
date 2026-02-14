import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-today-focus-widget',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="widget-card today-widget">
      <div class="widget-icon">🎯</div>
      <div class="widget-title">Today's Focus</div>
      <div class="widget-content">
        <div class="task-counter">
          <span class="completed">{{ completedToday }}</span>
          <span class="separator">/</span>
          <span class="total">{{ totalToday }}</span>
        </div>
        <div class="task-label">Tasks Completed</div>
        <div class="progress-bar">
          <div class="progress-fill" [style.width.%]="completionPercentage"></div>
        </div>
        <div class="motivational-text" *ngIf="completionPercentage === 100">
          <span>🎉 All done for today!</span>
        </div>
        <div class="motivational-text" *ngIf="completionPercentage < 100 && totalToday > 0">
          <span>Keep going! 💪</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .widget-card {
      background: white;
      border: 2px solid #B7A57A;
      border-radius: 12px;
      padding: 1.5rem;
      text-align: center;
      position: relative;
      overflow: hidden;
      transition: all 0.3s ease;
      
      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(183, 165, 122, 0.2);
      }
      
      &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: url('/assets/islamic-pattern-2.png');
        opacity: 0.03;
        pointer-events: none;
      }
    }
    
    .widget-icon {
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }
    
    .widget-title {
      font-size: 0.875rem;
      color: #6B7280;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 1rem;
      font-weight: 600;
    }
    
    .task-counter {
      font-size: 2.5rem;
      font-weight: bold;
      line-height: 1;
      margin-bottom: 0.5rem;
      
      .completed {
        color: #10B981;
      }
      
      .separator {
        color: #6B7280;
        margin: 0 0.25rem;
      }
      
      .total {
        color: #B7A57A;
      }
    }
    
    .task-label {
      font-size: 0.875rem;
      color: #6B7280;
      margin-bottom: 0.75rem;
    }
    
    .progress-bar {
      width: 100%;
      height: 8px;
      background: #E5E7EB;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 0.75rem;
      
      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #B7A57A, #D4C5A0);
        transition: width 0.3s ease;
      }
    }
    
    .motivational-text {
      font-size: 0.875rem;
      color: #8B7355;
      font-weight: 500;
    }

    :host-context(.dark) .widget-card {
      background: #1A365D;
      border-color: #D4C5A0;
    }

    :host-context(.dark) .widget-title,
    :host-context(.dark) .task-label {
      color: #9CA3AF;
    }

    :host-context(.dark) .total {
      color: #D4C5A0;
    }

    :host-context(.dark) .progress-bar {
      background: #0F2847;
    }
  `]
})
export class TodayFocusWidgetComponent {
  @Input() completedToday: number = 0;
  @Input() totalToday: number = 0;
  
  get completionPercentage(): number {
    return this.totalToday > 0 ? (this.completedToday / this.totalToday) * 100 : 0;
  }
}
