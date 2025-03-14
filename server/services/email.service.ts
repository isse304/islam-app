import nodemailer from 'nodemailer';

export class EmailService {
  private transporter: ReturnType<typeof nodemailer.createTransport>;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env['SMTP_USER'],
        pass: process.env['SMTP_PASS']
      }
    });
  }

  async sendCostAlert(
    type: 'hourly' | 'daily',
    currentCost: number,
    threshold: number
  ): Promise<void> {
    const subject = `[Nura] ${type.charAt(0).toUpperCase() + type.slice(1)} Cost Alert`;
    const text = `
${type.charAt(0).toUpperCase() + type.slice(1)} cost has exceeded $${threshold}.
Current cost: $${currentCost.toFixed(2)}

This is an automated alert from your Nura AI application.
    `.trim();

    await this.sendEmail(subject, text);
  }

  async sendUsageAlert(
    userId: string,
    currentUsage: number,
    limit: number
  ): Promise<void> {
    const subject = '[Nura] Daily Usage Limit Alert';
    const text = `
User ${userId} has exceeded their daily usage limit.
Current usage: ${currentUsage} requests
Daily limit: ${limit} requests

This is an automated alert from your Nura AI application.
    `.trim();

    await this.sendEmail(subject, text);
  }

  async sendErrorAlert(
    error: Error,
    context: string
  ): Promise<void> {
    const subject = '[Nura] System Error Alert';
    const text = `
An error occurred in ${context}:
Error: ${error.message}
Stack: ${error.stack}

This is an automated alert from your Nura AI application.
    `.trim();

    await this.sendEmail(subject, text);
  }

  private async sendEmail(
    subject: string,
    text: string
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: process.env['SMTP_FROM'],
        to: process.env['ALERT_EMAIL'],
        subject,
        text,
        html: text.replace(/\n/g, '<br>')
      });
    } catch (error) {
      console.error('Failed to send email alert:', error);
      // Don't throw the error to prevent cascading failures
    }
  }
} 