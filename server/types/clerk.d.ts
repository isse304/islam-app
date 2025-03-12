import { Request } from 'express';

declare global {
    namespace Express {
        interface Request {
            auth?: {
                userId: string;
                sessionId: string;
                sessionClaims?: {
                    email: string;
                    [key: string]: any;
                };
            };
            user?: {
                id: string;
                email: string;
            };
        }
    }
}

export {}; 