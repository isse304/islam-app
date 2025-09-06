import { DecodedIdToken } from 'firebase-admin/auth';
import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      auth?: DecodedIdToken;
      body: any;
      query: any;
      params: any;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  auth: DecodedIdToken;
} 