import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-progress-summary-widget',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="widget-card progress-widget">
      <div class="widget-icon">📊</div>
      <div class="widget-title">Progress</div>
      <div class="widget-content">
        <div class="progress-value">{{ overallGrade }}%</div>
        <div class="progress-letter">{{ letterGrade }}</div>
        <div class="progress-trend" [class.positive]="gradeChange > 0" [class.negative]="gradeChange < 0">
          <span *ngIf="gradeChange > 0">↑ +{{ gradeChange }}%</span>
          <span *ngIf="gradeChange < 0">↓ {{ gradeChange }}%</span>
          <span *ngIf="gradeChange === 0">→ No change</span>
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
    
    .progress-value {
      font-size: 2.5rem;
      font-weight: bold;
      color: #B7A57A;
      line-height: 1;
    }
    
    .progress-letter {
      font-size: 1.5rem;
      color: #8B7355;
      margin-top: 0.25rem;
    }
    
    .progress-trend {
      margin-top: 0.75rem;
      font-size: 0.875rem;
      
      &.positive {
        color: #10B981;
      }
      
      &.negative {
        color: #EF4444;
      }
    }

    :host-context(.dark) .widget-card {
      background: #1A365D;
      border-color: #D4C5A0;
    }

    :host-context(.dark) .widget-title {
      color: #9CA3AF;
    }

    :host-context(.dark) .progress-value {
      color: #D4C5A0;
    }

    :host-context(.dark) .progress-letter {
      color: #B7A57A;
    }
  `]
})
export class ProgressSummaryWidgetComponent {
  @Input() overallGrade: number = 0;
  @Input() letterGrade: string = 'N/A';
  @Input() gradeChange: number = 0;
}
