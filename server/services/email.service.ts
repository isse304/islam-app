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

  // Method to send contact form submissions to the admin/support email
  async sendContactSubmission(senderName: string, senderEmail: string, message: string): Promise<void> {
    const subject = `Contact Form Submission from ${senderName}`;
    const textBody = `Name: ${senderName}\nEmail: ${senderEmail}\n\nMessage:\n${message}`;
    const recipient = process.env['CONTACT_EMAIL'] || process.env['ALERT_EMAIL']; // Target admin/support email

    if (!recipient) {
      console.error("No recipient email configured for contact form (CONTACT_EMAIL or ALERT_EMAIL env var).");
      throw new Error("Server configuration error: No contact email recipient set.");
    }

    try {
      // Use the existing private sendEmail method internally
      await this.sendEmail(subject, textBody, recipient);
      // Log success only if sendEmail doesn't throw
      console.log(`Contact form forwarded successfully to ${recipient}`);
    } catch (error) {
      // Log the error that occurred during sending
      console.error(`Error occurred while trying to forward contact form to ${recipient}:`, error);
      // Re-throw the error so the route handler knows it failed
      throw error;
    }
  }

  // Welcome email for NEWLY REGISTERED users
  async sendNewUserWelcomeEmail(userEmail: string, userName: string): Promise<void> {
    const subject = 'Welcome to Nura AI!';
    const text = `
Hello ${userName || 'there'},

Thank you for joining Nura AI! We're excited to have you.

Explore the Quran, discover relevant duas, and deepen your understanding with our tools.

Feel free to explore the features available in the free plan. If you'd like access to AI-powered insights, consider upgrading to Premium.

Happy learning!

Best regards,
The Nura AI Team
    `.trim();

    const html = `
<p>Hello ${userName || 'there'},</p>
<p>Thank you for joining <strong>Nura AI</strong>! We're excited to have you.</p>
<p>Explore the Quran, discover relevant duas, and deepen your understanding with our tools.</p>
<p>Feel free to explore the features available in the free plan. If you'd like access to AI-powered insights, consider upgrading to Premium.</p>
<p>Happy learning!</p>
<p>Best regards,<br/>The Nura AI Team</p>
    `.trim();

    try {
      await this.transporter.sendMail({
        from: process.env['SMTP_FROM'],
        to: userEmail,
        subject: subject,
        text: text,
        html: html
      });
      console.log(`New user welcome email sent successfully to ${userEmail}`);
    } catch (error) {
      console.error(`Failed to send new user welcome email to ${userEmail}:`, error);
    }
  }

  // Welcome email for PREMIUM subscription
  async sendWelcomeEmail(userEmail: string, userName: string): Promise<void> {
    const subject = 'Welcome to Nura AI Premium!';
    const text = `
Hello ${userName || 'there'},

Welcome to Nura AI Premium! We're thrilled to have you onboard.

You now have access to all our premium features, including:
- AI Tafsir Chat
- Emotional Dua Search
- Dua Insights & Analysis

We hope Nura AI helps you deepen your connection with the Quran.

Best regards,
The Nura AI Team
    `.trim();

    const html = `
<p>Hello ${userName || 'there'},</p>
<p>Welcome to <strong>Nura AI Premium</strong>! We're thrilled to have you onboard.</p>
<p>You now have access to all our premium features, including:</p>
<ul>
  <li>AI Tafsir Chat</li>
  <li>Emotional Dua Search</li>
  <li>Dua Insights & Analysis</li>
</ul>
<p>We hope Nura AI helps you deepen your connection with the Quran.</p>
<p>Best regards,<br/>The Nura AI Team</p>
    `.trim();

    try {
      await this.transporter.sendMail({
        from: process.env['SMTP_FROM'], // Use the configured sender email
        to: userEmail,                   // Send to the user's email
        subject: subject,
        text: text,
        html: html
      });
      console.log(`Premium welcome email sent successfully to ${userEmail}`); // Log distinction
    } catch (error) {
      console.error(`Failed to send premium welcome email to ${userEmail}:`, error);
      // Don't throw, log the error but continue
    }
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

    // Use the private sendEmail method, directing alerts to the admin
    await this.sendEmail(subject, text, process.env['ALERT_EMAIL']);
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

    // Use the private sendEmail method, directing alerts to the admin
    await this.sendEmail(subject, text, process.env['ALERT_EMAIL']);
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

    // Use the private sendEmail method, directing alerts to the admin
    await this.sendEmail(subject, text, process.env['ALERT_EMAIL']);
  }

  // Updated public method to accept recipient email
  public async sendEmail(
    subject: string,
    text: string,
    recipient: string | undefined // Make recipient optional or required based on needs
  ): Promise<void> {
    if (!recipient) {
      console.error('No recipient specified for email alert.');
      return;
    }
    try {
      await this.transporter.sendMail({
        from: process.env['SMTP_FROM'],
        to: recipient,
        subject,
        text,
        html: text.replace(/\n/g, '<br>') // Simple HTML conversion
      });
      console.log(`Email sent successfully to ${recipient} with subject: ${subject}`);
    } catch (error) {
      console.error(`Failed to send email to ${recipient}:`, error);
      // Don't throw the error to prevent cascading failures
    }
  }
} 