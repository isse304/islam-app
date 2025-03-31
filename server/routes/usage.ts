import express, { Response } from 'express';
import { UsageService } from '../services/usage.service';
import { StripeService } from '../services/stripe.service';
import { AuthenticatedRequest, withAuth } from '../middleware/auth';

interface UsageLimitsResponse {
    status: 'free' | 'active';
    aiRequests: {
        total: number;
        used: number;
        remaining: number;
    };
}

const router = express.Router();
const stripeService = new StripeService();
const usageService = new UsageService(stripeService);

// Get user's current usage and subscription status
router.get('/status', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!req.auth) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const stats = await usageService.getUserUsageStats(req.auth.uid);
        res.json(stats);
    } catch (error) {
        console.error('Error getting usage stats:', error);
        res.status(500).json({ error: 'Failed to get usage stats' });
    }
}));

// Get usage limits for authenticated user
router.get('/limits', withAuth(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        if (!req.auth) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // Get subscription status first
        const status = await stripeService.getSubscriptionStatus(req.auth.uid);
        
        // If user is not premium, return error
        if (status !== 'active') {
            res.status(403).json({ error: 'Premium subscription required to access usage information' });
            return;
        }

        // Get usage limits for premium user
        const userLimits = await usageService.getUserLimits(req.auth.uid);
        
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