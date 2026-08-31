import express, { Response, NextFunction } from 'express';
import { UsageService } from '../services/usage.service';
import { StripeService } from '../services/stripe.service';
import { AuthenticatedRequest } from '../types/express';
import { withAuth } from '../middleware/auth';
import * as admin from 'firebase-admin';
import { EmailService } from '../services/email.service';
import { hasPremiumAccess } from '../utils/premium-access';

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
router.get('/status', withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const stats = await usageService.getUserUsageStats(req.auth!.uid);
        res.json(stats);
    } catch (error) {
        console.error('Error getting usage stats:', error);
        next(error);
    }
}));

// Get usage limits for authenticated user
router.get('/limits', withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Check subscription status from DB AND claims
        const dbStatus = await stripeService.getSubscriptionStatus(req.auth!.uid);
        const userRecord = await admin.auth().getUser(req.auth!.uid);
        const claims = userRecord.customClaims || {};
        const isPremiumClaim = hasPremiumAccess(claims);

        // Determine the effective status (prioritize claims)
        const effectiveStatus = isPremiumClaim ? 'active' : dbStatus;

        // If user is not effectively premium, return error
        if (effectiveStatus !== 'active') {
            console.log('User not premium (checked claims and DB):', {
                dbSubscriptionStatus: dbStatus,
                claims: claims
            });
            res.status(403).json({ 
                error: 'Premium subscription required to access usage information',
                details: {
                    subscriptionStatus: dbStatus, // Report DB status in details
                    premiumClaim: claims['premium'],
                    statusClaim: claims['subscriptionStatus']
                }
            });
            return;
        }

        // Get usage limits for premium user
        const userLimits = await usageService.getUserLimits(req.auth!.uid);
        
        // Format response using the EFFECTIVE status
        const limits: UsageLimitsResponse = {
            status: effectiveStatus as 'active', // Use effective status ('active' since we passed the check)
            aiRequests: {
                total: userLimits.aiRequests.limit,
                used: userLimits.aiRequests.used,
                remaining: userLimits.aiRequests.limit - userLimits.aiRequests.used
            }
        };

        res.json(limits);
    } catch (error: any) {
        console.error('Error getting usage limits:', error);
        next(error);
    }
}));

export default router; 