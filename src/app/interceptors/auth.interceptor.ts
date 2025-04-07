import { Injectable, inject } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpInterceptorFn, HttpHandlerFn } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { FirebaseAuthService } from '../services/firebase-auth.service';

// Functional Interceptor Definition
export const authInterceptorFn: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  // Inject the service directly inside the function
  const authService = inject(FirebaseAuthService);

  return from(authService.getToken()).pipe(
    switchMap(token => {
      if (token) {
        // Clone the request and add the authorization header
        req = req.clone({
          setHeaders: {
            Authorization: `Bearer ${token}`
          }
        });
      }
      // Pass the cloned request with the header to the next handler
      return next(req);
    })
  );
};

// Keep the class-based interceptor commented out or remove it if no longer needed elsewhere
/*
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private authService: FirebaseAuthService) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return from(this.authService.getToken()).pipe(
      switchMap(token => {
        if (token) {
          request = request.clone({
            setHeaders: {
              Authorization: `Bearer ${token}`
            }
          });
        }
        return next.handle(request);
      })
    );
  }
}
*/ 