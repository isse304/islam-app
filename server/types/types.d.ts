import { Request } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';

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

export interface AuthenticatedRequest extends Request {
    auth?: {
        userId: string;
        email?: string | null;
        decodedToken?: DecodedIdToken;
    };
}

export interface AIRequestBody {
    prompt: string;
    systemMessage?: string;
    temperature?: number;
    maxTokens?: number;
}

export interface DuaRequestBody {
    dua: {
        arabic: string;
        translation: string;
        reference: string;
    };
}

export interface EmotionalSearchBody {
    emotion: string;
    context: string;
}

export interface TafsirChatBody {
    surah: number;
    verse: number;
    question: string;
}

export interface AIResponse {
    success: boolean;
    content?: string;
    error?: string;
    message?: string;
} 