import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-week-overview-widget',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="widget-card week-widget">
      <div class="widget-icon">📅</div>
      <div class="widget-title">This Week</div>
      <div class="widget-content">
        <div class="week-stats">
          <div class="stat-row">
            <span class="stat-label">Due:</span>
            <span class="stat-value due">{{ dueThisWeek }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Completed:</span>
            <span class="stat-value completed">{{ completedThisWeek }}</span>
          </div>
          <div class="stat-row" *ngIf="overdueThisWeek > 0">
            <span class="stat-label">Overdue:</span>
            <span class="stat-value overdue">{{ overdueThisWeek }}</span>
          </div>
        </div>
        <div class="completion-rate">
          {{ completionRate }}% completion
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
    
    .week-stats {
      margin-bottom: 1rem;
    }
    
    .stat-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0;
      border-bottom: 1px solid #E5E7EB;
      
      &:last-child {
        border-bottom: none;
      }
      
      .stat-label {
        font-size: 0.875rem;
        color: #6B7280;
      }
      
      .stat-value {
        font-size: 1.25rem;
        font-weight: bold;
        
        &.due {
          color: #B7A57A;
        }
        
        &.completed {
          color: #10B981;
        }
        
        &.overdue {
          color: #EF4444;
        }
      }
    }
    
    .completion-rate {
      font-size: 0.875rem;
      color: #8B7355;
      font-weight: 500;
      padding-top: 0.75rem;
      border-top: 1px solid #E5E7EB;
    }

    :host-context(.dark) .widget-card {
      background: #1A365D;
      border-color: #D4C5A0;
    }

    :host-context(.dark) .widget-title,
    :host-context(.dark) .stat-label {
      color: #9CA3AF;
    }

    :host-context(.dark) .stat-value.due {
      color: #D4C5A0;
    }

    :host-context(.dark) .stat-row {
      border-color: #0F2847;
    }

    :host-context(.dark) .completion-rate {
      color: #B7A57A;
      border-color: #0F2847;
    }
  `]
})
export class WeekOverviewWidgetComponent {
  @Input() dueThisWeek: number = 0;
  @Input() completedThisWeek: number = 0;
  @Input() overdueThisWeek: number = 0;
  
  get completionRate(): number {
    const total = this.dueThisWeek + this.completedThisWeek;
    return total > 0 ? Math.round((this.completedThisWeek / total) * 100) : 0;
  }
}
