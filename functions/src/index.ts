import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import * as logger from "firebase-functions/logger";
import axios, { isAxiosError } from "axios";

// This file contains the cloud functions for the application.

const backendUrl = process.env.REACT_APP_API_URL || "https://nura-y6uq.onrender.com";
const functionSecret = functions.config().backend?.secret;

export const onUserCreate = functionsV1.auth
  .user()
  .onCreate(async (user: functionsV1.auth.UserRecord) => {
    logger.info(`New user created: ${user.uid}, Email: ${user.email}`);

    if (!user.email) {
      logger.warn(
        `User ${user.uid} created without an email. Cannot send welcome email.`
      );
      return;
    }

    if (!backendUrl || !functionSecret) {
      logger.error(
        "Backend URL or Secret not configured in Firebase Functions env.",
        { structuredData: true }
      );
      return;
    }

    const apiEndpoint = `${backendUrl}/api/users/send-welcome`;
    const payload = {
      email: user.email,
      name: user.displayName || "Friend",
    };
    const headers = {
      "Content-Type": "application/json",
      "X-Internal-Secret": functionSecret,
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
      if (isAxiosError(error)) {
        logger.error("Axios error details:", {
          message: error.message,
          code: error.code,
          status: error.response?.status,
          data: error.response?.data,
          structuredData: true,
        });
      }
    }
  });

// Temporarily disabled due to lint errors - these are old functions not needed for Phase 1
// export * from "./auth/setRoleClaim";
// export * from "./auth/setRoleClaimDirect";
export * from "./notifications";
// export * from "./parent"; // Temporarily disabled