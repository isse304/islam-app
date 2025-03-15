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
        if (!req.authData) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const stats = await usageService.getUserUsageStats(req.authData.userId);
        res.json(stats);
    } catch (error) {
        console.error('Error getting usage stats:', error);
        res.status(500).json({ error: 'Failed to get usage stats' });
    }
}));

// Get usage limits for authenticated user
router.get('/limits', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        // In development mode, return mock data
        const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
        if (isDevelopment) {
            console.log('Development mode: Returning mock usage limits');
            
            // Return generous mock usage limits for development
            const mockLimits = {
                aiChat: {
                    total: 100,
                    used: 15,
                    remaining: 85
                },
                tafsirAi: {
                    total: 50,
                    used: 5,
                    remaining: 45
                },
                quranSearch: {
                    total: 200,
                    used: 30,
                    remaining: 170
                }
            };
            
            res.json(mockLimits);
            return;
        }
        
        // Regular auth check for non-development environments
        if (!req.auth) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // Get usage limits from database or calculate them
        // For now, return mock data
        const limits = {
            aiChat: {
                total: 10, 
                used: 3,
                remaining: 7
            },
            tafsirAi: {
                total: 5,
                used: 1,
                remaining: 4
            },
            quranSearch: {
                total: 100,
                used: 20,
                remaining: 80
            }
        };

        res.json(limits);
    } catch (error) {
        console.error('Error getting usage limits:', error);
        res.status(500).json({ error: 'Failed to get usage limits' });
    }
});

export default router; 