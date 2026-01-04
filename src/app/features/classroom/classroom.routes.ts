import { Route } from '@angular/router';
import { TeacherDashboardComponent } from './teacher-dashboard.component';
import { StudentAssignmentsComponent } from './student-assignments.component';
import { GradeBookComponent } from './gradebook/gradebook.component';
import { roleGuardFn } from '../../guards/role.guard';

export const CLASSROOM_ROUTES: Route[] = [
  // Teacher routes
  {
    path: 't/classes',
    component: TeacherDashboardComponent,
    canActivate: [roleGuardFn],
    data: { role: 'teacher' },
  },
  {
    path: 't/gradebook',
    component: GradeBookComponent,
    canActivate: [roleGuardFn],
    data: { role: 'teacher' },
  },
  {
    path: 'classes',
    redirectTo: 't/classes',
    pathMatch: 'full',
  },
  {
    path: 'teacher-dashboard',
    redirectTo: 't/classes',
    pathMatch: 'full',
  },
  {
    path: 'gradebook',
    redirectTo: 't/gradebook',
    pathMatch: 'full',
  },
  
  // Student routes
  {
    path: 's/assignments',
    component: StudentAssignmentsComponent,
    canActivate: [roleGuardFn],
    data: { role: 'student' },
  },
  {
    path: 'assignments',
    redirectTo: 's/assignments',
    pathMatch: 'full',
  },
  {
    path: 'student-assignments',
    redirectTo: 's/assignments',
    pathMatch: 'full',
  },
];
