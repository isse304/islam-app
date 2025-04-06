import express, { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { auth } from '../config/firebase';

// Declare auth extension on the Request interface
declare global {
  namespace Express {
    interface Request {
      auth?: DecodedIdToken;
    }
  }
}

// Define a custom auth property that doesn't conflict with Request
export interface AuthData {
    userId: string;
    decodedToken: DecodedIdToken;
}

// Extend Request with our custom auth property
export interface AuthenticatedRequest extends Request {
    auth?: DecodedIdToken;
}

// Helper function to verify the ID token
const verifyToken = async (token: string): Promise<DecodedIdToken> => {
  try {
    const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;
    console.log('[verifyToken] Verifying token...'); // Simple log
    const decodedToken = await auth.verifyIdToken(cleanToken, true /** checkRevoked */);
    console.log(`[verifyToken] Token verified successfully for UID: ${decodedToken.uid}`);
    return decodedToken;
  } catch (error: any) {
    console.error('[verifyToken] Token verification failed:', error.code || error.message);
    throw new Error(error.code === 'auth/id-token-expired' ? 'Token expired' : 'Invalid token');
  }
};

// Middleware function generator using ID Token (Authorization Header)
// Adjust handler type to allow Response return types
export const withAuth = (handler?: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void | Response> | void | Response) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    console.log(`--- withAuth (Bearer Token) triggered for URL: ${req.originalUrl} at ${new Date().toISOString()} ---`);

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[withAuth] No or invalid Bearer token header found.');
      return res.status(401).json({ error: 'Unauthorized', details: 'Bearer token required' });
    }

    const token = authHeader.split('Bearer ')[1];
    if (!token) {
        console.log('[withAuth] Empty token after Bearer.');
        return res.status(401).json({ error: 'Unauthorized', details: 'Empty token' });
    }

    try {
      console.log(`[withAuth] User ${req.auth?.uid || 'N/A'}: Attempting token verification...`); // Log before verify
      const decodedToken = await verifyToken(token);
      console.log(`[withAuth] User ${decodedToken.uid}: Token verification successful.`); // Log after verify
      req.auth = decodedToken; // Attach decoded token info
      console.log('[withAuth] Successfully attached auth data. Proceeding to call handler (if provided) or next().'); // Added Log
      console.log('[withAuth] Token verified, proceeding...');
      if (handler) {
          // Call the handler (e.g., premiumCheckHandler or the final route handler)
          // No explicit return needed here as the handler manages the response/next()
          await handler(req, res, next);
      } else {
        next(); // Otherwise, just proceed to the route's main handler
      }
    } catch (error: any) {
      console.error('[withAuth] Token verification caught error:', error.message);
      res.status(401).json({ 
          error: 'Unauthorized', 
          details: error.message || 'Invalid token',
      });
    }
  };
};

// Optional: Middleware function generator to check premium status AFTER withAuth
export const withPremium = (handler: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void | Response> | void | Response) => {
  // Define the handler that checks premium status
  const premiumCheckHandler = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      console.log(`--- withPremium check triggered for URL: ${req.originalUrl} at ${new Date().toISOString()} ---`);
      if (!req.auth) { 
          console.error('[withPremium] req.auth missing! withAuth should have run first.');
          return res.status(500).json({ error: 'Server Configuration Error', details: 'Authentication context missing' });
      }
      
      console.log(`[premiumCheckHandler] Entered for user ${req.auth?.uid}. Checking premium status...`); // Added Log
      console.log(`[premiumCheckHandler] Value of req.auth?.premium: ${req.auth?.premium}`); // Added Log
      // Ensure req.auth exists before accessing claims
      if (req.auth?.premium === true) {
          console.log('[withPremium] Premium status verified.');
          console.log(`[premiumCheckHandler] Premium check PASSED for user ${req.auth.uid}. Preparing to call final route handler...`); // Added Log
          // User is premium, call the original route handler passed to withPremium
          // Ensure the final handler is called correctly
          console.log(`[withPremium] User ${req.auth.uid}: Calling final handler...`); // Log before calling final handler
          const result = await handler(req, res, next);
          console.log(`[withPremium] User ${req.auth.uid}: Final handler call finished.`); // Log after calling final handler
          console.log(`[premiumCheckHandler] POST-HANDLER: Final handler finished for user ${req.auth.uid}. Returning control.`); // Added Log
          return result;
      } else {
          console.log('[withPremium] Premium status check failed.');
          console.log(`[premiumCheckHandler] Premium check FAILED for user ${req.auth.uid}. Returning 403.`); // Added Log
          return res.status(403).json({ error: 'Forbidden', details: 'Premium access required' });
      }
  };

  // Return the middleware chain: first run withAuth, then premiumCheckHandler
  return withAuth(premiumCheckHandler);
}; 