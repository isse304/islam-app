import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import { AuthenticatedRequest } from '../types/express';
import { evaluatePremiumAccess } from '../utils/premium-access';

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
        const access = evaluatePremiumAccess(req.auth as any);
        if (!access.granted) {
            // Distinguish a lapsed subscription so the client can prompt to renew
            // rather than pitching a plan the user already had.
            return res.status(403).send({
                error: access.reason === 'subscription_expired'
                    ? 'Forbidden: Premium subscription expired'
                    : 'Forbidden: Premium access required',
                reason: access.reason,
                subscriptionEnd: access.subscriptionEnd
            });
        }
        return handler(req, res, next);
    }); 