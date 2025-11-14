import { Route } from '@angular/router';
import { roleGuardFn } from '../../guards/role.guard';

export const PARENT_ROUTES: Route[] = [
  {
    path: 'p/home',
    canActivate: [roleGuardFn],
    data: { role: 'parent' },
    loadComponent: () =>
      import('./parent-home.component').then((m) => m.ParentHomeComponent),
  },
  {
    path: 'p/student/:id',
    canActivate: [roleGuardFn],
    data: { role: 'parent' },
    loadComponent: () =>
      import('./parent-student-detail.component').then(
        (m) => m.ParentStudentDetailComponent
      ),
  },
];
