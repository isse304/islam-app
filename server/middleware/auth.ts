import express, { Request, Response, NextFunction } from 'express';
import { initializeApp, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { DecodedIdToken } from 'firebase-admin/auth';

// Global variable to track initialization status
let firebaseApp: App | null = null;

// Initialize Firebase Admin SDK if not already initialized
const initializeFirebase = () => {
  if (firebaseApp) {
    return;
  }

  try {
    // Try to initialize with environment variable
    if (process.env.FIREBASE_CONFIG) {
      // If FIREBASE_CONFIG is provided as a JSON string
      const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
      firebaseApp = initializeApp({
        credential: cert(firebaseConfig),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
    } 
    // If environment variables for individual settings are provided
    else if (process.env.FIREBASE_PROJECT_ID && 
             process.env.FIREBASE_CLIENT_EMAIL && 
             process.env.FIREBASE_PRIVATE_KEY) {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.trim();
      firebaseApp = initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID.trim(),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL.trim(),
          // Handle both formats of private key
          privateKey: privateKey.includes('\\n') ? 
            privateKey.replace(/\\n/g, '\n') : 
            privateKey,
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
    }
    // Otherwise try default application credentials
    else {
      console.warn('No explicit Firebase credentials found, attempting to use default credentials');
      firebaseApp = initializeApp();
    }
    
    console.log('Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
    
    // In development mode, we can still proceed without Firebase
    if (process.env.NODE_ENV !== 'development') {
      throw error;
    } else {
      console.log('Development mode: continuing without Firebase Admin SDK');
    }
  }
};

// Initialize Firebase when this module is imported
initializeFirebase();

// Declare auth extension on the Request interface
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        email?: string | null;
        decodedToken?: DecodedIdToken;
      };
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
    authData?: AuthData;
}

export const authenticateUser = (req: Request, res: Response, next: NextFunction) => {
  // Log authentication attempt
  console.log('Authenticating user request to:', req.originalUrl);

  try {
    // Development mode handling - bypass authentication if needed
    if (process.env.NODE_ENV === 'development') {
      console.log('Development mode: Auto-authorizing request with mock user ID');
      
      // Get user ID from header, query param, or use a default
      const testUserId = req.headers['x-test-user-id'] || req.query.userId || 'test-user-123';
      
      (req as AuthenticatedRequest).auth = {
        userId: typeof testUserId === 'string' ? testUserId : 'test-user-123',
        email: 'test@example.com'
      };
      return next();
    }

    // Get the auth token from the request headers
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('No Bearer token found in request');
      return res.status(401).json({ error: 'Unauthorized - No token provided' });
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Verify the Firebase token
    getAuth().verifyIdToken(token)
      .then((decodedToken: DecodedIdToken) => {
        // Set the user info in the request
        (req as AuthenticatedRequest).auth = {
          userId: decodedToken.uid,
          email: decodedToken.email,
          decodedToken: decodedToken
        };
        console.log('User authenticated via Firebase:', decodedToken.uid);
        next();
      })
      .catch((error: any) => {
        console.error('Error verifying Firebase token:', error);
        res.status(401).json({ error: 'Unauthorized - Invalid token' });
      });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

export const withAuth = (handler: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Development mode handling
      if (process.env.NODE_ENV === 'development') {
        console.log('Development mode: Auto-authorizing request with mock user ID');
        const testUserId = req.headers['x-test-user-id'] || req.query.userId || 'test-user-123';
        (req as AuthenticatedRequest).auth = {
          userId: typeof testUserId === 'string' ? testUserId : 'test-user-123',
          email: 'test@example.com'
        };
        return handler(req as AuthenticatedRequest, res, next);
      }

      // Production mode handling
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No token provided' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      
      const authedReq = req as AuthenticatedRequest;
      authedReq.auth = {
        userId: decodedToken.uid,
        email: decodedToken.email,
        decodedToken
      };

      await handler(authedReq, res, next);
    } catch (error) {
      console.error('Auth error:', error);
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}; 