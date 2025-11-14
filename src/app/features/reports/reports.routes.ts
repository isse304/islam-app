import { Route } from '@angular/router';
import { roleGuardFn } from '../../guards/role.guard';

export const REPORTS_ROUTES: Route[] = [
  {
    path: 't/reports',
    canActivate: [roleGuardFn],
    data: { role: 'teacher' },
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./teacher-reports-home.component').then(
            (m) => m.TeacherReportsHomeComponent
          ),
      },
      {
        path: ':classId',
        loadComponent: () =>
          import('./class-report-page.component').then(
            (m) => m.ClassReportPageComponent
          ),
      },
      {
        path: 's/:studentId',
        loadComponent: () =>
          import('./student-report-page.component').then(
            (m) => m.StudentReportPageComponent
          ),
      },
    ],
  },
];
