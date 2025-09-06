import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import { AuthenticatedRequest } from '../types/express';

export const withAuth = (handler: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void) => 
    async (req: Request, res: Response, next: NextFunction) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).send({ error: 'Unauthorized: No token provided' });
        }

        const idToken = authHeader.split('Bearer ')[1];
        try {
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            (req as AuthenticatedRequest).auth = decodedToken;
            return handler(req as AuthenticatedRequest, res, next);
        } catch (error) {
            return res.status(401).send({ error: 'Unauthorized: Invalid token' });
        }
};

export const withPremium = (handler: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void) => 
    withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!(req.auth as any)?.premium) { // Cast to any to check for premium claim
            return res.status(403).send({ error: 'Forbidden: Premium access required' });
        }
        return handler(req, res, next);
    }); 