import { Request } from 'express-serve-static-core';
import { DecodedIdToken } from 'firebase-admin/auth';

declare module 'express' {
  interface Request {
    auth?: DecodedIdToken;
  }
}

declare interface AuthenticatedRequest extends Express.Request {
  auth: DecodedIdToken;
}

declare interface ChatCompletionMessageParam {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

declare interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage: {
    total_tokens: number;
  };
}

export = {
  AuthenticatedRequest,
  ChatCompletionMessageParam,
  OpenAIResponse
}; 