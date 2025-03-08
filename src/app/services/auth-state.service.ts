import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthStateService {
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  private isPremiumUserSubject = new BehaviorSubject<boolean>(false);

  isAuthenticated$ = this.isAuthenticatedSubject.asObservable();
  isPremiumUser$ = this.isPremiumUserSubject.asObservable();

  constructor(private authService: AuthService) {
    this.checkAuthStatus();
    this.checkPremiumStatus();
    
    // Update auth state periodically
    setInterval(() => this.updateAuthState(), 60000); // Check every minute
  }

  setAuthenticated(value: boolean) {
    this.isAuthenticatedSubject.next(value);
    localStorage.setItem('isAuthenticated', value.toString());
  }

  setPremiumStatus(value: boolean) {
    this.isPremiumUserSubject.next(value);
    localStorage.setItem('isPremiumUser', value.toString());
  }

  async isPremiumUser(): Promise<boolean> {
    return localStorage.getItem('isPremiumUser') === 'true';
  }

  private checkAuthStatus() {
    const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
    this.setAuthenticated(isAuthenticated);
  }

  private checkPremiumStatus() {
    const isPremium = localStorage.getItem('isPremiumUser') === 'true';
    this.setPremiumStatus(isPremium);
  }

  private async updateAuthState() {
    try {
      const token = await this.authService.getToken();
      this.isAuthenticatedSubject.next(!!token);
    } catch (error) {
      this.isAuthenticatedSubject.next(false);
    }
  }

  // Helper method to check if authenticated
  isAuthenticated(): Observable<boolean> {
    return this.isAuthenticated$;
  }
} 