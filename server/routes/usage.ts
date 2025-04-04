import express, { Response } from 'express';
import { UsageService } from '../services/usage.service';
import { StripeService } from '../services/stripe.service';
import { AuthenticatedRequest, withAuth } from '../middleware/auth';
import * as admin from 'firebase-admin';
import { EmailService } from '../services/email.service';

interface UsageLimitsResponse {
    status: 'free' | 'active';
    aiRequests: {
        total: number;
        used: number;
        remaining: number;
    };
}

const router = express.Router();
const emailService = new EmailService();
const stripeService = new StripeService(emailService);
const usageService = new UsageService(stripeService);

// Get user's current usage and subscription status
router.get('/status', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const stats = await usageService.getUserUsageStats(req.auth!.uid);
        res.json(stats);
    } catch (error) {
        console.error('Error getting usage stats:', error);
        res.status(500).json({ error: 'Failed to get usage stats' });
    }
}));

// Get usage limits for authenticated user
router.get('/limits', withAuth(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const status = await stripeService.getSubscriptionStatus(req.auth!.uid);
        
        // Check both subscription status and premium claims
        const userRecord = await admin.auth().getUser(req.auth!.uid);
        const claims = userRecord.customClaims || {};
        const isPremium = claims['premium'] === true || claims['subscriptionStatus'] === 'active';
        
        // If user is not premium, return error
        if (status !== 'active' && !isPremium) {
            console.log('User not premium:', {
                subscriptionStatus: status,
                claims: claims
            });
            res.status(403).json({ 
                error: 'Premium subscription required to access usage information',
                details: {
                    subscriptionStatus: status,
                    premium: claims['premium']
                }
            });
            return;
        }

        // Get usage limits for premium user
        const userLimits = await usageService.getUserLimits(req.auth!.uid);
        
        // Format response
        const limits: UsageLimitsResponse = {
            status: status as 'free' | 'active',
            aiRequests: {
                total: userLimits.aiRequests.limit,
                used: userLimits.aiRequests.used,
                remaining: userLimits.aiRequests.limit - userLimits.aiRequests.used
            }
        };

        res.json(limits);
    } catch (error: any) {
        console.error('Error getting usage limits:', error);
        res.status(500).json({ error: 'Failed to get usage limits' });
    }
}));

export default router; 