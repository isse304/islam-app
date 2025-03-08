const nodemailer = require('nodemailer');
require('dotenv').config({ path: '.env.production' });

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function testEmail() {
  try {
    await transporter.verify();
    console.log('SMTP connection successful!');
    
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: process.env.ALERT_EMAIL,
      subject: 'Nura SMTP Test',
      text: 'If you receive this email, SMTP is configured correctly!'
    });
    
    console.log('Test email sent successfully!');
    console.log('Message ID:', info.messageId);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testEmail(); 