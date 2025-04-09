import { Routes } from '@angular/router';
// Import the functional guard
import { authGuardFn } from './guards/auth.guard';
import { premiumGuard } from './guards/premium.guard';
import { NoAuthGuard } from './guards/no-auth.guard';


export const routes: Routes = [
  // Make the root path load the LandingComponent directly
  // { path: '', redirectTo: '/home', pathMatch: 'full' }, // Comment out old redirect
  { path: '', loadComponent: () => import('./components/landing/landing.component').then(m => m.LandingComponent) }, // Load LandingComponent at root

  // Remove the old landing page route
  // { path: 'landing', loadComponent: () => import('./components/landing/landing.component').then(m => m.LandingComponent), canActivate: [NoAuthGuard] },

  // Comment out Auth routes
  /*
  {
    path: 'auth',
    // Use the AuthModule to load children routes
    loadChildren: () => import('./auth/auth.module').then(m => m.AuthModule),
    // Reinstate the NoAuthGuard
    canActivate: [NoAuthGuard]
  },
  */

  // Comment out Main application routes
  /*
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
  */
  // Keep the subscription route active for success/thank you page
  {
    path: 'subscription',
    loadComponent: () => import('./components/subscription/subscription.component').then(m => m.SubscriptionComponent),
    // Allow access regardless of auth state for upgrades/management
  },
  // Comment out other routes
  /*
  {
    path: 'contact',
    loadComponent: () => import('./components/contact/contact.component').then(m => m.ContactComponent),
    // Allow access regardless of auth state
  },
  {
    path: 'about',
    loadComponent: () => import('./components/about/about.component').then(m => m.AboutComponent)
  },
  */
  /*
  {
    path: 'thank-you',
    loadComponent: () => import('./components/thank-you/thank-you.component').then(m => m.ThankYouComponent),
    // Allow access regardless of auth state
  },
  */

  // Catch-all route: Redirect unknown routes to the landing page
  { path: '**', redirectTo: '' },
  // { path: '**', redirectTo: '/home' }, // Comment out old wildcard redirect
]; 