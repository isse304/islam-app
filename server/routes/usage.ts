import express, { Response } from 'express';
import { UsageService } from '../services/usage.service';
import { StripeService } from '../services/stripe.service';
import { AuthenticatedRequest, withAuth } from '../middleware/auth';

const router = express.Router();
const stripeService = new StripeService(
    process.env.STRIPE_SECRET_KEY!,
    process.env.STRIPE_PRICE_ID!
);
const usageService = new UsageService(stripeService);

// Get user's current usage and subscription status
router.get('/status', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const stats = await usageService.getUserUsageStats(req.auth.userId);
        res.json(stats);
    } catch (error) {
        console.error('Error getting usage stats:', error);
        res.status(500).json({ error: 'Failed to get usage stats' });
    }
}));

// Get user limits
router.get('/limits', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const limits = await usageService.getUserLimits(req.auth.userId);
        res.json(limits);
    } catch (error) {
        console.error('Error getting user limits:', error);
        res.status(500).json({ error: 'Failed to get user limits' });
    }
}));

export default router; 