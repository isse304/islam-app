import express, { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import { DecodedIdToken } from 'firebase-admin/auth';

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  try {
    // Try to initialize with environment variable
    if (process.env.FIREBASE_CONFIG) {
      // If FIREBASE_CONFIG is provided as a JSON string
      const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
      admin.initializeApp({
        credential: admin.credential.cert(firebaseConfig),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
    } 
    // If environment variables for individual settings are provided
    else if (process.env.FIREBASE_PROJECT_ID && 
             process.env.FIREBASE_CLIENT_EMAIL && 
             process.env.FIREBASE_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          // Private key comes as a string with \n escape sequences - we need to replace with real newlines
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
    }
    // Otherwise try default application credentials (for GCP or Firebase hosting environments)
    else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
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
}

// Declare auth extension on the Request interface
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        email?: string;
        token?: string;
      };
    }
  }
}

export interface AuthenticatedRequest extends Request {
  auth: {
    userId: string;
    email?: string;
    token?: string;
  };
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
      
      req.auth = {
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
    admin.auth().verifyIdToken(token)
      .then((decodedToken: DecodedIdToken) => {
        // Set the user info in the request
        req.auth = {
          userId: decodedToken.uid,
          email: decodedToken.email,
          token: token
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

// Utility function to wrap route handlers with authentication
export const withAuth = (handler: (req: AuthenticatedRequest, res: Response, next?: NextFunction) => any) => {
  return [
    authenticateUser,
    (req: Request, res: Response, next: NextFunction) => handler(req as AuthenticatedRequest, res, next)
  ];
}; 