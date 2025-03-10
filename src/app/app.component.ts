import { Component, OnInit } from '@angular/core';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'IslamApp';

  ngOnInit() {
    // Log environment configuration
    console.log('Environment:', {
      production: environment.production,
      apiUrl: environment.apiUrl,
      clerkFrontendApi: environment.clerkFrontendApi
    });

    // Check if Clerk is loaded
    if (window['Clerk']) {
      console.log('Clerk is available');
    } else {
      console.error('Clerk is not loaded');
    }
  }
}
