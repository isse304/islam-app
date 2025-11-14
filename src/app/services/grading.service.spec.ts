import { TestBed } from '@angular/core/testing';
import { GradingService } from './grading.service';
import {
  Firestore,
  getFirestore,
  provideFirestore,
} from '@angular/fire/firestore';
import { Auth, getAuth, provideAuth } from '@angular/fire/auth';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { environment } from 'src/environments/environment';

describe('GradingService', () => {
  let service: GradingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        provideFirebaseApp(() => initializeApp(environment.firebase)),
        provideFirestore(() => getFirestore()),
        provideAuth(() => getAuth()),
      ],
      providers: [GradingService],
    });
    service = TestBed.inject(GradingService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
