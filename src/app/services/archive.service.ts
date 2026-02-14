import { Injectable, inject } from '@angular/core';
import { Observable, from, firstValueFrom } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { AssignmentService } from './assignment.service';
import { SubmissionService } from './submission.service';
import { ClassService } from './class.service';
import { Assignment, Submission } from '../models/classroom.models';

export interface ArchiveFilters {
  dateRange: {
    start: Date;
    end: Date;
    preset: 'week' | 'month' | 'semester' | 'all';
  };
  classIds: string[];
  grades: {
    min: number;
    max: number;
  };
  status: ('completed' | 'late' | 'missing')[];
  searchTerm: string;
}

export interface ArchiveStats {
  totalCompleted: number;
  averageGrade: number;
  onTimeRate: number;
  topPerformingClass: string;
}

export interface ArchivedAssignment extends Assignment {
  submission?: Submission | null;
  className?: string;
  isLate?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ArchiveService {
  private assignmentService = inject(AssignmentService);
  private submissionService = inject(SubmissionService);
  private classService = inject(ClassService);

  /**
   * Get archived assignments with filters applied
   */
  getArchivedAssignments(filters?: Partial<ArchiveFilters>): Observable<ArchivedAssignment[]> {
    return this.assignmentService.listAssignmentsForStudent().pipe(
      switchMap(async (assignments) => {
        // Get submissions and class info for all assignments
        const assignmentsWithData = await Promise.all(
          assignments.map(async (assignment) => {
            const submission = await this.submissionService.getSubmissionForStudent(assignment.id);
            const isLate = submission?.submittedAt && assignment.dueAt 
              ? submission.submittedAt > assignment.dueAt 
              : false;
            
            return {
              ...assignment,
              submission,
              isLate
            } as ArchivedAssignment;
          })
        );

        // Get class names
        const classes = await firstValueFrom(this.classService.listMyClasses());
        const classMap = new Map(classes.map(c => [c.id, c.name]));
        
        assignmentsWithData.forEach(a => {
          if (a.classId) {
            a.className = classMap.get(a.classId) || 'Unknown Class';
          } else {
            a.className = 'Individual Assignment';
          }
        });

        // Filter to only completed assignments
        const completed = assignmentsWithData.filter(
          a => a.submission?.status === 'submitted' || a.submission?.status === 'graded'
        );

        // Apply filters if provided
        if (filters) {
          return this.applyFilters(completed, this.getDefaultFilters(filters));
        }

        return completed;
      })
    );
  }

  /**
   * Get archive statistics
   */
  getArchiveStats(filters?: Partial<ArchiveFilters>): Observable<ArchiveStats> {
    return this.getArchivedAssignments(filters).pipe(
      map(assignments => {
        const totalCompleted = assignments.length;
        
        // Calculate average grade
        const gradedAssignments = assignments.filter(a => a.submission?.score != null);
        const averageGrade = gradedAssignments.length > 0
          ? Math.round(gradedAssignments.reduce((sum, a) => sum + (a.submission?.score || 0), 0) / gradedAssignments.length)
          : 0;
        
        // Calculate on-time rate
        const onTimeSubmissions = assignments.filter(a => !a.isLate).length;
        const onTimeRate = totalCompleted > 0
          ? Math.round((onTimeSubmissions / totalCompleted) * 100)
          : 0;
        
        // Find top performing class
        const classScores = new Map<string, number[]>();
        gradedAssignments.forEach(a => {
          const className = a.className || 'Unknown';
          if (!classScores.has(className)) {
            classScores.set(className, []);
          }
          classScores.get(className)!.push(a.submission?.score || 0);
        });
        
        let topPerformingClass = 'N/A';
        let highestAvg = 0;
        
        classScores.forEach((scores, className) => {
          const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
          if (avg > highestAvg) {
            highestAvg = avg;
            topPerformingClass = className;
          }
        });

        return {
          totalCompleted,
          averageGrade,
          onTimeRate,
          topPerformingClass
        };
      })
    );
  }

  /**
   * Export assignments to CSV
   */
  exportToCSV(assignments: ArchivedAssignment[]): Blob {
    const headers = [
      'Title',
      'Class',
      'Due Date',
      'Submitted Date',
      'Status',
      'Grade',
      'On Time'
    ];
    
    const rows = assignments.map(a => [
      this.escapeCsvValue(a.title),
      this.escapeCsvValue(a.className || 'Unknown'),
      a.dueAt ? a.dueAt.toDate().toLocaleDateString() : 'N/A',
      a.submission?.submittedAt ? a.submission.submittedAt.toDate().toLocaleDateString() : 'N/A',
      a.submission?.status || 'N/A',
      a.submission?.score != null ? a.submission.score.toString() : 'N/A',
      a.isLate ? 'Late' : 'On Time'
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  }

  /**
   * Export assignments to PDF (simplified - would need a PDF library for full implementation)
   */
  async exportToPDF(assignments: ArchivedAssignment[]): Promise<Blob> {
    // This is a placeholder. In a real implementation, you would use a library like jsPDF
    // For now, we'll create a simple HTML that can be printed as PDF
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Assignment Archive</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #B7A57A; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #B7A57A; color: white; }
            tr:nth-child(even) { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <h1>Assignment Archive</h1>
          <p>Generated on: ${new Date().toLocaleDateString()}</p>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Class</th>
                <th>Due Date</th>
                <th>Submitted</th>
                <th>Grade</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${assignments.map(a => `
                <tr>
                  <td>${a.title}</td>
                  <td>${a.className || 'Unknown'}</td>
                  <td>${a.dueAt ? a.dueAt.toDate().toLocaleDateString() : 'N/A'}</td>
                  <td>${a.submission?.submittedAt ? a.submission.submittedAt.toDate().toLocaleDateString() : 'N/A'}</td>
                  <td>${a.submission?.score != null ? a.submission.score + '%' : 'N/A'}</td>
                  <td>${a.isLate ? 'Late' : 'On Time'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    
    return new Blob([htmlContent], { type: 'text/html' });
  }

  /**
   * Private helper methods
   */

  private getDefaultFilters(partial: Partial<ArchiveFilters>): ArchiveFilters {
    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setMonth(defaultStart.getMonth() - 6); // Last 6 months
    
    return {
      dateRange: partial.dateRange || {
        start: defaultStart,
        end: now,
        preset: 'all'
      },
      classIds: partial.classIds || [],
      grades: partial.grades || { min: 0, max: 100 },
      status: partial.status || [],
      searchTerm: partial.searchTerm || ''
    };
  }

  private applyFilters(assignments: ArchivedAssignment[], filters: ArchiveFilters): ArchivedAssignment[] {
    return assignments.filter(a => {
      // Date range filter
      if (a.dueAt) {
        const dueDate = a.dueAt.toDate();
        if (dueDate < filters.dateRange.start || dueDate > filters.dateRange.end) {
          return false;
        }
      }
      
      // Class filter
      if (filters.classIds.length > 0 && a.classId && !filters.classIds.includes(a.classId)) {
        return false;
      }
      
      // Grade filter
      if (a.submission?.score != null) {
        if (a.submission.score < filters.grades.min || a.submission.score > filters.grades.max) {
          return false;
        }
      }
      
      // Status filter
      if (filters.status.length > 0) {
        const status = a.isLate ? 'late' : 'completed';
        if (!filters.status.includes(status)) {
          return false;
        }
      }
      
      // Search term filter
      if (filters.searchTerm) {
        const searchLower = filters.searchTerm.toLowerCase();
        const titleMatch = a.title.toLowerCase().includes(searchLower);
        const classMatch = a.className?.toLowerCase().includes(searchLower);
        
        if (!titleMatch && !classMatch) {
          return false;
        }
      }
      
      return true;
    });
  }

  private escapeCsvValue(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Get date presets for filters
   */
  getDatePreset(preset: 'week' | 'month' | 'semester' | 'all'): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now);
    
    switch (preset) {
      case 'week':
        start.setDate(start.getDate() - 7);
        break;
      case 'month':
        start.setMonth(start.getMonth() - 1);
        break;
      case 'semester':
        start.setMonth(start.getMonth() - 4);
        break;
      case 'all':
        start.setFullYear(start.getFullYear() - 2);
        break;
    }
    
    return { start, end: now };
  }
}
