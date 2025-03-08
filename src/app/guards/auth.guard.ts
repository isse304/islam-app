import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {
    return this.authService.getAuthState().pipe(
      map(isAuthenticated => {
        if (!isAuthenticated) {
          // Save current route and redirect to login
          this.authService.saveCurrentRoute(state.url, route.params);
          this.authService.login();
          return false;
        }
        return true;
      })
    );
  }
} 