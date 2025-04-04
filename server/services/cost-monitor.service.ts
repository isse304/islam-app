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
                    'aiRequests.lastRequest': { $gte: today }
                }
            },
            {
                $group: {
                    _id: null,
                    totalRequests: { $sum: '$aiRequests.count' }
                }
            }
        ]);

        if (usage.length > 0) {
            const { totalRequests } = usage[0];
            // Estimate tokens: average 100 input tokens and 300 output tokens per request
            const dailyCost = this.calculateCost(totalRequests * 100, totalRequests * 300);

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
                    'aiRequests.lastRequest': { $gte: oneHourAgo }
                }
            },
            {
                $group: {
                    _id: null,
                    totalRequests: { $sum: '$aiRequests.count' }
                }
            }
        ]);

        if (usage.length > 0) {
            const { totalRequests } = usage[0];
            // Estimate tokens: average 100 input tokens and 300 output tokens per request
            const hourlyCost = this.calculateCost(totalRequests * 100, totalRequests * 300);

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
                        'aiRequests.lastRequest': { $gte: today }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalRequests: { $sum: '$aiRequests.count' }
                    }
                }
            ]),
            UserUsage.aggregate([
                {
                    $match: {
                        'aiRequests.lastRequest': { $gte: oneHourAgo }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalRequests: { $sum: '$aiRequests.count' }
                    }
                }
            ])
        ]);

        const dailyRequests = dailyUsage.length > 0 ? dailyUsage[0].totalRequests : 0;
        const hourlyRequests = hourlyUsage.length > 0 ? hourlyUsage[0].totalRequests : 0;

        const dailyCost = this.calculateCost(dailyRequests * 100, dailyRequests * 300);
        const hourlyCost = this.calculateCost(hourlyRequests * 100, hourlyRequests * 300);
        const monthlyCost = dailyCost * 30; // Project based on daily average

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
                $inc: { 'aiRequests.count': data.amount },
                $set: { 'aiRequests.lastRequest': new Date() }
            },
            { upsert: true, new: true }
        );

        if (usage && usage.aiRequests.count >= parseInt(process.env['DAILY_USER_LIMIT'] || '100')) {
            await this.emailService.sendUsageAlert(data.userId, usage.aiRequests.count, parseInt(process.env['DAILY_USER_LIMIT'] || '100'));
        }
    }

    async getUsage(userId: string) {
        return UserUsage.findOne({ userId });
    }
} 