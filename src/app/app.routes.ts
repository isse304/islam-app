import { Routes } from '@angular/router';
// Import the functional guards
import { authGuardFn } from './guards/auth.guard';
import { premiumGuard } from './guards/premium.guard';
import { NoAuthGuard } from './guards/no-auth.guard';
import { premiumRedirectGuard } from './guards/premium-redirect.guard';
import { assignmentGuard } from './guards/assignment.guard';
import { softAuthGuard } from './guards/soft-auth.guard';
import { optionalAuthGuard } from './guards/optional-auth.guard';


export const routes: Routes = [
  // ============================================
  // PUBLIC ROUTES (No Authentication Required)
  // ============================================
  
  {
    path: '', // Root redirects to home
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'landing', // Keep landing page accessible at /landing if needed
    loadComponent: () => import('./components/landing/landing.component').then(m => m.LandingComponent),
    // No guard - fully public marketing page
  },

  // Public information pages
  {
    path: 'about',
    loadComponent: () => import('./components/about/about.component').then(m => m.AboutComponent)
    // No guard - fully public
  },
  {
    path: 'contact',
    loadComponent: () => import('./components/contact/contact.component').then(m => m.ContactComponent)
    // No guard - fully public
  },

  // ============================================
  // QURAN READER - PUBLIC ACCESS
  // ============================================
  
  {
    path: 'quran',
    loadComponent: () => import('./components/quran/quran-reader/quran-reader.component').then(m => m.QuranReaderComponent),
    canActivate: [softAuthGuard] // Public - no auth required, but component can show sign-in prompts
  },

  // ============================================
  // DUA - PUBLIC BROWSING (Premium features locked in component)
  // ============================================
  
  {
    path: 'dua',
    loadComponent: () => import('./components/dua/dua.component').then(m => m.DuaComponent),
    canActivate: [softAuthGuard] // Public browsing, premium features gated in component
  },

  // ============================================
  // HOME - BETTER WITH LOGIN (Optional Auth)
  // ============================================
  
  {
    path: 'home',
    loadComponent: () => import('./components/home/home.component').then(m => m.HomeComponent),
    canActivate: [optionalAuthGuard] // Optional auth - works better when logged in
  },

  // ============================================
  // AUTH ROUTES (Login, Signup)
  // ============================================
  
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth.module').then(m => m.AuthModule),
    // No guard - accessible to all (NoAuthGuard applied in auth module itself)
  },

  // ============================================
  // PREMIUM FEATURES (Login + Subscription Required)
  // ============================================
  
  // AI Tafsir Teaser for anonymous users
  {
    path: 'ai-tafsir',
    loadComponent: () => import('./components/ai-tafsir-teaser/ai-tafsir-teaser.component').then(m => m.AiTafsirTeaserComponent),
    // Public - shows what users will get with premium
  },

  // AI Tafsir Chat - Premium feature (shows teaser for non-premium users)
  {
    path: 'learn',
    loadComponent: () => import('./components/learn/learn.component').then(m => m.LearnComponent),
    canActivate: [premiumGuard], // Updated guard checks auth first, then premium
    data: { feature: 'AI Tafsir Chat', showTeaser: true } // Show teaser instead of subscription page
  },

  // ============================================
  // AUTHENTICATED USER ROUTES
  // ============================================
  
  {
    path: 'profile',
    loadComponent: () => import('./auth/profile/profile.component').then(m => m.ProfileComponent),
    canActivate: [authGuardFn] // Requires login
  },

  {
    path: 'subscription',
    loadComponent: () => import('./components/subscription/subscription.component').then(m => m.SubscriptionComponent),
    canActivate: [authGuardFn, premiumRedirectGuard] // Requires login
  },

  // ============================================
  // ASSIGNMENT READER (Protected)
  // ============================================
  
  {
    path: 'reader',
    loadComponent: () => import('./components/quran/quran-reader/quran-reader.component').then(m => m.QuranReaderComponent),
    canActivate: [authGuardFn, assignmentGuard], // Requires login + valid assignment
  },

  // ============================================
  // CLASSROOM ROUTES (Role-based)
  // ============================================
  
  {
    path: '',
    loadChildren: () => import('./features/classroom/classroom.routes').then(m => m.CLASSROOM_ROUTES),
    // roleGuardFn handles auth + role checks in child routes
  },

  // ============================================
  // REPORTS ROUTES (Teacher only)
  // ============================================
  
  {
    path: '',
    loadChildren: () => import('./features/reports/reports.routes').then(m => m.REPORTS_ROUTES),
    // roleGuardFn handles auth + role checks in child routes
  },

  // ============================================
  // PARENT ROUTES
  // ============================================
  
  {
    path: '',
    loadChildren: () => import('./features/parent/parent.routes').then(m => m.PARENT_ROUTES),
    // roleGuardFn handles auth + role checks in child routes
  },

  // ============================================
  // CATCH-ALL
  // ============================================
  
  { 
    path: '**', 
    redirectTo: '' 
  },
]; 