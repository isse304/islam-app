import express, { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/express';
import { withAuth } from '../middleware/auth';
import { auth } from '../config/firebase';

const router = express.Router();

/**
 * Look up a user by email and return their UID
 * POST /api/lookup/user-by-email
 * Body: { email: string }
 * Returns: { uid: string, email: string, displayName?: string }
 */
router.post('/user-by-email', withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { email } = req.body;
        
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ 
                error: 'Email is required' 
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        try {
            // Look up user in Firebase Auth by email
            const userRecord = await auth.getUserByEmail(normalizedEmail);
            
            return res.json({
                success: true,
                user: {
                    uid: userRecord.uid,
                    email: userRecord.email,
                    displayName: userRecord.displayName || null,
                    emailVerified: userRecord.emailVerified
                }
            });
        } catch (error: any) {
            if (error.code === 'auth/user-not-found') {
                return res.status(404).json({
                    error: 'No user found with that email',
                    message: 'Make sure the user has created an account first.'
                });
            }
            throw error;
        }
    } catch (error) {
        console.error('[LookupRoute] Error looking up user:', error);
        next(error);
    }
}));

export default router;





