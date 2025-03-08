import { UserUsage } from '../models/UserUsage';
import { EmailService } from './email.service';

export class CostMonitorService {
    private readonly COST_PER_1K_INPUT_TOKENS = 0.0005;
    private readonly COST_PER_1K_OUTPUT_TOKENS = 0.0015;
    private readonly DAILY_COST_THRESHOLD = 10; // $10
    private readonly HOURLY_COST_THRESHOLD = 2; // $2
    private readonly emailService: EmailService;

    constructor(emailService: EmailService) {
        this.emailService = emailService;
    }

    private calculateCost(inputTokens: number, outputTokens: number): number {
        const inputCost = (inputTokens / 1000) * this.COST_PER_1K_INPUT_TOKENS;
        const outputCost = (outputTokens / 1000) * this.COST_PER_1K_OUTPUT_TOKENS;
        return inputCost + outputCost;
    }

    async checkDailyCosts(): Promise<void> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const usage = await UserUsage.aggregate([
            {
                $match: {
                    lastRequest: { $gte: today }
                }
            },
            {
                $group: {
                    _id: null,
                    totalInputTokens: { $sum: { $multiply: ['$requests.tokens', 0.7] } },
                    totalOutputTokens: { $sum: { $multiply: ['$requests.tokens', 0.3] } }
                }
            }
        ]);

        if (usage.length > 0) {
            const { totalInputTokens, totalOutputTokens } = usage[0];
            const dailyCost = this.calculateCost(totalInputTokens, totalOutputTokens);

            if (dailyCost > this.DAILY_COST_THRESHOLD) {
                await this.emailService.sendCostAlert('daily', dailyCost, this.DAILY_COST_THRESHOLD);
            }
        }
    }

    async checkHourlyCosts(): Promise<void> {
        const oneHourAgo = new Date();
        oneHourAgo.setHours(oneHourAgo.getHours() - 1);

        const usage = await UserUsage.aggregate([
            {
                $match: {
                    lastRequest: { $gte: oneHourAgo }
                }
            },
            {
                $group: {
                    _id: null,
                    totalInputTokens: { $sum: { $multiply: ['$requests.tokens', 0.7] } },
                    totalOutputTokens: { $sum: { $multiply: ['$requests.tokens', 0.3] } }
                }
            }
        ]);

        if (usage.length > 0) {
            const { totalInputTokens, totalOutputTokens } = usage[0];
            const hourlyCost = this.calculateCost(totalInputTokens, totalOutputTokens);

            if (hourlyCost > this.HOURLY_COST_THRESHOLD) {
                await this.emailService.sendCostAlert('hourly', hourlyCost, this.HOURLY_COST_THRESHOLD);
            }
        }
    }

    async getCostProjection(): Promise<{
        daily: number;
        monthly: number;
        hourly: number;
    }> {
        const now = new Date();
        const today = new Date(now.setHours(0, 0, 0, 0));
        const oneHourAgo = new Date(now.setHours(now.getHours() - 1));

        const [dailyUsage, hourlyUsage] = await Promise.all([
            UserUsage.aggregate([
                {
                    $match: {
                        lastRequest: { $gte: today }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalInputTokens: { $sum: { $multiply: ['$requests.tokens', 0.7] } },
                        totalOutputTokens: { $sum: { $multiply: ['$requests.tokens', 0.3] } }
                    }
                }
            ]),
            UserUsage.aggregate([
                {
                    $match: {
                        lastRequest: { $gte: oneHourAgo }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalInputTokens: { $sum: { $multiply: ['$requests.tokens', 0.7] } },
                        totalOutputTokens: { $sum: { $multiply: ['$requests.tokens', 0.3] } }
                    }
                }
            ])
        ]);

        const dailyCost = dailyUsage.length > 0
            ? this.calculateCost(dailyUsage[0].totalInputTokens, dailyUsage[0].totalOutputTokens)
            : 0;

        const hourlyCost = hourlyUsage.length > 0
            ? this.calculateCost(hourlyUsage[0].totalInputTokens, hourlyUsage[0].totalOutputTokens)
            : 0;

        // Project monthly cost based on daily average
        const monthlyCost = dailyCost * 30;

        return {
            daily: dailyCost,
            monthly: monthlyCost,
            hourly: hourlyCost
        };
    }

    async logUsage(data: { userId: string; type: string; amount: number }): Promise<void> {
        const usage = await UserUsage.findOneAndUpdate(
            { userId: data.userId },
            { 
                $inc: { count: data.amount },
                $set: { lastRequest: new Date() }
            },
            { upsert: true, new: true }
        );

        if (usage.count >= parseInt(process.env.DAILY_USER_LIMIT || '100')) {
            await this.emailService.sendUsageAlert(data.userId, usage.count, parseInt(process.env.DAILY_USER_LIMIT || '100'));
        }
    }

    async getUsage(userId: string) {
        return UserUsage.findOne({ userId });
    }
} 