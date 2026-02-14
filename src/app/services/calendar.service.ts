import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { AssignmentService } from './assignment.service';
import { SubmissionService } from './submission.service';
import { Assignment, Submission } from '../models/classroom.models';

export interface CalendarEvent {
  id: string;
  type: 'assignment' | 'exam' | 'event';
  title: string;
  date: Date;
  allDay: boolean;
  status: 'due_today' | 'upcoming' | 'overdue' | 'completed';
  assignmentId?: string;
  color: string;
  icon: string;
  assignment?: Assignment;
  submission?: Submission | null;
}

export interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
  hasOverdue: boolean;
  hasDueToday: boolean;
  hasUpcoming: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class CalendarService {
  private assignmentService = inject(AssignmentService);
  private submissionService = inject(SubmissionService);

  /**
   * Get calendar events for a specific date range
   */
  getCalendarEvents(startDate: Date, endDate: Date): Observable<CalendarEvent[]> {
    return this.assignmentService.listAssignmentsForStudent().pipe(
      switchMap(async (assignments) => {
        // Get submissions for all assignments
        const assignmentsWithSubmissions = await Promise.all(
          assignments.map(async (assignment) => {
            try {
              const submission = await this.submissionService.getSubmissionForStudent(assignment.id);
              return { assignment, submission };
            } catch (error) {
              return { assignment, submission: null };
            }
          })
        );

        // Filter assignments within date range and convert to events
        const events = assignmentsWithSubmissions
          .filter(({ assignment }) => {
            if (!assignment.dueAt) return false;
            const dueDate = assignment.dueAt.toDate();
            return dueDate >= startDate && dueDate <= endDate;
          })
          .map(({ assignment, submission }) => 
            this.assignmentToCalendarEvent(assignment, submission)
          );

        return events;
      })
    );
  }

  /**
   * Get events for a specific date
   */
  getEventsForDate(date: Date): Observable<CalendarEvent[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.getCalendarEvents(startOfDay, endOfDay);
  }

  /**
   * Convert an assignment to a calendar event
   */
  assignmentToCalendarEvent(assignment: Assignment, submission?: Submission | null): CalendarEvent {
    const now = new Date();
    const dueDate = assignment.dueAt ? assignment.dueAt.toDate() : new Date();
    
    let status: CalendarEvent['status'];
    let color: string;
    let icon: string;

    // Determine status based on submission and due date
    if (submission?.status === 'graded' || submission?.status === 'submitted') {
      status = 'completed';
      color = '#10B981'; // Green
      icon = '✅';
    } else if (dueDate < now) {
      status = 'overdue';
      color = '#EF4444'; // Red
      icon = '🔴';
    } else {
      const daysDiff = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDiff === 0) {
        status = 'due_today';
        color = '#DC2626'; // Dark Red
        icon = '🔴';
      } else if (daysDiff <= 3) {
        status = 'upcoming';
        color = '#F59E0B'; // Amber
        icon = '⚠️';
      } else {
        status = 'upcoming';
        color = '#6B7280'; // Gray
        icon = '📅';
      }
    }

    return {
      id: assignment.id,
      type: 'assignment',
      title: assignment.title,
      date: dueDate,
      allDay: false,
      status,
      assignmentId: assignment.id,
      color,
      icon,
      assignment,
      submission
    };
  }

  /**
   * Convert multiple assignments to calendar events
   */
  assignmentsToCalendarEvents(
    assignments: Array<{ assignment: Assignment; submission?: Submission | null }>
  ): CalendarEvent[] {
    return assignments.map(({ assignment, submission }) => 
      this.assignmentToCalendarEvent(assignment, submission)
    );
  }

  /**
   * Generate a month grid for calendar display
   */
  generateMonthGrid(year: number, month: number, events: CalendarEvent[]): CalendarDay[][] {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const startDay = firstDayOfMonth.getDay(); // 0 = Sunday
    const daysInMonth = lastDayOfMonth.getDate();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Create event map by date
    const eventsByDate = new Map<string, CalendarEvent[]>();
    events.forEach(event => {
      const dateKey = this.getDateKey(event.date);
      if (!eventsByDate.has(dateKey)) {
        eventsByDate.set(dateKey, []);
      }
      eventsByDate.get(dateKey)!.push(event);
    });
    
    const weeks: CalendarDay[][] = [];
    let currentWeek: CalendarDay[] = [];
    
    // Add previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonthLastDay - i);
      currentWeek.push(this.createCalendarDay(date, false, today, eventsByDate));
    }
    
    // Add current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      currentWeek.push(this.createCalendarDay(date, true, today, eventsByDate));
      
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    
    // Add next month days to complete the last week
    if (currentWeek.length > 0) {
      let nextMonthDay = 1;
      while (currentWeek.length < 7) {
        const date = new Date(year, month + 1, nextMonthDay);
        currentWeek.push(this.createCalendarDay(date, false, today, eventsByDate));
        nextMonthDay++;
      }
      weeks.push(currentWeek);
    }
    
    return weeks;
  }

  /**
   * Generate week view data
   */
  generateWeekView(startDate: Date, events: CalendarEvent[]): CalendarDay[] {
    const days: CalendarDay[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Create event map by date
    const eventsByDate = new Map<string, CalendarEvent[]>();
    events.forEach(event => {
      const dateKey = this.getDateKey(event.date);
      if (!eventsByDate.has(dateKey)) {
        eventsByDate.set(dateKey, []);
      }
      eventsByDate.get(dateKey)!.push(event);
    });
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      days.push(this.createCalendarDay(date, true, today, eventsByDate));
    }
    
    return days;
  }

  /**
   * Get the start of the week for a given date (Sunday)
   */
  getWeekStart(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay();
    const diff = result.getDate() - day;
    result.setDate(diff);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  /**
   * Get the end of the week for a given date (Saturday)
   */
  getWeekEnd(date: Date): Date {
    const start = this.getWeekStart(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  /**
   * Private helper methods
   */

  private createCalendarDay(
    date: Date,
    isCurrentMonth: boolean,
    today: Date,
    eventsByDate: Map<string, CalendarEvent[]>
  ): CalendarDay {
    const dateKey = this.getDateKey(date);
    const events = eventsByDate.get(dateKey) || [];
    
    const dayDate = new Date(date);
    dayDate.setHours(0, 0, 0, 0);
    
    return {
      date: new Date(date),
      isCurrentMonth,
      isToday: dayDate.getTime() === today.getTime(),
      events,
      hasOverdue: events.some(e => e.status === 'overdue'),
      hasDueToday: events.some(e => e.status === 'due_today'),
      hasUpcoming: events.some(e => e.status === 'upcoming')
    };
  }

  private getDateKey(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().split('T')[0];
  }
}
