import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

declare var webkitSpeechRecognition: any;

@Injectable({
  providedIn: 'root'
})
export class SttService {
  private recognition: any;
  private isListening = new BehaviorSubject<boolean>(false);
  private transcript = new BehaviorSubject<string>('');
  private error = new BehaviorSubject<string>('');

  constructor() {
    this.initRecognition();
  }

  private initRecognition() {
    try {
      this.recognition = new webkitSpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US'; // Default to English

      this.recognition.onstart = () => {
        this.isListening.next(true);
      };

      this.recognition.onend = () => {
        this.isListening.next(false);
      };

      this.recognition.onresult = (event: any) => {
        const last = event.results.length - 1;
        const text = event.results[last][0].transcript;
        this.transcript.next(text);
      };

      this.recognition.onerror = (event: any) => {
        this.error.next(event.error);
        this.isListening.next(false);
      };
    } catch (e) {
      console.error('Speech recognition not supported:', e);
      this.error.next('Speech recognition not supported in this browser');
    }
  }

  startListening(language: string = 'en-US'): void {
    if (this.recognition) {
      this.recognition.lang = language;
      this.recognition.start();
    }
  }

  stopListening(): void {
    if (this.recognition) {
      this.recognition.stop();
    }
  }

  isListening$(): Observable<boolean> {
    return this.isListening.asObservable();
  }

  transcript$(): Observable<string> {
    return this.transcript.asObservable();
  }

  error$(): Observable<string> {
    return this.error.asObservable();
  }

  setLanguage(language: string): void {
    if (this.recognition) {
      this.recognition.lang = language;
    }
  }
} 