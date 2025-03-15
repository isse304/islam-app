import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'newline'
})
export class NewlinePipe implements PipeTransform {
  transform(value: string): string {
    if (!value) return '';
    // Replace newlines with <br> tags for HTML display
    return value.replace(/\n/g, '<br>');
  }
} 