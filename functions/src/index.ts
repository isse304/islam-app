import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";

// Initialize Firebase Admin SDK (only once)
if (!admin.apps.length) {
  admin.initializeApp();
}

// --- Nodemailer Configuration ---
// Retrieve SMTP config securely set via 'firebase functions:config:set smtp...'
const smtpConfig = functions.config().smtp;

// Validate SMTP config existence
if (!smtpConfig || !smtpConfig.user || !smtpConfig.pass || !smtpConfig.from) {
  console.error(
    "CRITICAL ERROR: SMTP configuration is missing in Firebase Functions config.",
    "Run 'firebase functions:config:set smtp.user=...' etc. and redeploy.",
  );
  // Optionally, throw an error to prevent function deployment without config
  // throw new Error("Missing SMTP configuration in Firebase Functions environment.");
}

// Create reusable Nodemailer transporter if config exists
let transporter: nodemailer.Transporter | null = null;
if (smtpConfig && smtpConfig.user) {
  transporter = nodemailer.createTransport({
    // Common service providers (adjust if using a different one)
    host: smtpConfig.host || "smtp.gmail.com", // Default to Gmail SMTP host
    port: smtpConfig.port || 465, // Default to SSL port
    secure: smtpConfig.secure !== undefined ? smtpConfig.secure : true, // Use SSL by default
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass,
    },
  });
}

// --- Firebase Cloud Function: Send Welcome Email ---

export const sendWelcomeEmail = functions.auth.user().onCreate(async (user) => {
  // Check if transporter was created successfully
  if (!transporter) {
    console.error(
      "sendWelcomeEmail: Nodemailer transporter is not initialized due to missing config. Cannot send email.",
    );
    return null; // Exit function if email cannot be sent
  }

  const email = user.email; // The email of the user.
  const displayName = user.displayName || email?.split("@")[0] || "New User"; // Get display name or derive from email

  // Check if email is available
  if (!email) {
    console.warn(
      `sendWelcomeEmail: Cannot send welcome email to user ${user.uid} because email address is missing.`,
    );
    return null;
  }

  // --- Email Content ---
  const mailOptions: nodemailer.SendMailOptions = {
    from: smtpConfig.from, // Use configured "From" address
    to: email,
    subject: "🌟 Welcome to NuraAI!",
    text: `Assalamu alaikum ${displayName},\\n\\nWelcome to NuraAI! We're excited to have you join our community.\\n\\nExplore the app and start your journey of deeper understanding:\\n[Link to your App - e.g., https://yourapp.com]\\n\\nIf you have any questions, feel free to reach out.\\n\\nWarm regards,\\nThe NuraAI Team`,
    html: \`
      <div style="font-family: sans-serif; line-height: 1.6;">
        <h2 style="color: #1A365D;">Assalamu alaikum ${displayName},</h2>
        <p>Welcome to <strong>NuraAI</strong>! We're excited to have you join our community.</p>
        <p>Explore the app and start your journey of deeper understanding:</p>
        <p style="text-align: center; margin: 20px 0;">
          <a href="[Link to your App]" style="background-color: #B7A57A; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Explore NuraAI</a>
        </p>
        <p>If you have any questions, feel free to contact our support team.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 0.9em; color: #777;">Warm regards,<br>The NuraAI Team</p>
      </div>
    \`,
  };

  // Replace '[Link to your App]' in the html anchor href with your actual app URL.

  // --- Send Email ---
  try {
    console.log(\`sendWelcomeEmail: Attempting to send welcome email to ${email}...\`);
    await transporter.sendMail(mailOptions);
    console.log(\`✅ Welcome email sent successfully to ${email}\`);
    return null;
  } catch (error) {
    console.error(
      \`❌ Failed to send welcome email to ${email}:\`,
      error,
    );
    // Optional: Add more error handling, like retries or logging to a different service
    return null;
  }
});
