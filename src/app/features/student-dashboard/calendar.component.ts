import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CalendarService, CalendarEvent } from '../../services/calendar.service';
import { MonthViewComponent } from './calendar/month-view.component';
import { WeekViewComponent } from './calendar/week-view.component';

type CalendarView = 'month' | 'week';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, MonthViewComponent, WeekViewComponent],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.scss']
})
export class CalendarComponent implements OnInit {
  private calendarService = inject(CalendarService);
  private cdr = inject(ChangeDetectorRef);
  
  currentView: CalendarView = 'month';
  currentDate = new Date();
  events: CalendarEvent[] = [];
  loading = true;
  
  get currentMonthYear(): string {
    return this.currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  ngOnInit(): void {
    this.loadEvents();
  }

  setView(view: CalendarView): void {
    this.currentView = view;
  }

  previousPeriod(): void {
    if (this.currentView === 'month') {
      this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
    } else {
      const weekStart = this.calendarService.getWeekStart(this.currentDate);
      weekStart.setDate(weekStart.getDate() - 7);
      this.currentDate = weekStart;
    }
    this.loadEvents();
  }

  nextPeriod(): void {
    if (this.currentView === 'month') {
      this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
    } else {
      const weekStart = this.calendarService.getWeekStart(this.currentDate);
      weekStart.setDate(weekStart.getDate() + 7);
      this.currentDate = weekStart;
    }
    this.loadEvents();
  }

  today(): void {
    this.currentDate = new Date();
    this.loadEvents();
  }

  private loadEvents(): void {
    this.loading = true;
    
    let startDate: Date;
    let endDate: Date;
    
    if (this.currentView === 'month') {
      // Get first and last day of month, extended to full weeks
      const firstDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
      const lastDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);
      
      // Extend to full weeks
      startDate = new Date(firstDay);
      startDate.setDate(startDate.getDate() - firstDay.getDay());
      startDate.setHours(0, 0, 0, 0);
      
      endDate = new Date(lastDay);
      endDate.setDate(endDate.getDate() + (6 - lastDay.getDay()));
      endDate.setHours(23, 59, 59, 999);
    } else {
      // Week view
      startDate = this.calendarService.getWeekStart(this.currentDate);
      endDate = this.calendarService.getWeekEnd(this.currentDate);
    }
    
    this.calendarService.getCalendarEvents(startDate, endDate).subscribe({
      next: (events) => {
        this.events = events;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }
}
