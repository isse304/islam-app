import { Routes } from '@angular/router';
// Import the functional guard
import { authGuardFn } from './guards/auth.guard';
import { premiumGuard } from './guards/premium.guard';
import { NoAuthGuard } from './guards/no-auth.guard';
import { premiumRedirectGuard } from './guards/premium-redirect.guard';
import { assignmentGuard } from './guards/assignment.guard';


export const routes: Routes = [
  {
    path: 'landing', // Explicit path for landing page
    redirectTo: '',    // REDIRECT /landing to root
    pathMatch: 'full' // Important for redirects
  },
  {
    path: '', // Root path IS the landing page
    loadComponent: () => import('./components/landing/landing.component').then(m => m.LandingComponent),
    canActivate: [NoAuthGuard], // Keep NoAuthGuard here
    pathMatch: 'full'
  },

  // Auth routes - accessible only when not logged in
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth.module').then(m => m.AuthModule),
  },

  // Classroom routes
  {
    path: '',
    loadChildren: () => import('./features/classroom/classroom.routes').then(m => m.CLASSROOM_ROUTES),
  },

  // Reports routes
  {
    path: '',
    loadChildren: () => import('./features/reports/reports.routes').then(m => m.REPORTS_ROUTES),
  },

  // Parent routes
  {
    path: '',
    loadChildren: () => import('./features/parent/parent.routes').then(m => m.PARENT_ROUTES),
  },

  // Main application routes - accessible only when logged in
  {
    path: 'home',
    loadComponent: () => import('./components/home/home.component').then(m => m.HomeComponent),
    canActivate: [authGuardFn],
  },
  {
    path: 'quran',
    loadComponent: () => import('./components/quran/quran-reader/quran-reader.component').then(m => m.QuranReaderComponent),
    canActivate: [authGuardFn],
  },
  {
    path: 'reader',
    loadComponent: () => import('./components/quran/quran-reader/quran-reader.component').then(m => m.QuranReaderComponent),
    canActivate: [authGuardFn, assignmentGuard],
  },
  {
    path: 'learn',
    loadComponent: () => import('./components/learn/learn.component').then(m => m.LearnComponent),
    canActivate: [authGuardFn, premiumGuard],
    data: { feature: 'Learn Quran' }
  },
  {
    path: 'dua',
    loadComponent: () => import('./components/dua/dua.component').then(m => m.DuaComponent),
    canActivate: [authGuardFn],
  },
  {
    path: 'profile',
    loadComponent: () => import('./auth/profile/profile.component').then(m => m.ProfileComponent),
    canActivate: [authGuardFn],
  },
  {
    path: 'subscription',
    loadComponent: () => import('./components/subscription/subscription.component').then(m => m.SubscriptionComponent),
    canActivate: [authGuardFn, premiumRedirectGuard] // Protected & Redirect premium users
  },
  {
    path: 'contact',
    loadComponent: () => import('./components/contact/contact.component').then(m => m.ContactComponent),
    // Public
  },
  {
    path: 'about',
    loadComponent: () => import('./components/about/about.component').then(m => m.AboutComponent)
    // Public
  },

  // Catch-all route redirects to root (landing/home via guards)
  { 
    path: '**', 
    redirectTo: '' 
  },
]; 