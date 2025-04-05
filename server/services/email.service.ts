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
  async sendWelcomeEmail(userEmail: string, userName: string): Promise<void> {
    const subject = '🎉 JazakAllah Khair! Your NuraAI Premium Subscription is Active!';
    const text = `
Assalamu alaikum wa rahmatullahi wa barakatuh!

JazakAllah Khair for upgrading to NuraAI Premium, ${userName || 'friend'}! Your support helps us continue developing features to aid in understanding the Quran and Sunnah.

Your Premium access is now active. You can immediately start using these powerful AI-driven features:

*   AI Tafsir Chat: Dive deep into Quranic verses. Ask questions and get detailed explanations.
*   Emotional Dua Search: Find relevant duas based on how you're feeling.
*   Dua Insights: Go beyond translation. Understand the virtues, benefits, and context of specific duas.

Explore these enhanced features now and enrich your spiritual journey.

Start Exploring Premium: [YOUR_APP_URL]

You can manage your subscription anytime from your profile page within the app.

If you have any questions, please don't hesitate to contact us.

May your journey with NuraAI be blessed,
The NuraAI Team

© ${new Date().getFullYear()} NuraAI. All rights reserved.
    `.trim();

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NuraAI Premium Activated</title>
     <style>
        body { font-family: sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; background-color: #f9f9f9; }
        .header { text-align: center; margin-bottom: 25px; background-color: #1A365D; padding: 15px; border-radius: 8px 8px 0 0; }
        .logo { font-size: 28px; font-weight: bold; color: #FAF3E0; font-family: serif; }
        .logo span { color: #B7A57A; }
        .button { display: inline-block; background-color: #B7A57A; color: #ffffff !important; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 15px; }
        a { color: #B7A57A; }
        ul { padding-left: 20px; background-color: #ffffff; padding: 15px; border-radius: 5px; border: 1px solid #e0e0e0;}
        li { margin-bottom: 10px; display: flex; align-items: center; }
        li strong { color: #1A365D; margin-left: 8px;}
        .icon { color: #B7A57A; font-size: 1.2em; margin-right: 8px; } /* Basic icon styling */
        .footer { margin-top: 25px; text-align: center; font-size: 12px; color: #777; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">Nura<span>AI</span></div>
        </div>

        <h2 style="color: #1A365D; text-align: center;">Assalamu alaikum wa rahmatullahi wa barakatuh!</h2>

        <p><strong>JazakAllah Khair for upgrading to NuraAI Premium, ${userName || 'friend'}!</strong> Your support helps us continue developing features to aid in understanding the Quran and Sunnah.</p>

        <p>Your Premium access is now active. You can immediately start using these powerful AI-driven features:</p>

        <ul>
             <li><span class="icon">🧠</span> <strong>AI Tafsir Chat:</strong> Dive deep into Quranic verses. Ask questions and get detailed explanations based on authentic tafsir, linguistic insights, and historical context.</li>
             <li><span class="icon">💖</span> <strong>Emotional Dua Search:</strong> Feeling anxious, grateful, or seeking guidance? Describe your feelings, and NuraAI will suggest relevant duas, prophetic examples, and spiritual remedies.</li>
             <li><span class="icon">💡</span> <strong>Dua Insights:</strong> Go beyond translation. Understand the virtues, benefits, historical context, and practical application of specific duas.</li>
             <!-- Add any other specific premium features -->
        </ul>

        <p>Explore these enhanced features now and enrich your spiritual journey.</p>

        <div style="text-align: center;">
            <a href="[YOUR_APP_URL]" class="button" style="color: #ffffff !important;">Start Exploring Premium</a>
        </div>

         <p>You can manage your subscription anytime from your profile page within the app.</p>

        <p>If you have any questions, please don't hesitate to contact us.</p>

        <p>May your journey with NuraAI be blessed,<br>The NuraAI Team</p>

         <div class="footer">
            You received this email because you subscribed to NuraAI Premium.
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
      console.log(`Premium welcome email sent successfully to ${userEmail}`);
    } catch (error) {
      console.error(`Failed to send premium welcome email to ${userEmail}:`, error);
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