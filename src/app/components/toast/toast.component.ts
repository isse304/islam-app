import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, NgClass } from '@angular/common';
import { ToastService, Toast } from '../../services/toast.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-toast',
  template: `
    <div class="fixed bottom-0 right-0 p-4 z-50 pointer-events-none">
      <div *ngFor="let toast of toasts"
           class="mb-2 p-4 rounded-lg shadow-lg transform transition-all duration-300 ease-in-out pointer-events-auto"
           [ngClass]="{
             'bg-green-500': toast.type === 'success',
             'bg-red-500': toast.type === 'error',
             'bg-blue-500': toast.type === 'info'
           }">
        <div class="flex items-center text-white">
          <i class="fas mr-2"
             [ngClass]="{
               'fa-check-circle': toast.type === 'success',
               'fa-exclamation-circle': toast.type === 'error',
               'fa-info-circle': toast.type === 'info'
             }"></i>
          <span>{{ toast.message }}</span>
          <button (click)="removeToast(toast)" 
                  class="ml-4 text-white hover:text-gray-200 focus:outline-none">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
    </div>
  `,
  standalone: true,
  imports: [CommonModule, NgClass]
})
export class ToastComponent implements OnInit, OnDestroy {
  toasts: Toast[] = [];
  private subscription: Subscription;

  constructor(private toastService: ToastService) {
    this.subscription = this.toastService.toast$.subscribe(toast => {
      this.toasts.push(toast);
      if (toast.duration) {
        setTimeout(() => this.removeToast(toast), toast.duration);
      }
    });
  }

  ngOnInit() {}

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  removeToast(toast: Toast) {
    const index = this.toasts.indexOf(toast);
    if (index > -1) {
      this.toasts.splice(index, 1);
    }
  }
} 