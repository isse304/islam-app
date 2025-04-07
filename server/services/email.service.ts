import nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables

export class EmailService {
  private transporter: ReturnType<typeof nodemailer.createTransport>;

  constructor() {
    const smtpUser = process.env['SMTP_USER'];
    const smtpPass = process.env['SMTP_PASS'];
    const smtpHost = process.env['SMTP_HOST'] || 'smtp.gmail.com'; // Default to Gmail
    const smtpPort = parseInt(process.env['SMTP_PORT'] || '587', 10); // Default to 587

    console.log(`[EmailService Constructor] Initializing...`);
    console.log(`[EmailService Constructor] SMTP_HOST: ${smtpHost}, SMTP_PORT: ${smtpPort}`);
    console.log(`[EmailService Constructor] SMTP_USER Set: ${!!smtpUser}`);
    console.log(`[EmailService Constructor] SMTP_PASS Set: ${!!smtpPass}`);

    if (!smtpUser || !smtpPass) {
      console.warn('SMTP credentials are not configured. Email functionality will be disabled.');
      // Create a dummy transporter that doesn't send emails
      this.transporter = nodemailer.createTransport({
        name: 'dummy',
        version: '0.0.0',
        send: (mail: Mail.Options, callback: (err: Error | null, info: any) => void) => {
          console.log('Dummy email send called (emails disabled):', mail);
          callback(null, { response: '250 OK: Email disabled, not sent' });
        }
      });
    } else {
      const transportOptions: SMTPTransport.Options = {
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465, // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        // Optional: Add TLS options if needed, e.g., for self-signed certs
        // tls: {
        //     rejectUnauthorized: false
        // }
      };
      this.transporter = nodemailer.createTransport(transportOptions);
    }
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
    const subject = '🌟 Welcome to NuraAI - Your Journey to Understanding Begins!';
    const text = `
Assalamu alaikum wa rahmatullahi wa barakatuh!

Welcome to NuraAI, your personal companion for deepening your understanding and connection with the Quran and Islamic teachings.

We're thrilled to have you join our community. Here's a glimpse of what you can explore:

*   Read & Listen: Access the complete Quran with multiple translations and reciters.
*   Learn with AI Tafsir: Explore the meanings behind the verses with AI-powered explanations (Premium).
*   Emotional Dua Search: Find relevant duas based on how you're feeling (Premium).
*   Dua Insights: Gain deeper understanding of the virtues and context of specific duas (Premium).
*   Bookmarks & History: Keep track of your favorite verses and reading progress.

Start your journey today and unlock a richer connection to your faith.

Explore NuraAI Now: [YOUR_APP_URL]

If you have any questions, feel free to reply to this email or visit our help section.

May Allah grant you beneficial knowledge and success.

Warm regards,
The NuraAI Team

© ${new Date().getFullYear()} NuraAI. All rights reserved.
    `.trim();

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to NuraAI</title>
    <style>
        body { font-family: sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; background-color: #f9f9f9; }
        .header { text-align: center; margin-bottom: 25px; }
        .logo { font-size: 28px; font-weight: bold; color: #1A365D; font-family: serif; }
        .logo span { color: #B7A57A; }
        .button { display: inline-block; background-color: #B7A57A; color: #ffffff !important; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 15px; }
        a { color: #B7A57A; }
        ul { padding-left: 20px; }
        li { margin-bottom: 10px; }
        .footer { margin-top: 25px; text-align: center; font-size: 12px; color: #777; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">Nura<span>AI</span></div>
            <h2>Assalamu alaikum wa rahmatullahi wa barakatuh!</h2>
        </div>

        <p>Welcome to NuraAI, ${userName || 'friend'}, your personal companion for deepening your understanding and connection with the Quran and Islamic teachings.</p>

        <p>We're thrilled to have you join our community. Here's a glimpse of what you can explore:</p>

        <ul>
            <li>📖 <strong>Read & Listen:</strong> Access the complete Quran with multiple translations and reciters.</li>
            <li>🧠 <strong>Learn with AI Tafsir:</strong> Explore the meanings behind the verses with AI-powered explanations (Premium).</li>
            <li>💖 <strong>Emotional Dua Search:</strong> Find relevant duas based on how you're feeling (Premium).</li>
            <li>💡 <strong>Dua Insights:</strong> Gain deeper understanding of the virtues and context of specific duas (Premium).</li>
            <li>🔖 <strong>Bookmarks & History:</strong> Keep track of your favorite verses and reading progress.</li>
        </ul>

        <p>Start your journey today and unlock a richer connection to your faith.</p>

        <div style="text-align: center;">
            <a href="[YOUR_APP_URL]" class="button" style="color: #ffffff !important;">Explore NuraAI Now</a>
        </div>

        <p>If you have any questions, feel free to reply to this email or visit our help section.</p>

        <p>May Allah grant you beneficial knowledge and success.</p>

        <p>Warm regards,<br>The NuraAI Team</p>

        <div class="footer">
            You received this email because you signed up for NuraAI.
            <br>
            &copy; ${new Date().getFullYear()} NuraAI. All rights reserved.
        </div>
    </div>
</body>
</html>
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
  async sendWelcomeEmail(recipient: string, name: string = 'Friend'): Promise<void> {
    const subject = 'Welcome to NuraAI Premium!';
    const clientUrl = process.env['CLIENT_URL'] || 'http://localhost:4200';

    // Improved HTML template without icons/emojis
    const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; }
        .header { background-color: #1A365D; color: #FAF3E0; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
        .content { padding: 30px 25px; color: #333333; line-height: 1.6; font-size: 16px; }
        .content h2 { color: #1A365D; margin-top: 0; font-size: 20px; }
        .content p { margin-bottom: 15px; }
        .features-list { list-style: none; /* Changed to remove default bullets */ padding: 0; margin: 20px 0; }
        .features-list li { margin-bottom: 12px; /* Removed padding-left and position */ display: block; /* Ensure full width */}
        /* Removed icon-placeholder style */
        .button-container { text-align: center; margin-top: 30px; }
        .button { display: inline-block; background-color: #B7A57A; color: #ffffff !important; padding: 12px 25px; border-radius: 5px; text-decoration: none; font-weight: bold; font-size: 16px; transition: background-color 0.3s ease; }
        .button:hover { background-color: #a8966c; }
        .footer { background-color: #f8f8f8; color: #777777; padding: 20px; text-align: center; font-size: 12px; }
        .footer a { color: #B7A57A; text-decoration: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to NuraAI Premium!</h1>
        </div>
        <div class="content">
            <h2>Assalamu alaikum ${name},</h2>
            <p>Alhamdulillah! Your premium subscription is active. You now have unlocked access to powerful AI-driven features designed to deepen your connection with the Quran and Sunnah.</p>

            <h3>Here's a glimpse of the insights you can explore:</h3>
            <ul class="features-list">
                <li>AI Tafsir Chat: Ask questions and get detailed explanations about Quranic verses.</li>
                <li>Emotional Dua Search: Find relevant duas and guidance based on your feelings.</li>
                <li>Dua Insights: Understand the deeper meanings and benefits of specific duas.</li>
                <li>Advanced Learning Tools: Enhance your study with context-aware insights.</li>
            </ul>

            <p style="margin-top: 30px;">We pray these tools benefit your spiritual journey.</p>

            <div class="button-container">
                <a href="${clientUrl}/home" class="button">Start Exploring Premium Features</a>
            </div>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} NuraAI. All rights reserved.</p>
            <p>If you did not subscribe, please contact support.</p>
            <p><a href="${clientUrl}/profile">Manage your subscription</a></p>
        </div>
    </div>
</body>
</html>
    `;
    const textBody = `Assalamu alaikum ${name},\n\nAlhamdulillah! Your premium subscription is active. You now have unlocked access to powerful AI-driven features designed to deepen your connection with the Quran and Sunnah.\n\nExplore now:\n- AI Tafsir Chat\n- Emotional Dua Search\n- Dua Insights\n- Advanced Learning Tools\n\nStart Exploring: ${clientUrl}/home\n\nWe pray these tools benefit your spiritual journey.\n\nThe NuraAI Team`;

    try {
      await this.transporter.sendMail({
        from: process.env['SMTP_FROM'],
        to: recipient,
        subject: subject,
        text: textBody,
        html: htmlBody
      });
      console.log(`Premium welcome email sent successfully to ${recipient}`);
    } catch (error) {
      console.error(`Failed to send premium welcome email to ${recipient}:`, error);
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

  // Updated public method to accept recipient email and optional HTML body
  public async sendEmail(
    subject: string,
    text: string,
    recipient: string | undefined, // Make recipient optional or required based on needs
    htmlBody?: string // Add optional htmlBody parameter
  ): Promise<void> {
    if (!recipient) {
      console.error('No recipient specified for email alert.');
      return;
    }
    const fromAddress = process.env['SMTP_FROM'] || process.env['SMTP_USER'];
    if (!fromAddress) {
        console.error('Cannot send email: SMTP_FROM or SMTP_USER not set.');
        return; 
    }
    
    try {
      await this.transporter.sendMail({
        from: fromAddress, // Use determined fromAddress
        to: recipient,
        subject,
        text,
        // Use htmlBody if provided, otherwise generate simple HTML from text
        html: htmlBody || text.replace(/\n/g, '<br>') 
      });
      console.log(`Email sent successfully to ${recipient} with subject: ${subject}`);
    } catch (error) {
      console.error(`Failed to send email to ${recipient}:`, error);
      // Don't throw the error to prevent cascading failures in alerts
      // --- Throw error for contact form specifically ---
      if (subject.startsWith('Contact Form Submission')) {
        throw error; // Re-throw specifically for contact form forwarding
      }
      // --- End specific throw ---
    }
  }

  /* --- Welcome Email Logic Removed - Handled by Mailchimp Automation --- */

  /*
  async sendSignupWelcomeEmail(recipient: string, name: string = 'Friend'): Promise<void> {
    // ... implementation removed ...
  }
  */

  /*
  async sendNewUserWelcomeEmail(userEmail: string, userName: string): Promise<void> {
     // ... implementation removed ...
  }
  */
  /* --- End Removed Welcome Email Logic --- */

} 