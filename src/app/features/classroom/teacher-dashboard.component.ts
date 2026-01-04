import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Observable } from 'rxjs';
import { Class, IndividualStudent } from '../../models/classroom.models';
import { ClassService } from '../../services/class.service';
import { AssignmentService } from '../../services/assignment.service';
import { SubmissionService } from 'src/app/services/submission.service';
import { IndividualStudentService } from 'src/app/services/individual-student.service';
import { Submission } from 'src/app/models/classroom.models';
import { Assignment } from 'src/app/models/classroom.models';
import { GradePanelComponent } from 'src/app/features/submissions/grade-panel.component';
import { AssignmentFormComponent } from './assignment-form.component';
import { ToastService } from 'src/app/services/toast.service';
import { FirebaseAuthService } from 'src/app/services/firebase-auth.service';

@Component({
  selector: 'app-teacher-dashboard',
  templateUrl: './teacher-dashboard.component.html',
  styleUrls: ['./teacher-dashboard.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule, GradePanelComponent, AssignmentFormComponent],
})
export class TeacherDashboardComponent implements OnInit {
  private fb = inject(FormBuilder);
  private classService = inject(ClassService);
  private assignmentService = inject(AssignmentService);
  private submissionService = inject(SubmissionService);
  private individualStudentService = inject(IndividualStudentService);
  private toastService = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);
  private authService = inject(FirebaseAuthService);

  // Mode toggle
  mode: 'classroom' | 'individual' = 'classroom';
  private readonly MODE_STORAGE_KEY = 'teacher_dashboard_mode';

  // Classroom mode
  createClassForm: FormGroup;
  myClasses$!: Observable<Class[]>;
  assignmentsForClass: { [classId: string]: Observable<Assignment[]> } = {};
  showAssignmentFormForClass: string | null = null;
  expandedClassId: string | null = null; // Track which class is expanded

  // Individual mode
  addStudentForm: FormGroup;
  myStudents$!: Observable<IndividualStudent[]>;
  assignmentsForStudent: { [studentId: string]: Observable<Assignment[]> } = {};
  showAddStudentForm = false;
  showAssignmentFormForStudent: string | null = null;
  expandedStudentId: string | null = null; // Track which student is expanded

  // Shared
  createAssignmentForm: FormGroup;
  submissionsForAssignment: { [assignmentId: string]: Observable<Submission[]> } = {};
  selectedSubmissionForGrading: Submission | null = null;
  editingAssignment: Assignment | null = null; // Track assignment being edited
  
  // Ungraded submission counts (for badges)
  ungradedCountForAssignment: { [assignmentId: string]: Observable<number> } = {};
  
  // Student names cache
  studentNames: { [studentId: string]: string } = {};

  constructor() {
    this.createClassForm = this.fb.group({
      name: ['', Validators.required],
    });

    this.addStudentForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      name: [''],
      notes: [''],
    });

    this.createAssignmentForm = this.fb.group({
      title: ['', Validators.required],
      surah: [null, [Validators.required, Validators.min(1), Validators.max(114)]],
      startAyah: [null, [Validators.required, Validators.min(1)]],
      endAyah: [null, [Validators.required, Validators.min(1)]],
      dueAt: ['', Validators.required],
      notes: [''],
    });
  }

  ngOnInit(): void {
    // Restore saved mode from localStorage
    const savedMode = localStorage.getItem(this.MODE_STORAGE_KEY) as 'classroom' | 'individual' | null;
    if (savedMode === 'classroom' || savedMode === 'individual') {
      this.mode = savedMode;
    }
    this.loadData();
  }

  switchMode(newMode: 'classroom' | 'individual') {
    this.mode = newMode;
    // Save mode to localStorage
    localStorage.setItem(this.MODE_STORAGE_KEY, newMode);
    this.loadData();
  }

  loadData() {
    if (this.mode === 'classroom') {
      this.myClasses$ = this.classService.listMyClasses();
    } else {
      this.myStudents$ = this.individualStudentService.listMyStudents();
      
      // Load ungraded counts for each student
      this.myStudents$.subscribe({
        next: (students) => {
          // Students loaded successfully
        },
        error: (error) => {
          console.error('Error loading students:', error);
        }
      });
    }
  }

  async createClass() {
    if (this.createClassForm.invalid) {
      this.toastService.error('Please enter a class name.');
      return;
    }

    const className = this.createClassForm.value.name;

    try {
      await this.classService.createClass(className);
      this.createClassForm.reset();
      // Force refresh the list
      this.myClasses$ = this.classService.listMyClasses();
      this.cdr.detectChanges();
      this.toastService.success(`✓ Class "${className}" created successfully!`);
    } catch (error: any) {
      console.error('Error creating class:', error);
      this.toastService.error(error.message || 'Failed to create class. Please try again.');
    }
  }

  async deleteClass(classId: string, className: string) {
    const confirmed = confirm(`Are you sure you want to delete the class "${className}"?\n\nThis will:\n• Remove all students from the class\n• Keep assignments and submissions (they will be archived)\n\nThis action cannot be undone.`);
    
    if (!confirmed) return;

    try {
      await this.classService.deleteClass(classId);
      
      // Refresh the list
      this.myClasses$ = this.classService.listMyClasses();
      this.cdr.detectChanges();
      
      this.toastService.success(`✓ Class "${className}" deleted successfully.`);
    } catch (error: any) {
      console.error('Error deleting class:', error);
      this.toastService.error(error.message || 'Failed to delete class. Please try again.');
    }
  }

  toggleAssignmentForm(classId: string) {
    if (this.showAssignmentFormForClass === classId) {
      this.showAssignmentFormForClass = null;
    } else {
      this.showAssignmentFormForClass = classId;
      this.createAssignmentForm.reset();
    }
  }

  async onAssignmentFormSubmit(formData: any, classId?: string, studentId?: string) {
    try {
      // Convert the date string to a Date object
      const dueDate = formData.dueAt ? new Date(formData.dueAt) : new Date();
      
      // Determine mode based on what was passed, not the toggle
      const mode = studentId ? 'individual' : 'classroom';
      
      // Get current teacher ID
      const currentUser = await this.authService.getCurrentUser();
      if (!currentUser) {
        throw new Error('You must be logged in to create assignments');
      }

      await this.assignmentService.createAssignment({
        classId,
        studentId,
        mode: mode,
        teacherId: currentUser.uid,
        title: formData.title,
        surah: formData.surah,
        startAyah: formData.startAyah,
        endAyah: formData.endAyah,
        dueAt: dueDate,
        notes: formData.notes,
      });
      
      // Hide form and expand assignments view with animation
      if (classId) {
        this.showAssignmentFormForClass = null;
        this.expandedClassId = classId; // Auto-expand to show new assignment
        console.log('[TeacherDashboard] Refreshing assignments after create for class:', classId);
        this.loadAssignments(classId, true); // Force refresh
      } else if (studentId) {
        this.showAssignmentFormForStudent = null;
        this.expandedStudentId = studentId; // Auto-expand to show new assignment
        console.log('[TeacherDashboard] Refreshing assignments after create for student:', studentId);
        this.loadAssignmentsForStudent(studentId, true); // Force refresh
      }
      
      this.toastService.success(`✓ Assignment "${formData.title}" created successfully!`);
    } catch (error: any) {
      console.error('Error creating assignment:', error);
      this.toastService.error(error.message || 'Failed to create assignment. Please try again.');
    }
  }

  loadAssignments(classId: string, forceRefresh: boolean = false) {
    console.log('[TeacherDashboard] Loading assignments for class:', classId, 'forceRefresh:', forceRefresh);
    
    // Always refresh if forceRefresh is true, or if not loaded yet
    if (forceRefresh || !this.assignmentsForClass[classId]) {
      this.assignmentsForClass[classId] = this.assignmentService.listAssignmentsForClass(classId);
      
      // Subscribe to log assignment data
      this.assignmentsForClass[classId].subscribe({
        next: (assignments) => {
          console.log(`[TeacherDashboard] Loaded ${assignments.length} assignments for class ${classId}:`, assignments);
          
          // Load ungraded counts for each assignment
          assignments.forEach(assignment => {
            this.ungradedCountForAssignment[assignment.id] = 
              this.submissionService.countUngradedSubmissionsForAssignment(assignment.id);
            
            // Subscribe to cache the count for categorization
            this.ungradedCountForAssignment[assignment.id].subscribe(count => {
              this.ungradedCountsCache[assignment.id] = count;
              this.cdr.detectChanges();
            });
          });
          
          // Trigger change detection
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('[TeacherDashboard] Error loading assignments:', error);
          this.toastService.error('Failed to load assignments. Please try again.');
        }
      });
    } else {
      console.log('[TeacherDashboard] Assignments already loaded for class:', classId);
    }
  }

  loadSubmissions(assignmentId: string) {
    if (!this.submissionsForAssignment[assignmentId]) {
      this.submissionsForAssignment[assignmentId] = this.submissionService.listSubmissionsForAssignment(assignmentId);
      
      // Preload student names
      this.submissionsForAssignment[assignmentId].subscribe(async submissions => {
        for (const submission of submissions) {
          if (!this.studentNames[submission.studentId]) {
            const name = await this.getStudentName(submission.studentId);
            this.studentNames[submission.studentId] = name;
            this.cdr.detectChanges();
          }
        }
      });
    }
    
    // Also load ungraded count
    if (!this.ungradedCountForAssignment[assignmentId]) {
      this.ungradedCountForAssignment[assignmentId] = 
        this.submissionService.countUngradedSubmissionsForAssignment(assignmentId);
    }
  }

  selectSubmission(submission: Submission) {
    this.selectedSubmissionForGrading = submission;
  }

  onGraded() {
    const gradedSubmission = this.selectedSubmissionForGrading;
    const gradedAssignmentId = gradedSubmission?.assignmentId;
    this.selectedSubmissionForGrading = null;
    
    // Refresh the submissions list to show updated status
    if (gradedAssignmentId) {
      this.submissionsForAssignment[gradedAssignmentId] = this.submissionService.listSubmissionsForAssignment(gradedAssignmentId);
      
      // Force refresh the assignments list to show the updated graded status on the dashboard
      // Check if this is a classroom or individual assignment
      if (this.mode === 'classroom') {
        // Find which class this assignment belongs to
        this.myClasses$.subscribe(classes => {
          for (const cls of classes) {
            const assignmentObs = this.assignmentsForClass[cls.id];
            if (assignmentObs) {
              // Refresh assignments for this class
              this.assignmentsForClass[cls.id] = this.assignmentService.listAssignmentsForClass(cls.id);
            }
          }
        }).unsubscribe();
      } else if (this.mode === 'individual') {
        // Find which student this assignment belongs to
        this.myStudents$.subscribe(students => {
          for (const student of students) {
            const assignmentObs = this.assignmentsForStudent[student.studentId];
            if (assignmentObs) {
              // Refresh assignments for this student
              this.assignmentsForStudent[student.studentId] = this.assignmentService.listAssignmentsForIndividualStudent(student.studentId);
            }
          }
        }).unsubscribe();
      }
      
      this.cdr.detectChanges();
      this.toastService.success('✓ Dashboard updated with latest grades!');
    }
  }
  
  closeGradePanel() {
    this.selectedSubmissionForGrading = null;
  }
  
  /**
   * Fetch student name from Firestore
   */
  async getStudentName(studentId: string): Promise<string> {
    // Check cache first
    if (this.studentNames[studentId]) {
      return this.studentNames[studentId];
    }
    
    try {
      // Fetch from Firestore users collection
      const userDoc = await this.authService.getUserById(studentId);
      if (userDoc) {
        const name = userDoc.displayName || userDoc.email || studentId;
        this.studentNames[studentId] = name;
        return name;
      }
    } catch (error) {
      console.error('Error fetching student name:', error);
    }
    
    // Fallback to ID
    return studentId;
  }

  // Individual Student Methods
  toggleAddStudentForm() {
    this.showAddStudentForm = !this.showAddStudentForm;
    this.addStudentForm.reset();
  }

  async addStudent() {
    if (this.addStudentForm.invalid) {
      this.toastService.error('Please fill in all required fields.');
      return;
    }

    const formValue = this.addStudentForm.value;
    const studentName = formValue.name || formValue.email;

    try {
      await this.individualStudentService.addStudent(
        formValue.email,
        formValue.name,
        formValue.notes
      );
      
      // Reset form and hide it
      this.addStudentForm.reset();
      this.showAddStudentForm = false;
      
      // Force refresh by creating a new observable
      this.myStudents$ = this.individualStudentService.listMyStudents();
      this.cdr.detectChanges();
      
      // Show success message
      this.toastService.success(`✓ Student "${studentName}" added successfully!`);
    } catch (error: any) {
      console.error('Error adding student:', error);
      this.toastService.error(error.message || 'Failed to add student. Please try again.');
    }
  }

  async removeStudent(studentId: string) {
    if (confirm('Are you sure you want to remove this student?')) {
      try {
        await this.individualStudentService.removeStudent(studentId);
        
        // Clear any expanded state for this student
        if (this.expandedStudentId === studentId) {
          this.expandedStudentId = null;
        }
        
        // Clear assignments cache for this student
        delete this.assignmentsForStudent[studentId];
        
        // Dynamically refresh students list
        this.myStudents$ = this.individualStudentService.listMyStudents();
        this.cdr.detectChanges();
        
        this.toastService.success('✓ Student removed successfully!');
      } catch (error) {
        console.error('Error removing student:', error);
        this.toastService.error('Failed to remove student. Please try again.');
      }
    }
  }

  toggleAssignmentFormForStudent(studentId: string) {
    if (this.showAssignmentFormForStudent === studentId) {
      this.showAssignmentFormForStudent = null;
    } else {
      this.showAssignmentFormForStudent = studentId;
      this.createAssignmentForm.reset();
    }
  }

  loadAssignmentsForStudent(studentId: string, forceRefresh: boolean = false) {
    console.log('[TeacherDashboard] Loading assignments for student:', studentId, 'forceRefresh:', forceRefresh);
    
    // Always refresh if forceRefresh is true, or if not loaded yet
    if (forceRefresh || !this.assignmentsForStudent[studentId]) {
      this.assignmentsForStudent[studentId] = 
        this.assignmentService.listAssignmentsForIndividualStudent(studentId);
      
      // Subscribe and load ungraded counts for each assignment
      this.assignmentsForStudent[studentId].subscribe({
        next: (assignments) => {
          console.log(`[TeacherDashboard] Loaded ${assignments.length} assignments for student ${studentId}`);
          
          assignments.forEach(assignment => {
            this.ungradedCountForAssignment[assignment.id] = 
              this.submissionService.countUngradedSubmissionsForAssignment(assignment.id);
            
            // Subscribe to cache the count for categorization
            this.ungradedCountForAssignment[assignment.id].subscribe(count => {
              this.ungradedCountsCache[assignment.id] = count;
              this.cdr.detectChanges();
            });
            
            // Auto-load submissions to show grading status
            if (!this.submissionsForAssignment[assignment.id]) {
              this.submissionsForAssignment[assignment.id] = 
                this.submissionService.listSubmissionsForAssignment(assignment.id);
            }
          });
          
          // Trigger change detection
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('[TeacherDashboard] Error loading assignments for student:', error);
          this.toastService.error('Failed to load assignments. Please try again.');
        }
      });
    }
  }
  
  // Helper properties to cache ungraded counts
  private ungradedCountsCache: { [assignmentId: string]: number } = {};

  // Helper methods to categorize assignments
  getUngradedAssignments(assignments: Assignment[]): Assignment[] {
    // Only show assignments that we know have ungraded submissions
    return assignments.filter(a => {
      const count = this.ungradedCountsCache[a.id];
      return count && count > 0;
    }).sort((a, b) => {
      // Sort by creation date, newest first
      return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
    });
  }
  
  getActiveAssignments(assignments: Assignment[]): Assignment[] {
    const now = new Date();
    return assignments.filter(a => {
      const hasUngraded = this.ungradedCountsCache[a.id] > 0;
      const dueDate = a.dueAt?.toDate();
      const isUpcoming = !dueDate || dueDate >= now;
      return !hasUngraded && isUpcoming;
    }).sort((a, b) => {
      // Sort by due date, soonest first
      const aTime = a.dueAt?.toMillis() || Infinity;
      const bTime = b.dueAt?.toMillis() || Infinity;
      return aTime - bTime;
    });
  }
  
  getPastAssignments(assignments: Assignment[]): Assignment[] {
    const now = new Date();
    return assignments.filter(a => {
      const hasUngraded = this.ungradedCountsCache[a.id] > 0;
      const dueDate = a.dueAt?.toDate();
      const isPast = dueDate && dueDate < now;
      return !hasUngraded && isPast;
    }).sort((a, b) => {
      // Sort by due date, most recent first
      return (b.dueAt?.toMillis() || 0) - (a.dueAt?.toMillis() || 0);
    });
  }

  // Toggle methods for expanding/collapsing
  toggleClassExpanded(classId: string) {
    if (this.expandedClassId === classId) {
      this.expandedClassId = null;
    } else {
      this.expandedClassId = classId;
      // Always load assignments when expanding, even if previously loaded
      this.loadAssignments(classId, false); // Don't force refresh, but ensure it loads
    }
  }

  toggleStudentExpanded(studentId: string) {
    if (this.expandedStudentId === studentId) {
      this.expandedStudentId = null;
    } else {
      this.expandedStudentId = studentId;
      this.loadAssignmentsForStudent(studentId);
    }
  }

  // Delete single assignment
  async deleteAssignment(assignmentId: string, classId?: string, studentId?: string) {
    if (!confirm('Are you sure you want to delete this assignment? This cannot be undone.')) {
      return;
    }

    try {
      await this.assignmentService.deleteAssignment(assignmentId);
      
      // Force refresh the assignments list
      if (classId) {
        console.log('[TeacherDashboard] Refreshing assignments after delete for class:', classId);
        this.loadAssignments(classId, true); // Force refresh
      } else if (studentId) {
        console.log('[TeacherDashboard] Refreshing assignments after delete for student:', studentId);
        this.loadAssignmentsForStudent(studentId, true); // Force refresh
      }
      
      this.toastService.success('✓ Assignment deleted successfully!');
    } catch (error: any) {
      console.error('Error deleting assignment:', error);
      this.toastService.error(error.message || 'Failed to delete assignment. Please try again.');
    }
  }

  // Delete all assignments for a class
  async deleteAllAssignmentsForClass(classId: string) {
    if (!confirm('Are you sure you want to delete ALL assignments for this class? This cannot be undone.')) {
      return;
    }

    try {
      const count = await this.assignmentService.deleteAllAssignmentsForClass(classId);
      
      // Force refresh the assignments list
      console.log('[TeacherDashboard] Refreshing assignments after delete all for class:', classId);
      this.loadAssignments(classId, true); // Force refresh
      
      this.toastService.success(`✓ ${count} assignment(s) deleted successfully!`);
    } catch (error: any) {
      console.error('Error deleting assignments:', error);
      this.toastService.error(error.message || 'Failed to delete assignments. Please try again.');
    }
  }

  // Delete all assignments for a student
  async deleteAllAssignmentsForStudent(studentId: string) {
    if (!confirm('Are you sure you want to delete ALL assignments for this student? This cannot be undone.')) {
      return;
    }

    try {
      const count = await this.assignmentService.deleteAllAssignmentsForStudent(studentId);
      
      // Force refresh the assignments list
      console.log('[TeacherDashboard] Refreshing assignments after delete all for student:', studentId);
      this.loadAssignmentsForStudent(studentId, true); // Force refresh
      
      this.toastService.success(`✓ ${count} assignment(s) deleted successfully!`);
    } catch (error: any) {
      console.error('Error deleting assignments:', error);
      this.toastService.error(error.message || 'Failed to delete assignments. Please try again.');
    }
  }

  // Edit assignment (opens form with pre-filled data)
  editAssignment(assignment: Assignment) {
    this.editingAssignment = assignment;
    
    // Determine if it's classroom or individual mode
    if (assignment.classId) {
      this.showAssignmentFormForClass = assignment.classId;
    } else if (assignment.studentId) {
      this.showAssignmentFormForStudent = assignment.studentId;
    }
  }

  // Cancel editing
  cancelEdit() {
    this.editingAssignment = null;
    this.showAssignmentFormForClass = null;
    this.showAssignmentFormForStudent = null;
  }

  // Update assignment after editing
  async updateAssignment(formData: any, assignmentId: string, classId?: string, studentId?: string) {
    try {
      const dueDate = formData.dueAt ? new Date(formData.dueAt) : null;
      
      await this.assignmentService.updateAssignment(assignmentId, {
        title: formData.title,
        surah: formData.surah,
        startAyah: formData.startAyah,
        endAyah: formData.endAyah,
        dueAt: dueDate,
        notes: formData.notes,
        mode: classId ? 'classroom' : 'individual',
      });
      
      // Reset editing state
      this.editingAssignment = null;
      this.showAssignmentFormForClass = null;
      this.showAssignmentFormForStudent = null;
      
      // Force refresh the assignments list
      if (classId) {
        console.log('[TeacherDashboard] Refreshing assignments after update for class:', classId);
        this.loadAssignments(classId, true); // Force refresh
      } else if (studentId) {
        console.log('[TeacherDashboard] Refreshing assignments after update for student:', studentId);
        this.loadAssignmentsForStudent(studentId, true); // Force refresh
      }
      
      this.toastService.success('✓ Assignment updated successfully!');
    } catch (error: any) {
      console.error('Error updating assignment:', error);
      this.toastService.error(error.message || 'Failed to update assignment. Please try again.');
    }
  }
}
