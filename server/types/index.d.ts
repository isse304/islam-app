import { Request } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';

declare namespace Express {
    interface Request {
        auth?: {
            userId: string;
            email?: string | null;
            decodedToken?: any;
        };
    }
}

declare module 'express' {
    interface Request {
        auth?: {
            userId: string;
            email?: string | null;
            decodedToken?: any;
        };
    }
}

export interface AuthenticatedRequest extends Express.Request {
    auth?: {
        userId: string;
        email?: string | null;
        decodedToken?: any;
    };
}

export interface ChatCompletionMessageParam {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface OpenAIResponse {
    choices: Array<{
        message?: {
            content: string;
        };
    }>;
} 