import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';
import { importProvidersFrom } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatTabsModule } from '@angular/material/tabs';
import { provideFirebaseApp } from '@angular/fire/app';
import { provideAuth } from '@angular/fire/auth';
import { provideFirestore } from '@angular/fire/firestore';
import { firebaseAuthInterceptor } from './app/interceptors/firebase-auth.interceptor';
import { routes } from './app/app.routes';

// Initialize Firebase
const app = initializeApp(environment.firebase);
const auth = getAuth(app);
const firestore = getFirestore(app);

// Function to get Angular Firebase instances
function getAngularAuth() {
  return auth;
}

function getAngularFirestore() {
  return firestore;
}

bootstrapApplication(AppComponent, {
  providers: [
    ...appConfig.providers,
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(withInterceptors([firebaseAuthInterceptor])),
    importProvidersFrom(
      provideFirebaseApp(() => initializeApp(environment.firebase)),
      provideAuth(() => getAngularAuth()),
      provideFirestore(() => getAngularFirestore()),
      MatDialogModule,
      MatButtonModule,
      MatSnackBarModule,
      MatProgressSpinnerModule,
      MatIconModule,
      MatFormFieldModule,
      MatInputModule,
      MatSelectModule,
      MatCardModule,
      MatDividerModule,
      MatCheckboxModule,
      MatTooltipModule,
      MatMenuModule,
      MatProgressBarModule,
      MatChipsModule,
      MatTabsModule,
      FormsModule,
      ReactiveFormsModule
    )
  ]
}).catch((err) => console.error(err));
