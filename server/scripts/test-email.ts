import { EmailService } from '../services/email.service';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ==============================================================================
// EMAIL SERVICE TEST SCRIPT
// ==============================================================================
//
// Purpose:
// This script helps verify that the EmailService is configured correctly
// and can send emails using the credentials provided in your .env file.
//
// Setup:
// 1. Ensure you have a .env file in the root directory of your project (the
//    directory containing the 'server' folder).
// 2. Add the following variables to your .env file, replacing the placeholder
//    values with your actual SMTP credentials and a test recipient email:
//
//    SMTP_USER=your_smtp_username (e.g., your Gmail address)
//    SMTP_PASS=your_smtp_password (e.g., your Gmail App Password)
//    SMTP_FROM="Your App Name" <your_sender_email@example.com> (e.g., "NuraAI" <noreply@nuraai.com>)
//    TEST_RECIPIENT_EMAIL=recipient@example.com (the email address to send the test to)
//
//    *** Important Security Note for Gmail: ***
//    If using Gmail, you'll likely need to generate an "App Password" instead of
//    using your regular Gmail password. Search for "Google App Passwords" for instructions.
//
// Usage:
// 1. Compile the script: From your project's root directory, run:
//    npx tsc server/scripts/test-email.ts --outDir dist/server/scripts --module commonjs --esModuleInterop --skipLibCheck true --target es2017
//    (Adjust target/module as needed for your Node.js version)
// 2. Run the compiled script:
//    node dist/server/scripts/test-email.js
//
// Expected Outcome:
// - The script will attempt to send a test email to the TEST_RECIPIENT_EMAIL.
// - Check the console output for success or error messages.
// - Check the recipient's inbox (and spam folder) for the test email.
//
// ==============================================================================

// Load environment variables from .env file located in the parent directory
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

// --- Configuration --- 
const testRecipient = process.env['TEST_RECIPIENT_EMAIL'];
const testSubject = 'NuraAI Email Service Test';
const testTextBody = 'This is a test email from the NuraAI EmailService test script. If you received this, the service is working!';

// Wrap logic in an async function
async function main() {
    console.log('Dynamically importing EmailService...');
    // Use dynamic import with .js extension hint (for TS check)
    const { EmailService } = await import('../services/email.service.js');
    console.log('EmailService imported.');

    await runEmailTest(EmailService);
}

// Modify runEmailTest to accept EmailService class
// Update the type import path as well (back to .js for TS)
async function runEmailTest(EmailServiceClass: typeof import('../services/email.service.js').EmailService) {
    console.log('Starting EmailService test (Welcome Email)...');

    // Validate environment variables
    if (!process.env['SMTP_USER'] || !process.env['SMTP_PASS'] || !process.env['SMTP_FROM']) {
        console.error('ERROR: Missing required SMTP environment variables (SMTP_USER, SMTP_PASS, SMTP_FROM) in .env file.');
        return;
    }
    if (!testRecipient) {
        console.error('ERROR: Missing TEST_RECIPIENT_EMAIL environment variable in .env file.');
        return;
    }

    console.log(`Attempting to send test email to: ${testRecipient}`);

    try {
        // Initialize the EmailService
        const emailService = new EmailServiceClass();

        // Call the public sendEmail method
        await emailService.sendEmail(testSubject, testTextBody, testRecipient);

        console.log('✅ Test email sent successfully (check recipient inbox/spam).');
        console.log('If the email is not received, double-check SMTP credentials and sender/recipient addresses.');

    } catch (error) {
        console.error('❌ Error occurred during email test:', error);
        console.error('Troubleshooting Tips:');
        console.error('- Verify SMTP_USER, SMTP_PASS, SMTP_FROM in your .env file are correct.');
        console.error('- If using Gmail, ensure you are using an App Password.');
        console.error('- Check if your email provider requires specific security settings.');
        console.error('- Ensure TEST_RECIPIENT_EMAIL is a valid, deliverable email address.');
    }
}

// --- Execute the Test --- 
main(); 