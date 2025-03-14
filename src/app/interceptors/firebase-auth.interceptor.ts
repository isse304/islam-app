import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { FirebaseAuthService } from '../services/firebase-auth.service';

@Injectable()
export class FirebaseAuthInterceptor implements HttpInterceptor {
  constructor(private authService: FirebaseAuthService) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Skip authentication for specific endpoints that don't require it
    if (request.url.includes('/api/health') || request.url.includes('/assets/')) {
      return next.handle(request);
    }

    // Add authentication for all other requests
    return from(this.authService.getToken()).pipe(
      switchMap(token => {
        if (token) {
          console.log('Adding authentication token to request:', request.url);
          request = request.clone({
            setHeaders: {
              Authorization: `Bearer ${token}`
            }
          });
        } else {
          console.log('No authentication token available for request:', request.url);
        }
        return next.handle(request);
      })
    );
  }
} 