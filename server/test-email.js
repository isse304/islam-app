const nodemailer = require('nodemailer');
require('dotenv').config({ path: '.env.production' });

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function testEmail() {
  try {
    // First verify the connection
    await transporter.verify();
    console.log('SMTP connection successful!');

    // Send a test email
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: process.env.ALERT_EMAIL,
      subject: 'Nura SMTP Test',
      text: 'If you receive this email, SMTP is configured correctly!',
      html: '<p>If you receive this email, SMTP is configured correctly!</p>'
    });

    console.log('Test email sent successfully!');
    console.log('Message ID:', info.messageId);
  } catch (error) {
    console.error('Error:', error);
  }
}

testEmail(); 