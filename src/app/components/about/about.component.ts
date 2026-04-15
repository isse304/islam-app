import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.scss']
})
export class AboutComponent {
  linkedinUrl = 'https://www.linkedin.com/in/issekun/';

  audiences = [
    'Anyone seeking a richer, deeper connection with the Quran.',
    'Muslims looking for personalized dua recommendations based on their emotions.',
    'Students of Islamic knowledge desiring interactive and accessible learning tools.',
    'Busy individuals needing quick, authentic, and reliable Islamic insights on the go.'
  ];
}
