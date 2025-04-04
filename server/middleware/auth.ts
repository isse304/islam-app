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
      const decodedToken = await verifyToken(token);
      req.auth = decodedToken; // Attach decoded token info
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
      
      // Ensure req.auth exists before accessing claims
      if (req.auth?.premium === true) {
          console.log('[withPremium] Premium status verified.');
          // User is premium, call the original route handler passed to withPremium
          // Ensure the final handler is called correctly
          return handler(req, res, next); 
      } else {
          console.log('[withPremium] Premium status check failed.');
          return res.status(403).json({ error: 'Forbidden', details: 'Premium access required' });
      }
  };

  // Return the middleware chain: first run withAuth, then premiumCheckHandler
  return withAuth(premiumCheckHandler);
}; 