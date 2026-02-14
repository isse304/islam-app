import { Route } from '@angular/router';
import { TeacherDashboardComponent } from './teacher-dashboard.component';
import { StudentAssignmentsComponent } from './student-assignments.component';
import { GradeBookComponent } from './gradebook/gradebook.component';
import { DashboardHomeComponent } from '../student-dashboard/dashboard-home.component';
import { ProgressAnalyticsComponent } from '../student-dashboard/progress-analytics.component';
import { CalendarComponent } from '../student-dashboard/calendar.component';
import { AssignmentArchiveComponent } from '../student-dashboard/assignment-archive.component';
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
    path: 's/dashboard',
    component: DashboardHomeComponent,
    canActivate: [roleGuardFn],
    data: { role: 'student' },
  },
  {
    path: 's/assignments',
    component: StudentAssignmentsComponent,
    canActivate: [roleGuardFn],
    data: { role: 'student' },
  },
  {
    path: 's/progress',
    component: ProgressAnalyticsComponent,
    canActivate: [roleGuardFn],
    data: { role: 'student' },
  },
  {
    path: 's/calendar',
    component: CalendarComponent,
    canActivate: [roleGuardFn],
    data: { role: 'student' },
  },
  {
    path: 's/archive',
    component: AssignmentArchiveComponent,
    canActivate: [roleGuardFn],
    data: { role: 'student' },
  },
  {
    path: 's',
    redirectTo: 's/dashboard',
    pathMatch: 'full',
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
