import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1"; // Import v1 SDK
// Use v1 auth trigger for onCreate
import * as logger from "firebase-functions/logger";
// Import axios default and named export for type guard
import axios, { isAxiosError } from "axios";

// Define environment variables using functions.config()
// You'll set these using the Firebase CLI later
const backendUrl = functions.config().backend?.url;
// e.g., "https://your-render-app.onrender.com"

// The secret you set in Render
const functionSecret = functions.config().backend?.secret;

/**
 * Triggered when a new Firebase Authentication user is created.
 * Sends a request to the backend API to dispatch a welcome email.
 */
export const onUserCreate = functionsV1.auth // Use v1 auth trigger
  .user()
  .onCreate(async (user: functionsV1.auth.UserRecord) => { // Use v1 UserRecord
    logger.info(`New user created: ${user.uid}, Email: ${user.email}`);

    if (!user.email) {
      logger.warn(
        `User ${user.uid} created without an email. Cannot send welcome email.`
      );
      return; // Cannot send email without an address
    }

    if (!backendUrl || !functionSecret) {
      logger.error(
        "Backend URL or Secret not configured in Firebase Functions env.",
        { structuredData: true }
      );
      // Don't throw error to prevent function retries for config issues
      return;
    }

    const apiEndpoint = `${backendUrl}/api/user/send-welcome`;
    const payload = {
      email: user.email,
      name: user.displayName || "Friend", // Use display name if available
    };
    const headers = {
      "Content-Type": "application/json",
      "X-Internal-Secret": functionSecret, // Send the secret header
    };

    try {
      logger.info(
        `Sending welcome email request for ${user.email} to ${apiEndpoint}`
      );
      const response = await axios.post(apiEndpoint, payload, { headers });
      logger.info(`Backend response for ${user.email}: ${response.status}`, {
        status: response.status,
        data: response.data,
        structuredData: true,
      });
    } catch (error: unknown) {
      logger.error(
        `Error sending welcome email request for ${user.email}:`,
        error,
        {
          endpoint: apiEndpoint,
          userId: user.uid,
          structuredData: true,
        }
      );
      // Log specific axios error details if available
      if (isAxiosError(error)) {
        logger.error("Axios error details:", {
          message: error.message,
          code: error.code,
          status: error.response?.status,
          data: error.response?.data,
          structuredData: true,
        });
      }
      // It's generally recommended not to throw errors here for onCreate
      // triggers unless you have a specific retry strategy,
      // as Firebase might retry.
      // Logging the error is usually sufficient.
    }
  });
