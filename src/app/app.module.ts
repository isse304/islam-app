import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

// Import Firebase modules
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { environment } from '../environments/environment';

// Initialize Firebase
const app = initializeApp(environment.firebase);
const auth = getAuth(app);
const firestore = getFirestore(app);

import { AppComponent } from './app.component';
import { HeaderComponent } from './components/header/header.component';
import { HomeComponent } from './components/home/home.component';
import { QuranReaderComponent } from './components/quran/quran-reader/quran-reader.component';
import { DuaComponent } from './components/dua/dua.component';
import { LoginComponent } from './components/auth/login/login.component';
import { LearnComponent } from './components/learn/learn.component';
import { AuthButtonsComponent } from './auth-buttons/auth-buttons.component';
import { DuaTafsirComponent } from './components/dua/dua-tafsir.component';
import { DuaInsightsComponent } from './components/dua-insights/dua-insights.component';
import { ContactComponent } from './components/contact/contact.component';
import { routes } from './app.routes';
import { ErrorDialogComponent } from './components/shared/error-dialog/error-dialog.component';
import { UsageComponent } from './components/usage/usage.component';
import { FirebaseAuthInterceptor } from './interceptors/firebase-auth.interceptor';

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    HomeComponent,
    DuaComponent,
    LoginComponent,
    AuthButtonsComponent,
    DuaTafsirComponent,
    QuranReaderComponent,
    DuaInsightsComponent,
    ErrorDialogComponent,
    ContactComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    RouterModule.forRoot(routes),
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    CommonModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule,
    MatButtonModule
  ],
  providers: [
    // Provide Auth for the application
    { provide: 'FIREBASE_AUTH', useValue: auth },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: FirebaseAuthInterceptor,
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
