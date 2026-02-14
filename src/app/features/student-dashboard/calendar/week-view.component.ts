import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CalendarService, CalendarEvent, CalendarDay } from '../../../services/calendar.service';

@Component({
  selector: 'app-week-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="week-view">
      <div class="week-grid">
        <div 
          class="day-column"
          *ngFor="let day of days"
          [class.today]="day.isToday"
          [class.has-events]="day.events.length > 0">
          
          <div class="day-header">
            <div class="day-name">{{ day.date | date:'EEE' }}</div>
            <div class="day-number" [class.today-number]="day.isToday">
              {{ day.date | date:'d' }}
            </div>
          </div>
          
          <div class="day-content">
            <div class="no-events" *ngIf="day.events.length === 0">
              <span>No assignments</span>
            </div>
            
            <div class="event-list" *ngIf="day.events.length > 0">
              <div 
                class="event-card"
                *ngFor="let event of day.events"
                [class.overdue]="event.status === 'overdue' || event.status === 'due_today'"
                [class.upcoming]="event.status === 'upcoming'"
                [class.completed]="event.status === 'completed'">
                
                <div class="event-time">
                  {{ event.date | date:'shortTime' }}
                </div>
                <div class="event-title">
                  <span class="event-icon">{{ event.icon }}</span>
                  {{ event.title }}
                </div>
                <div class="event-status" *ngIf="event.assignment">
                  <span *ngIf="event.assignment.surah">
                    📖 Surah {{ event.assignment.surah }}:{{ event.assignment.startAyah }}-{{ event.assignment.endAyah }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .week-view {
      background: white;
      border: 2px solid #B7A57A;
      border-radius: 12px;
      overflow: hidden;
      position: relative;
      
      &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: url('/assets/islamic-pattern-2.png');
        opacity: 0.02;
        pointer-events: none;
      }
    }
    
    .week-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      position: relative;
      z-index: 1;
      
      .day-column {
        border-right: 1px solid #E5E7EB;
        min-height: 400px;
        
        &:last-child {
          border-right: none;
        }
        
        &.today {
          background: rgba(245, 158, 11, 0.05);
          
          .day-header {
            background: #FEF3C7;
          }
        }
        
        .day-header {
          padding: 1rem;
          text-align: center;
          background: linear-gradient(135deg, #B7A57A 0%, #D4C5A0 100%);
          border-bottom: 2px solid #8B7355;
          
          .day-name {
            font-size: 0.875rem;
            font-weight: 600;
            color: white;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 0.25rem;
          }
          
          .day-number {
            font-size: 1.5rem;
            font-weight: bold;
            color: white;
            
            &.today-number {
              background: #F59E0B;
              width: 36px;
              height: 36px;
              border-radius: 50%;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              margin: 0 auto;
            }
          }
        }
        
        .day-content {
          padding: 1rem 0.5rem;
          
          .no-events {
            text-align: center;
            padding: 2rem 0.5rem;
            color: #9CA3AF;
            font-size: 0.875rem;
            font-style: italic;
          }
          
          .event-list {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            
            .event-card {
              background: #F9FAFB;
              border-left: 3px solid;
              border-radius: 4px;
              padding: 0.75rem;
              transition: all 0.2s;
              cursor: pointer;
              
              &:hover {
                transform: translateX(2px);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
              }
              
              .event-time {
                font-size: 0.75rem;
                color: #6B7280;
                margin-bottom: 0.25rem;
              }
              
              .event-title {
                font-size: 0.875rem;
                font-weight: 600;
                color: #111827;
                margin-bottom: 0.25rem;
                display: flex;
                align-items: center;
                gap: 0.25rem;
                
                .event-icon {
                  font-size: 1rem;
                }
              }
              
              .event-status {
                font-size: 0.75rem;
                color: #6B7280;
              }
              
              &.overdue {
                border-left-color: #EF4444;
                background: rgba(239, 68, 68, 0.05);
              }
              
              &.upcoming {
                border-left-color: #F59E0B;
                background: rgba(245, 158, 11, 0.05);
              }
              
              &.completed {
                border-left-color: #10B981;
                background: rgba(16, 185, 129, 0.05);
                opacity: 0.7;
              }
            }
          }
        }
      }
    }
    
    :host-context(.dark) .week-view {
      background: #1A365D;
      border-color: #D4C5A0;
      
      .week-grid .day-column {
        border-right-color: #243F6B;
        
        &.today {
          background: rgba(245, 158, 11, 0.1);
        }
        
        .day-header {
          background: linear-gradient(135deg, #1A365D 0%, #243F6B 100%);
          border-bottom-color: #0F2847;
        }
        
        .day-content {
          .event-list .event-card {
            background: #0F2847;
            
            .event-title {
              color: #E5E7EB;
            }
            
            &.overdue {
              background: rgba(239, 68, 68, 0.1);
            }
            
            &.upcoming {
              background: rgba(245, 158, 11, 0.1);
            }
            
            &.completed {
              background: rgba(16, 185, 129, 0.1);
            }
          }
        }
      }
    }
    
    @media (max-width: 768px) {
      .week-grid {
        grid-template-columns: 1fr;
        
        .day-column {
          border-right: none;
          border-bottom: 1px solid #E5E7EB;
          min-height: auto;
          
          &:last-child {
            border-bottom: none;
          }
        }
      }
    }
  `]
})
export class WeekViewComponent implements OnChanges {
  @Input() currentDate!: Date;
  @Input() events: CalendarEvent[] = [];
  
  private calendarService = inject(CalendarService);
  
  days: CalendarDay[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentDate'] || changes['events']) {
      this.generateWeek();
    }
  }

  private generateWeek(): void {
    const weekStart = this.calendarService.getWeekStart(this.currentDate);
    this.days = this.calendarService.generateWeekView(weekStart, this.events);
  }
}
