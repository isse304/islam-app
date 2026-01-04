import { Pipe, PipeTransform, SecurityContext } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'safeHtml',
  standalone: true // Make the pipe standalone
})
export class SafeHtmlPipe implements PipeTransform {

  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string | null | undefined): SafeHtml {
    if (!value) return '';
    
    // Bypass security completely for Tajweed HTML (contains <rule> tags from Quran.com API)
    // These are safe as they come from a trusted source and only contain styling classes
    return this.sanitizer.bypassSecurityTrustHtml(value);
  }
} 