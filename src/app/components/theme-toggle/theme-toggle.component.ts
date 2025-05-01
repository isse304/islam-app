import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ThemeService, ThemePreference } from '../../services/theme.service'; // Adjust path if needed

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule
  ],
  templateUrl: './theme-toggle.component.html',
  styleUrls: ['./theme-toggle.component.scss']
})
export class ThemeToggleComponent implements OnInit {
  currentPreference: ThemePreference = 'system';
  currentTheme: 'light' | 'dark' = 'light'; // To show the correct icon based on actual applied theme

  constructor(private themeService: ThemeService) {}

  ngOnInit(): void {
    this.currentPreference = this.themeService.getCurrentPreference();
    this.themeService.currentTheme$.subscribe(theme => {
      this.currentTheme = theme;
    });
  }

  setPreference(preference: ThemePreference): void {
    this.themeService.setThemePreference(preference);
    this.currentPreference = preference;
  }

  // Cycle through themes: system -> light -> dark -> system
  cycleTheme(): void {
    if (this.currentPreference === 'system') {
      this.setPreference('light');
    } else if (this.currentPreference === 'light') {
      this.setPreference('dark');
    } else {
      this.setPreference('system');
    }
  }

  getTooltip(): string {
    switch (this.currentPreference) {
      case 'light': return 'Switch to Dark Mode';
      case 'dark': return 'Switch to System Preference';
      case 'system': return 'Switch to Light Mode';
    }
  }

  getIcon(): string {
     switch (this.currentPreference) {
       case 'light': return 'light_mode';
       case 'dark': return 'dark_mode';
       case 'system':
         // Show the icon matching the *currently applied* system theme
         return this.currentTheme === 'dark' ? 'brightness_auto' : 'brightness_auto'; // Or could use night_sight_auto / wb_sunny
     }
  }
}
