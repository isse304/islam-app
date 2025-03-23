import express, { Request, Response, NextFunction } from 'express';
import { initializeApp, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { DecodedIdToken } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Global variable to track initialization status
let firebaseApp: App | null = null;

// Initialize Firebase Admin SDK if not already initialized
const initializeFirebase = () => {
  if (firebaseApp) return firebaseApp;

  try {
    if (!process.env.FIREBASE_CONFIG) {
      throw new Error('Firebase configuration missing');
    }

    const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
    firebaseApp = initializeApp({
      credential: cert(firebaseConfig)
    });
    
    return firebaseApp;
  } catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
    throw error;
  }
};

// Initialize Firebase when this module is imported
initializeFirebase();

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

// Verify Firebase token and attach user data to request
const verifyToken = async (token: string): Promise<DecodedIdToken> => {
  const auth = getAuth();
  try {
    return await auth.verifyIdToken(token);
  } catch (error: any) {
    if (error.code === 'auth/id-token-expired') {
      throw new Error('Token expired');
    } else if (error.code === 'auth/id-token-revoked') {
      throw new Error('Token revoked');
    }
    throw new Error('Invalid token');
  }
};

// Single auth middleware that can be used both as middleware and HOC
export const withAuth = (handler?: (req: Request, res: Response) => Promise<void | Response>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.split('Bearer ')[1];
      
      try {
        const decodedToken = await verifyToken(token);
        req.auth = decodedToken;

        return handler ? handler(req, res) : next();
      } catch (error: any) {
        return res.status(401).json({ error: error.message });
      }
    } catch (error) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}; 