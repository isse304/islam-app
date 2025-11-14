import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private toastSubject = new Subject<Toast>();
  public toasts$ = this.toastSubject.asObservable();
  private toastId = 0;

  show(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration = 3000) {
    const toast: Toast = {
      id: this.toastId++,
      message,
      type,
      duration,
    };
    this.toastSubject.next(toast);
  }

  success(message: string, duration = 3000) {
    this.show(message, 'success', duration);
  }

  error(message: string, duration = 5000) {
    this.show(message, 'error', duration);
  }

  info(message: string, duration = 3000) {
    this.show(message, 'info', duration);
  }

  warning(message: string, duration = 4000) {
    this.show(message, 'warning', duration);
  }

  // Aliases for compatibility with existing code
  showError(message: string, duration = 5000) {
    this.error(message, duration);
  }

  showInfo(message: string, duration = 3000) {
    this.info(message, duration);
  }

  showSuccess(message: string, duration = 3000) {
    this.success(message, duration);
  }

  showWarning(message: string, duration = 4000) {
    this.warning(message, duration);
  }
}
