import { Request } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthenticatedRequest extends Request {
    auth?: DecodedIdToken;
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