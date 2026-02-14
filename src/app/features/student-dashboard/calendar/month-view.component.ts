import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CalendarService, CalendarEvent, CalendarDay } from '../../../services/calendar.service';

@Component({
  selector: 'app-month-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="month-view">
      <!-- Weekday Headers -->
      <div class="weekday-headers">
        <div class="weekday-header" *ngFor="let day of weekdays">{{ day }}</div>
      </div>

      <!-- Calendar Grid -->
      <div class="calendar-grid">
        <div 
          class="calendar-day"
          *ngFor="let week of weeks"
          [class.not-current-month]="!week.isCurrentMonth"
          [class.today]="week.isToday"
          [class.has-events]="week.events.length > 0"
          [class.has-overdue]="week.hasOverdue"
          [class.has-due-today]="week.hasDueToday">
          
          <div class="day-header">
            <span class="day-number">{{ week.date | date:'d' }}</span>
          </div>
          
          <div class="day-events" *ngIf="week.events.length > 0">
            <div 
              class="event-indicator" 
              *ngFor="let event of week.events.slice(0, 3)"
              [class.overdue]="event.status === 'overdue' || event.status === 'due_today'"
              [class.upcoming]="event.status === 'upcoming'"
              [class.completed]="event.status === 'completed'">
              <span class="event-icon">{{ event.icon }}</span>
              <span class="event-count" *ngIf="week.events.length > 1 && event === week.events[0]">
                {{ week.events.length }}
              </span>
            </div>
            <div class="more-events" *ngIf="week.events.length > 3">
              +{{ week.events.length - 3 }} more
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .month-view {
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
    
    .weekday-headers {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      background: linear-gradient(135deg, #B7A57A 0%, #D4C5A0 100%);
      position: relative;
      z-index: 1;
      
      .weekday-header {
        padding: 1rem;
        text-align: center;
        font-weight: 600;
        color: white;
        font-size: 0.875rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
    }
    
    .calendar-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      position: relative;
      z-index: 1;
      
      .calendar-day {
        min-height: 100px;
        border: 1px solid #E5E7EB;
        padding: 0.5rem;
        transition: all 0.2s;
        cursor: pointer;
        
        &:hover {
          background: #FAF3E0;
          border-color: #B7A57A;
        }
        
        &.not-current-month {
          background: #F9FAFB;
          opacity: 0.5;
        }
        
        &.today {
          background: #FEF3C7;
          border: 2px solid #F59E0B;
          
          .day-number {
            background: #F59E0B;
            color: white;
          }
        }
        
        &.has-overdue,
        &.has-due-today {
          border-left: 3px solid #EF4444;
        }
        
        .day-header {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 0.5rem;
          
          .day-number {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            font-size: 0.875rem;
            font-weight: 600;
            color: #6B7280;
          }
        }
        
        .day-events {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          
          .event-indicator {
            display: flex;
            align-items: center;
            gap: 0.25rem;
            padding: 0.25rem;
            border-radius: 4px;
            font-size: 0.75rem;
            
            .event-icon {
              font-size: 0.875rem;
            }
            
            .event-count {
              background: #6B7280;
              color: white;
              padding: 0 0.375rem;
              border-radius: 10px;
              font-size: 0.625rem;
              font-weight: 600;
            }
            
            &.overdue {
              background: rgba(239, 68, 68, 0.1);
              
              .event-count {
                background: #EF4444;
              }
            }
            
            &.upcoming {
              background: rgba(245, 158, 11, 0.1);
              
              .event-count {
                background: #F59E0B;
              }
            }
            
            &.completed {
              background: rgba(16, 185, 129, 0.1);
              
              .event-count {
                background: #10B981;
              }
            }
          }
          
          .more-events {
            font-size: 0.625rem;
            color: #6B7280;
            padding: 0.125rem 0.25rem;
          }
        }
      }
    }
    
    :host-context(.dark) .month-view {
      background: #1A365D;
      border-color: #D4C5A0;
      
      .calendar-grid .calendar-day {
        border-color: #243F6B;
        
        &:hover {
          background: #243F6B;
          border-color: #D4C5A0;
        }
        
        &.not-current-month {
          background: #0F2847;
        }
        
        .day-number {
          color: #9CA3AF;
        }
      }
    }
    
    @media (max-width: 768px) {
      .calendar-grid .calendar-day {
        min-height: 80px;
        padding: 0.25rem;
        
        .day-header .day-number {
          width: 24px;
          height: 24px;
          font-size: 0.75rem;
        }
        
        .day-events {
          .event-indicator {
            font-size: 0.625rem;
            padding: 0.125rem;
            
            .event-icon {
              font-size: 0.75rem;
            }
          }
          
          .more-events {
            font-size: 0.5rem;
          }
        }
      }
      
      .weekday-headers .weekday-header {
        padding: 0.5rem;
        font-size: 0.625rem;
      }
    }
  `]
})
export class MonthViewComponent implements OnChanges {
  @Input() currentDate!: Date;
  @Input() events: CalendarEvent[] = [];
  
  private calendarService = inject(CalendarService);
  
  weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  weeks: CalendarDay[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentDate'] || changes['events']) {
      this.generateCalendar();
    }
  }

  private generateCalendar(): void {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    
    const weeksGrid = this.calendarService.generateMonthGrid(year, month, this.events);
    
    // Flatten the 2D array into a 1D array for the template
    this.weeks = weeksGrid.flat();
  }
}
