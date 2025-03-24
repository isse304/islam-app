import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { FirebaseAuthService } from './services/firebase-auth.service';
import { AuthStateService } from './services/auth-state.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    HeaderComponent
  ]
})
export class AppComponent {
  title = 'IslamApp';

  constructor(
    private authService: FirebaseAuthService,
    private authStateService: AuthStateService
  ) {}
}
