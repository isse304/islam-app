import { UserUsage, IUserUsage } from '../models/UserUsage';
import { StripeService } from './stripe.service';

export class UsageService {
    private stripeService: StripeService;

    constructor(stripeService: StripeService) {
        this.stripeService = stripeService;
    }

    async getOrCreateUsage(userId: string): Promise<IUserUsage> {
        let usage = await UserUsage.findOne({ userId });
        
        if (!usage) {
            usage = await UserUsage.create({ 
                userId,
                status: 'trial'
            });
        }
        
        return usage;
    }

    async incrementAIUsage(userId: string): Promise<void> {
        const usage = await UserUsage.findOne({ userId });
        if (!usage) {
            throw new Error('User usage record not found');
        }

        try {
            // Check subscription status
            const subscriptionStatus = await this.stripeService.getSubscriptionStatus(userId);
            const isActive = subscriptionStatus.status === 'active' || subscriptionStatus.status === 'trialing';
            
            if (!isActive) {
                throw new Error('Active subscription required');
            }

            await usage.incrementAIRequestCount();
        } catch (error) {
            console.error('Error incrementing AI usage:', error);
            throw error;
        }
    }

    async getUserUsageStats(userId: string): Promise<{
        subscription: {
            status: string;
            trial_end?: Date;
        };
        usage: {
            aiRequests: number;
        };
    }> {
        const [usage, subscription] = await Promise.all([
            UserUsage.findOne({ userId }),
            this.stripeService.getSubscriptionStatus(userId)
        ]);

        if (!usage) {
            throw new Error('User usage record not found');
        }

        return {
            subscription: {
                status: subscription.status,
                trial_end: subscription.currentPeriodEnd
            },
            usage: {
                aiRequests: usage.aiRequests.count
            }
        };
    }

    async getUserLimits(userId: string) {
        const usage = await this.getOrCreateUsage(userId);
        return {
            aiRequests: {
                limit: usage.aiRequestLimit,
                used: usage.aiRequests.count
            }
        };
    }
} 