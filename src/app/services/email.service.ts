import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { firstValueFrom } from 'rxjs';

// Interface for contact form data
export interface ContactFormData {
  name: string;
  email: string;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class EmailService {
  // Changed apiUrl to point to the new contact endpoint
  private contactApiUrl = `${environment.apiUrl}/api/contact`;

  constructor(private http: HttpClient) {}

  // Renamed method to be more specific and accept ContactFormData
  async sendContactForm(formData: ContactFormData): Promise<any> {
    try {
      // Use firstValueFrom for modern HttpClient usage
      return await firstValueFrom(this.http.post(this.contactApiUrl, formData));
    } catch (error) {
      console.error('Error sending contact form:', error);
      throw error; // Re-throw the error to be handled by the component
    }
  }
} 