import * as functionsV1 from 'firebase-functions/v1';
import { RtcTokenBuilder, RtcRole } from 'agora-token';

/**
 * Firebase Cloud Function to generate Agora RTC tokens
 * 
 * Usage:
 * const result = await generateAgoraToken({
 *   channelName: 'test-channel',
 *   uid: 123456,
 *   role: 'publisher'
 * });
 */
export const generateAgoraToken = functionsV1.https.onCall(
  async (data, context) => {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functionsV1.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to generate Agora token'
      );
    }

    // Validate request data
    const { channelName, uid, role, expirationTime } = data;

    if (!channelName) {
      throw new functionsV1.https.HttpsError(
        'invalid-argument',
        'channelName is required'
      );
    }

    if (uid === undefined || uid === null) {
      throw new functionsV1.https.HttpsError(
        'invalid-argument',
        'uid is required'
      );
    }

    // Get Agora credentials from Firebase config
    const appId = functionsV1.config().agora?.app_id;
    const appCertificate = functionsV1.config().agora?.app_certificate;

    if (!appId || !appCertificate) {
      console.error('[generateAgoraToken] Agora credentials not configured');
      throw new functionsV1.https.HttpsError(
        'failed-precondition',
        'Agora credentials not configured. Please contact administrator.'
      );
    }

    try {
      // Determine role
      const agoraRole = role === 'publisher' 
        ? RtcRole.PUBLISHER 
        : RtcRole.SUBSCRIBER;

      // Calculate expiration time (default 1 hour)
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const privilegeExpiredTs = expirationTime 
        ? currentTimestamp + expirationTime 
        : currentTimestamp + 3600;

      // Build token with correct parameter order
      const token = RtcTokenBuilder.buildTokenWithUid(
        appId,
        appCertificate,
        channelName,
        uid,
        agoraRole,
        privilegeExpiredTs,
        privilegeExpiredTs
      );

      console.log(`[generateAgoraToken] Token generated for user: ${context.auth.uid}, channel: ${channelName}`);

      // Return token response
      return {
        token,
        appId,
        channelName,
        uid,
        expirationTime: privilegeExpiredTs,
        success: true
      };
    } catch (error) {
      console.error('[generateAgoraToken] Error generating token:', error);
      throw new functionsV1.https.HttpsError(
        'internal',
        'Failed to generate Agora token'
      );
    }
  }
);

// Note: Scheduled functions and triggers will be added in Phase 2
// For now, we only need the token generation function
