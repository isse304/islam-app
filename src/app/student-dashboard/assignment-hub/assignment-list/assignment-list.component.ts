import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Assignment, AssignmentCategory } from '../../../models/assignment.model';
import { AssignmentCardComponent } from '../assignment-card/assignment-card.component';

@Component({
  selector: 'app-assignment-list',
  standalone: true,
  imports: [CommonModule, AssignmentCardComponent],
  templateUrl: './assignment-list.component.html',
  styleUrls: ['./assignment-list.component.scss']
})
export class AssignmentListComponent {
  @Input() assignments: Assignment[] = [];
  @Input() category!: AssignmentCategory;
  @Input() title!: string;
  @Input() icon!: string;
  @Input() showCount: boolean = true;
  @Input() collapsible: boolean = false;
  @Input() initiallyCollapsed: boolean = false;
  @Input() maxVisible: number = 0; // 0 = show all
  @Output() onViewAll = new EventEmitter<AssignmentCategory>();

  isCollapsed = false;
  showAll = false;

  ngOnInit() {
    this.isCollapsed = this.initiallyCollapsed;
  }

  get visibleAssignments(): Assignment[] {
    if (this.showAll || this.maxVisible === 0) {
      return this.assignments;
    }
    return this.assignments.slice(0, this.maxVisible);
  }

  get hiddenCount(): number {
    if (this.maxVisible === 0 || this.showAll) {
      return 0;
    }
    return Math.max(0, this.assignments.length - this.maxVisible);
  }

  get categoryClass(): string {
    return `category-${this.category}`;
  }

  get categoryIcon(): string {
    if (this.icon) return this.icon;
    
    switch (this.category) {
      case 'due_today':
        return '🔴';
      case 'upcoming':
        return '⚠️';
      case 'due_later':
        return '📅';
      case 'completed':
        return '✅';
      case 'overdue':
        return '❌';
      case 'draft':
        return '💭';
      default:
        return '📚';
    }
  }

  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
  }

  toggleShowAll() {
    this.showAll = !this.showAll;
  }

  viewAllClicked() {
    this.onViewAll.emit(this.category);
  }
}







