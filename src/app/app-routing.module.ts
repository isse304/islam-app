import { NgModule, Injectable, inject } from '@angular/core';
import { RouterModule, Routes, CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, ResolveFn } from '@angular/router';
import { Observable, map, take, of, from, switchMap } from 'rxjs';

import { authGuardFn } from './guards/auth.guard';
import { premiumGuard } from './guards/premium.guard';
import { HomeComponent } from './components/home/home.component';
import { LandingComponent } from './components/landing/landing.component';
import { FirebaseAuthService, AppUser } from './services/firebase-auth.service';
import { LoginComponent } from './auth/login/login.component';
import { SignupComponent } from './auth/signup/signup.component';
import { ForgotPasswordComponent } from './auth/forgot-password/forgot-password.component';
import { SubscriptionService } from './services/subscription.service';

import { MainLayoutComponent } from './layouts/main-layout/main-layout.component';
import { AuthLayoutComponent } from './layouts/auth-layout/auth-layout.component';

@Injectable({
  providedIn: 'root'
})
export class NoAuthGuard implements CanActivate {
  constructor(private authService: FirebaseAuthService, private router: Router) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean | UrlTree> {
    return from(this.authService.waitForAuthReady()).pipe(
      switchMap(() => this.authService.user$.pipe(take(1))),
      map(user => {
        if (user) {
          // console.log('NoAuthGuard: User is authenticated, redirecting to /home');
          return this.router.createUrlTree(['/home']);
        } else {
          // console.log('NoAuthGuard: User is not authenticated, allowing access.');
          return true;
        }
      })
    );
  }
}

const routes: Routes = [
  {
    path: 'auth',
    component: AuthLayoutComponent,
    canActivate: [NoAuthGuard],
    children: [
      {
        path: '',
        redirectTo: 'login',
        pathMatch: 'full'
      },
      {
        path: '',
        loadChildren: () => import('./auth/auth.module').then(m => m.AuthModule)
      }
    ]
  },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuardFn],
    children: [
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full'
      },
      {
        path: 'home',
        component: HomeComponent
      },
      {
        path: 'learn',
        redirectTo: '/tafsir/browse',
        pathMatch: 'full'
      },
      {
        path: 'quran',
        loadComponent: () => import('./components/quran/quran-reader/quran-reader.component').then(m => m.QuranReaderComponent)
      },
      {
        path: 'dua',
        loadComponent: () => import('./components/dua/dua.component').then(m => m.DuaComponent),
        canActivate: [premiumGuard],
        data: { feature: 'Emotional Dua Search' }
      },
      {
        path: 'subscription',
        loadComponent: () => import('./components/subscription/subscription.component').then(m => m.SubscriptionComponent)
      },
      {
        path: 'profile',
        loadComponent: () => import('./auth/profile/profile.component').then(m => m.ProfileComponent)
      },
      // Student Dashboard Routes
      {
        path: 'student',
        children: [
          {
            path: '',
            redirectTo: 'assignments',
            pathMatch: 'full'
          },
          {
            path: 'assignments',
            loadComponent: () => import('./student-dashboard/assignment-hub/assignment-hub.component').then(m => m.AssignmentHubComponent),
            data: { title: 'My Assignments' }
          },
          {
            path: 'assignments/:id',
            loadComponent: () => import('./student-dashboard/assignment-hub/assignment-hub.component').then(m => m.AssignmentHubComponent),
            data: { title: 'Assignment Details' }
          },
          {
            path: 'progress',
            loadComponent: () => import('./student-dashboard/assignment-hub/assignment-hub.component').then(m => m.AssignmentHubComponent),
            data: { title: 'Progress & Analytics' }
          },
          {
            path: 'calendar',
            loadComponent: () => import('./student-dashboard/assignment-hub/assignment-hub.component').then(m => m.AssignmentHubComponent),
            data: { title: 'Calendar' }
          }
        ]
      }
    ]
  },
  { path: 'premium', redirectTo: '/subscription', pathMatch: 'full' },
  { path: 'learn-quran', redirectTo: '/tafsir/browse', pathMatch: 'full' },
  { path: '**', redirectTo: 'home' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { } 