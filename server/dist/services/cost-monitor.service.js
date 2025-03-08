"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CostMonitorService = void 0;
const UserUsage_1 = require("../models/UserUsage");
class CostMonitorService {
    constructor(emailService) {
        this.COST_PER_1K_INPUT_TOKENS = 0.0005;
        this.COST_PER_1K_OUTPUT_TOKENS = 0.0015;
        this.DAILY_COST_THRESHOLD = 10; // $10
        this.HOURLY_COST_THRESHOLD = 2; // $2
        this.emailService = emailService;
    }
    calculateCost(inputTokens, outputTokens) {
        const inputCost = (inputTokens / 1000) * this.COST_PER_1K_INPUT_TOKENS;
        const outputCost = (outputTokens / 1000) * this.COST_PER_1K_OUTPUT_TOKENS;
        return inputCost + outputCost;
    }
    async checkDailyCosts() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const usage = await UserUsage_1.UserUsage.aggregate([
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
    async checkHourlyCosts() {
        const oneHourAgo = new Date();
        oneHourAgo.setHours(oneHourAgo.getHours() - 1);
        const usage = await UserUsage_1.UserUsage.aggregate([
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
    async getCostProjection() {
        const now = new Date();
        const today = new Date(now.setHours(0, 0, 0, 0));
        const oneHourAgo = new Date(now.setHours(now.getHours() - 1));
        const [dailyUsage, hourlyUsage] = await Promise.all([
            UserUsage_1.UserUsage.aggregate([
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
            UserUsage_1.UserUsage.aggregate([
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
    async logUsage(data) {
        const usage = await UserUsage_1.UserUsage.findOneAndUpdate({ userId: data.userId }, {
            $inc: { count: data.amount },
            $set: { lastRequest: new Date() }
        }, { upsert: true, new: true });
        if (usage.count >= parseInt(process.env.DAILY_USER_LIMIT || '100')) {
            await this.emailService.sendUsageAlert(data.userId, usage.count, parseInt(process.env.DAILY_USER_LIMIT || '100'));
        }
    }
    async getUsage(userId) {
        return UserUsage_1.UserUsage.findOne({ userId });
    }
}
exports.CostMonitorService = CostMonitorService;
