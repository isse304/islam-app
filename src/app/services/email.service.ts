import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface EmailData {
  to: string;
  from: string;
  subject: string;
  text: string;
}

@Injectable({
  providedIn: 'root'
})
export class EmailService {
  private apiUrl = `${environment.apiUrl}/api/email`;

  constructor(private http: HttpClient) {}

  async sendEmail(emailData: EmailData): Promise<any> {
    try {
      return await this.http.post(this.apiUrl, emailData).toPromise();
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }
} 