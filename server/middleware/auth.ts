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

// Verify Firebase token and attach user data to request
const verifyToken = async (token: string): Promise<DecodedIdToken> => {
  try {
    // Remove 'Bearer ' prefix if present
    const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;

    // Log token format details (safely)
    console.log('Token validation details:', {
      length: cleanToken.length,
      format: cleanToken.includes('.') ? 'JWT format' : 'Invalid format',
      parts: cleanToken.split('.').length,
      truncatedToken: `${cleanToken.substring(0, 10)}...${cleanToken.substring(cleanToken.length - 10)}`
    });

    // Verify the token
    const decodedToken = await auth.verifyIdToken(cleanToken);
    
    // Log decoded token details (safely)
    console.log('Token verification successful:', {
      uid: decodedToken.uid,
      premium: decodedToken.premium,
      features: decodedToken.features,
      exp: decodedToken.exp,
      iat: decodedToken.iat,
      tokenAge: Math.floor((Date.now() / 1000) - decodedToken.iat)
    });

    return decodedToken;
  } catch (error: any) {
    console.error('Token verification error:', {
      name: error.name,
      code: error.code,
      message: error.message,
      tokenLength: token?.length,
      hasBearer: token?.startsWith('Bearer ')
    });

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
      // Log request details
      console.log('Auth request details:', {
        path: req.path,
        method: req.method,
        hasAuthHeader: !!req.headers.authorization,
        headerKeys: Object.keys(req.headers)
      });

      const authHeader = req.headers.authorization;
      if (!authHeader) {
        console.error('No authorization header present');
        return res.status(401).json({ error: 'No token provided' });
      }

      if (!authHeader.startsWith('Bearer ')) {
        console.error('Invalid authorization header format:', authHeader.substring(0, 10));
        return res.status(401).json({ error: 'Invalid token format' });
      }

      const token = authHeader.split('Bearer ')[1];
      if (!token || token.trim() === '') {
        console.error('Empty token after Bearer prefix');
        return res.status(401).json({ error: 'Empty token' });
      }

      try {
        const decodedToken = await verifyToken(token);
        
        // Additional validation for AI endpoints
        if (req.path.includes('/api/ai/')) {
          console.log('AI endpoint detected, validating premium status');
          const isPremium = decodedToken.premium === true;
          
          console.log('Premium validation:', {
            premium: decodedToken.premium,
            features: decodedToken.features,
            isPremium: isPremium
          });
          
          if (!isPremium) {
            console.error('Premium access required for AI endpoint');
            return res.status(403).json({ error: 'Premium subscription required' });
          }
          
          console.log('Premium status validated for AI endpoint');
        }

        req.auth = decodedToken;
        console.log('Request authenticated successfully');

        return handler ? handler(req, res) : next();
      } catch (error: any) {
        console.error('Auth validation error:', {
          message: error.message,
          code: error.code,
          path: req.path
        });
        return res.status(401).json({ error: error.message });
      }
    } catch (error: any) {
      console.error('Unexpected auth error:', {
        message: error.message,
        stack: error.stack
      });
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}; 