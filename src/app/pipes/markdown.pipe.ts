import { Pipe, PipeTransform } from '@angular/core';
import { marked } from 'marked';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'markdown',
  standalone: true
})
export class MarkdownPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {
    // Configure marked options
    marked.setOptions({
      gfm: true,
      breaks: true
    });
  }

  transform(value: string): SafeHtml {
    if (!value) return '';
    
    // Convert markdown to HTML and ensure we get a string
    const html = marked.parse(value);
    
    // Sanitize the HTML
    return this.sanitizer.bypassSecurityTrustHtml(html.toString());
  }
} 