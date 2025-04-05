import { Routes } from '@angular/router';
// Import the functional guard
import { authGuardFn } from './guards/auth.guard';

export const routes: Routes = [
  // Redirect empty path to a protected route (e.g., home)
  // AuthGuard will handle redirecting to login if needed
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  // { path: '', loadComponent: () => import('./components/landing/landing.component').then(m => m.LandingComponent) }, // Comment out landing page route

  // Remove the old landing page route
  // { path: 'landing', loadComponent: () => import('./components/landing/landing.component').then(m => m.LandingComponent), canActivate: [NoAuthGuard] },

  // Auth routes (login, signup, etc.) - accessible only when not logged in
  { 
    path: 'auth', 
    // Use the AuthModule to load children routes
    loadChildren: () => import('./auth/auth.module').then(m => m.AuthModule)
    // Remove the NoAuthGuard for now
    // canActivate: [NoAuthGuard] 
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
    path: 'learn',
    loadComponent: () => import('./components/learn/learn.component').then(m => m.LearnComponent),
    canActivate: [authGuardFn],
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
    // Allow access regardless of auth state for upgrades/management
  },
  {
    path: 'contact',
    loadComponent: () => import('./components/contact/contact.component').then(m => m.ContactComponent),
    // Allow access regardless of auth state
  },
  /*
  {
    path: 'thank-you',
    loadComponent: () => import('./components/thank-you/thank-you.component').then(m => m.ThankYouComponent),
    // Allow access regardless of auth state
  },
  */

  // Catch-all route (optional: redirect to home or login based on auth)
  // Redirect unknown routes to home; AuthGuard will handle unauthorized access
  { path: '**', redirectTo: '/home' },
  // { path: '**', redirectTo: '' } // Comment out landing redirect
]; 