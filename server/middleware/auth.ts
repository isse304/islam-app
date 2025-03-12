import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';
import type { RequireAuthProp } from '@clerk/clerk-sdk-node';

// Use Clerk's built-in type for authenticated requests
export type AuthenticatedRequest = RequireAuthProp<Request>;

// Extend Express Request type to include auth
declare global {
    namespace Express {
        interface Request {
            auth?: {
                userId: string;
            };
            user: {
                id: string;
                email: string;
            };
        }
    }
}

// Middleware to authenticate user
export const authenticateUser = ClerkExpressRequireAuth();

// Type guard to check if request is authenticated
export const isAuthenticated = (req: Request): req is AuthenticatedRequest => {
    return req.auth !== undefined;
};

// Wrapper function to handle authenticated routes
export const withAuth = (handler: (req: AuthenticatedRequest, res: Response) => Promise<void>) => {
    return (req: Request, res: Response, next: NextFunction) => {
        authenticateUser(req, res, async () => {
            try {
                await handler(req as AuthenticatedRequest, res);
            } catch (error) {
                next(error);
            }
        });
    };
}; 