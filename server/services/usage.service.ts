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
                status: 'free',
                aiRequests: {
                    count: 0,
                    lastRequest: new Date()
                },
                aiRequestLimit: 0 // Free users have no AI access
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
            const status = await this.stripeService.getSubscriptionStatus(userId);
            const isActive = status === 'active';
            
            if (!isActive) {
                throw new Error('Premium subscription required');
            }

            await usage.incrementAIRequestCount();
        } catch (error) {
            console.error('Error incrementing AI usage:', error);
            throw error;
        }
    }

    async validateAIRequest(userId: string, tokenCount: number): Promise<boolean> {
        const usage = await UserUsage.findOne({ userId });
        if (!usage) {
            throw new Error('User usage record not found');
        }

        const canMakeRequest = await usage.canMakeAIRequest();
        const isValidTokenCount = usage.validateTokenCount(tokenCount);

        return canMakeRequest && isValidTokenCount;
    }

    async getUserUsageStats(userId: string): Promise<{
        subscription: {
            status: string;
        };
        usage: {
            aiRequests: number;
        };
    }> {
        const [usage, status] = await Promise.all([
            UserUsage.findOne({ userId }),
            this.stripeService.getSubscriptionStatus(userId)
        ]);

        if (!usage) {
            throw new Error('User usage record not found');
        }

        return {
            subscription: {
                status
            },
            usage: {
                aiRequests: usage.aiRequests.count
            }
        };
    }

    async getUserLimits(userId: string) {
        const usage = await this.getOrCreateUsage(userId);
        // Always return the limit from environment variable
        const currentLimit = parseInt(process.env['DAILY_USER_LIMIT'] || '50');
        return {
            aiRequests: {
                limit: currentLimit, // Use limit from env variable
                used: usage.aiRequests.count
            }
        };
    }
} 