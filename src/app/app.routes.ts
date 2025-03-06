import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { QuranReaderComponent } from './components/quran/quran-reader/quran-reader.component';
import { DuaComponent } from './components/dua/dua.component';
import { LoginComponent } from './components/auth/login/login.component';
import { LearnComponent } from './components/learn/learn.component';
import { ProfileComponent } from './profile/profile.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'quran', component: QuranReaderComponent },
  { path: 'learn', component: LearnComponent },
  { path: 'dua', component: DuaComponent },
  { path: 'auth/login', component: LoginComponent },
  { path: 'profile', component: ProfileComponent },
  { path: '**', redirectTo: '' } // Redirect any unknown paths to home
]; 