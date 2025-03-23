import { DecodedIdToken } from 'firebase-admin/auth';
import { Request } from 'express';

declare global {
    namespace Express {
        interface Request {
            auth?: {
                userId: string;
                email?: string | null;
                decodedToken?: DecodedIdToken;
            };
            body: any;
        }
    }
}

export interface AuthenticatedRequest extends Request {
    auth?: {
        userId: string;
        email?: string | null;
        decodedToken?: DecodedIdToken;
    };
    body: any;
}

export {}; 