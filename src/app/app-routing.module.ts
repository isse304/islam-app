import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { PremiumGuard } from './guards/premium.guard';
import { HomeComponent } from './components/home/home.component';
import { LoginComponent } from './auth/login/login.component';
import { SignupComponent } from './auth/signup/signup.component';
import { ForgotPasswordComponent } from './auth/forgot-password/forgot-password.component';

const routes: Routes = [
  {
    path: '',
    component: HomeComponent
  },
  {
    path: 'learn-quran',
    loadComponent: () => import('./components/learn/learn.component').then(m => m.LearnComponent),
    canActivate: [AuthGuard, PremiumGuard],
    data: { feature: 'Learn Feature' }
  },
  {
    path: 'dua',
    loadComponent: () => import('./components/dua/dua.component').then(m => m.DuaComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'premium',
    loadComponent: () => import('./components/subscription/subscription.component').then(m => m.SubscriptionComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth.module').then(m => m.AuthModule)
  },
  {
    path: 'profile',
    loadComponent: () => import('./auth/profile/profile.component').then(m => m.ProfileComponent),
    canActivate: [AuthGuard]
  },
  { path: '**', redirectTo: '' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { } 