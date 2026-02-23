import { Routes } from '@angular/router';
import { authGuardFn } from '../../guards/auth.guard';

export const VIDEO_CALL_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./video-call.component').then(m => m.VideoCallComponent),
    canActivate: [authGuardFn]
  }
];
