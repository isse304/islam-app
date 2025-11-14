import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { Observable, Subject } from 'rxjs';
import { ErrorDialogComponent } from '../components/shared/error-dialog/error-dialog.component';

export interface SnackbarConfig {
  message: string;
  action?: string;
  duration?: number;
  type?: 'success' | 'error' | 'warning' | 'info';
}

@Injectable({
  providedIn: 'root'
})
export class SnackbarService {
  private errorSubject = new Subject<string>();
  errors$ = this.errorSubject.asObservable();

  constructor(
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  success(message: string, duration: number = 3000) {
    this.showSnackbar({
      message,
      type: 'success',
      duration
    });
  }

  error(message: string, duration: number = 5000) {
    this.showSnackbar({
      message,
      type: 'error',
      duration
    });
    this.errorSubject.next(message);
  }

  warning(message: string, duration: number = 4000) {
    this.showSnackbar({
      message,
      type: 'warning',
      duration
    });
  }

  info(message: string, duration: number = 3000) {
    this.showSnackbar({
      message,
      type: 'info',
      duration
    });
  }

  private showSnackbar(config: SnackbarConfig) {
    const cssClass = config.type ? [`notification-${config.type}`] : [];
    
    this.snackBar.open(
      config.message,
      config.action || 'Close',
      {
        duration: config.duration || 3000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
        panelClass: cssClass
      }
    );
  }

  // For critical errors that need user acknowledgment
  showErrorDialog(title: string, message: string): Observable<void> {
    const dialogRef = this.dialog.open(ErrorDialogComponent, {
      width: '400px',
      data: { title, message }
    });
    return dialogRef.afterClosed();
  }
}
