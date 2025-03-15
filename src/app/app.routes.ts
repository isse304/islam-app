import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { QuranReaderComponent } from './components/quran/quran-reader/quran-reader.component';
import { DuaComponent } from './components/dua/dua.component';
import { LearnComponent } from './components/learn/learn.component';
import { ProfileComponent } from './auth/profile/profile.component';
import { UsageComponent } from './components/usage/usage.component';
import { SubscriptionComponent } from './components/subscription/subscription.component';
import { ContactComponent } from './components/contact/contact.component';
import { authRoutes } from './auth/auth.module';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'quran', component: QuranReaderComponent },
  { path: 'learn', component: LearnComponent },
  { path: 'dua', component: DuaComponent },
  { 
    path: 'auth',
    children: authRoutes
  },
  { path: 'profile', component: ProfileComponent },
  { path: 'usage', component: UsageComponent },
  { path: 'subscription', component: SubscriptionComponent },
  { path: 'contact', component: ContactComponent },
  { path: '**', redirectTo: '' } // Redirect any unknown paths to home
]; 