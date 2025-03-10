import { Request } from 'express';
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
    auth: {
        userId: string;
        sessionId: string;
    };
    session: Session & {
        userId?: string;
    };
}

// Type definition for the user property we're adding to the Request
declare global {
    namespace Express {
        interface Request {
            auth: {
                userId: string;
                sessionId: string;
            };
        }
    }
} 