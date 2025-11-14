import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { provideRouter } from '@angular/router';
import { routes } from './app/app.routes';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getStorage, provideStorage } from '@angular/fire/storage';
import { environment } from './environments/environment';
import { importProvidersFrom, isDevMode, APP_INITIALIZER } from '@angular/core';
import { DatePipe } from '@angular/common';
import { enableProdMode } from '@angular/core';
import 'hammerjs'; // Import HammerJS
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
// import { provideServiceWorker } from '@angular/service-worker'; // Import provideServiceWorker
import { withComponentInputBinding } from '@angular/router'; // Import if using input binding
import { withInterceptors } from '@angular/common/http'; // Import if using interceptors
// import { authInterceptorFn } from './app/interceptors/auth.interceptor'; // Assuming this exists if needed

// Import the provider functions
import { FirebaseAuthService } from './app/services/firebase-auth.service';
import { PreferencesService } from './app/services/preferences.service';
import { SubscriptionService } from './app/services/subscription.service';
import { ToastService } from './app/services/toast.service';

// APP_INITIALIZER factory function
export function initializeAppFactory(
  authService: FirebaseAuthService,
  prefsService: PreferencesService,
  subService: SubscriptionService,
  toastService: ToastService
): () => Promise<any> {
  return async () => {
    // //console.log('[APP_INITIALIZER] Starting initialization...');
    let initUser: any = null;
    try {
      // Start auth initialization immediately
      const authReadyPromise = authService.waitForAuthReady();
      // //console.log('[APP_INITIALIZER] Waiting for Firebase Auth ready...');
      await authReadyPromise;
      // //console.log('[APP_INITIALIZER] Firebase Auth is ready.');

      // Get the initialized user (or null)
      initUser = authService.getCurrentUser();
      // //console.log('[APP_INITIALIZER] Initial user state from authService:', initUser?.id);

      if (initUser) {
        // //console.log('[APP_INITIALIZER] User found. Preferences and subscription should load via their respective services.');
        // Preferences and subscription status are loaded internally by their services
        // await Promise.all([
        //   prefsService.loadPreferences(initUser.id), // REMOVED: Incorrect method call
        //   subService.loadSubscriptionStatus(initUser.id) // REMOVED: Incorrect method call
        // ]);
      } else {
        // //console.log('[APP_INITIALIZER] No user found, skipping dependent loads.');
      }

      // Toast service initialization (if needed)
      // toastService.init();
      // //console.log('[APP_INITIALIZER] Toast service initialized (if applicable).');

      // //console.log('[APP_INITIALIZER] Initialization sequence complete.');
      return Promise.resolve(); // Resolve the promise indicating completion
    } catch (error) {
      // //console.error('[APP_INITIALIZER] Error during app initialization:', error);
      // You might want to display an error message to the user here
      // Return a resolved promise even on error to allow the app to potentially continue
      return Promise.resolve();
    }
  };
}

// if (environment.production) {
//   enableProdMode();
// }

bootstrapApplication(AppComponent, {
  ...appConfig, // Spread existing app config
  providers: [
    ...(appConfig.providers || []), // Include existing providers
    provideRouter(routes),
    provideHttpClient(),
    provideAnimations(),
    importProvidersFrom(
      provideFirebaseApp(() => initializeApp(environment.firebase)),
      provideAuth(() => getAuth()),
      provideFirestore(() => {
        const app = initializeApp(environment.firebase);
        return getFirestore(app, 'nura');
      }),
      provideStorage(() => getStorage())
    ),
    provideCharts(withDefaultRegisterables()),
    // Provide your services
    FirebaseAuthService,
    PreferencesService,
    SubscriptionService,
    ToastService,
    DatePipe, // Provide DatePipe if needed globally
    // Provide APP_INITIALIZER to ensure auth is ready before app loads fully
    { provide: APP_INITIALIZER, useFactory: initializeAppFactory, deps: [FirebaseAuthService, PreferencesService, SubscriptionService, ToastService], multi: true },
    // If you need interceptors, uncomment and add here:
    // provideHttpClient(withInterceptors([authInterceptorFn])),
    // If you need component input binding, add it to provideRouter:
    // provideRouter(routes, withComponentInputBinding()),
  ]
})
.catch((err) => console.error(err));

// Remove the entire commented-out bootstrapApplication block below
// Commenting out the standalone bootstrap with SW provider
// bootstrapApplication(AppComponent, {
//   providers: [
//     provideRouter(routes, withComponentInputBinding()),
//     provideAnimations(),
//     provideHttpClient(withInterceptors([authInterceptorFn])),
//     provideServiceWorker('ngsw-worker.js', {
//       enabled: !isDevMode(),
//       registrationStrategy: 'registerWhenStable:30000'
//     })
//   ]
// })
//   .catch(err => //console.error(err));
