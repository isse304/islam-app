import { Request, Response, NextFunction } from 'express';
import { Session } from 'express-session';

// Extend express-session types
declare module 'express-session' {
    interface Session {
        auth?: {
            userId: string;
            sessionId: string;
            token: string;
        };
    }
}

export interface AuthenticatedRequest extends Request {
    session: Session & {
        auth?: {
            userId: string;
            sessionId: string;
            token: string;
        };
    };
    auth?: {
        userId: string;
        sessionId: string;
    };
}

export const requireAuth = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void | Response> => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(401).json({ 
                error: 'Authentication required',
                message: 'No authorization header found'
            });
        }

        // Check if it's a Bearer token
        if (!authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Invalid authentication format',
                message: 'Authorization header must start with Bearer'
            });
        }

        // Get the token
        const token = authHeader.split(' ')[1];

        // Verify the session token with Clerk
        try {
            const response = await fetch('https://api.clerk.dev/v1/sessions/verify', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.CLERK_SECRET_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token })
            });

            if (!response.ok) {
                throw new Error('Invalid session token');
            }

            const session = await response.json();
            
            // Store auth info in session
            req.session.auth = {
                userId: session.userId,
                sessionId: session.id,
                token
            };

            next();
        } catch (error) {
            return res.status(401).json({ 
                error: 'Invalid session',
                message: 'The provided session token is invalid or expired'
            });
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({ 
            error: 'Authentication error',
            message: 'An error occurred while authenticating the request'
        });
    }
};

// Type definition for the user property we're adding to the Request
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                sessionId: string;
            };
        }
    }
} 