import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Assignment } from '../../../models/assignment.model';
import { AssignmentService } from '../../../services/assignment.service';

@Component({
  selector: 'app-assignment-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './assignment-card.component.html',
  styleUrls: ['./assignment-card.component.scss']
})
export class AssignmentCardComponent {
  @Input() assignment!: Assignment;
  @Input() compact: boolean = false;
  @Output() onSubmit = new EventEmitter<Assignment>();
  @Output() onViewDetails = new EventEmitter<Assignment>();

  constructor(
    private assignmentService: AssignmentService,
    private router: Router
  ) {}

  get urgencyClass(): string {
    const urgency = this.assignmentService.getUrgencyLevel(this.assignment);
    return `urgency-${urgency}`;
  }

  get statusIcon(): string {
    switch (this.assignment.status) {
      case 'submitted':
        return '✓';
      case 'graded':
        return '✓';
      case 'in_progress':
        return '💭';
      case 'overdue':
        return '❌';
      default:
        return '';
    }
  }

  get statusText(): string {
    switch (this.assignment.status) {
      case 'submitted':
        return 'Submitted';
      case 'graded':
        return `Graded: ${this.assignment.grade || this.assignment.earnedPoints + '/' + this.assignment.totalPoints}`;
      case 'in_progress':
        return 'In Progress';
      case 'overdue':
        return 'Overdue';
      case 'not_started':
        return 'Not Started';
      default:
        return '';
    }
  }

  get typeIcon(): string {
    switch (this.assignment.type) {
      case 'quiz':
        return '📝';
      case 'essay':
        return '📄';
      case 'recording':
        return '🎙️';
      case 'project':
        return '📊';
      case 'worksheet':
        return '📋';
      case 'reading':
        return '📖';
      default:
        return '📚';
    }
  }

  get timeUntilDue(): string {
    return this.assignmentService.getTimeUntilDue(this.assignment.dueDate);
  }

  get estimatedTimeText(): string {
    if (!this.assignment.estimatedTime) return '';
    
    const hours = Math.floor(this.assignment.estimatedTime / 60);
    const minutes = this.assignment.estimatedTime % 60;
    
    if (hours > 0) {
      return `🕐 ${hours}h ${minutes}m`;
    }
    return `🕐 ${minutes}m`;
  }

  viewDetails(): void {
    this.onViewDetails.emit(this.assignment);
    this.router.navigate(['/student/assignments', this.assignment.id]);
  }

  startAssignment(): void {
    this.router.navigate(['/student/assignments', this.assignment.id]);
  }

  continueAssignment(): void {
    this.router.navigate(['/student/assignments', this.assignment.id]);
  }

  submitAssignment(): void {
    this.onSubmit.emit(this.assignment);
  }
}







