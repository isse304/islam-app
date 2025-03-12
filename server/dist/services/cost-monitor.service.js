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
    async checkHourlyCosts() {
        const oneHourAgo = new Date();
        oneHourAgo.setHours(oneHourAgo.getHours() - 1);
        const usage = await UserUsage_1.UserUsage.aggregate([
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
    async getCostProjection() {
        const now = new Date();
        const today = new Date(now.setHours(0, 0, 0, 0));
        const oneHourAgo = new Date(now.setHours(now.getHours() - 1));
        const [dailyUsage, hourlyUsage] = await Promise.all([
            UserUsage_1.UserUsage.aggregate([
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
            UserUsage_1.UserUsage.aggregate([
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
    async logUsage(data) {
        const usage = await UserUsage_1.UserUsage.findOneAndUpdate({ userId: data.userId }, {
            $inc: { 'aiRequests.count': data.amount },
            $set: { 'aiRequests.lastRequest': new Date() }
        }, { upsert: true, new: true });
        if (usage.aiRequests.count >= parseInt(process.env.DAILY_USER_LIMIT || '100')) {
            await this.emailService.sendUsageAlert(data.userId, usage.aiRequests.count, parseInt(process.env.DAILY_USER_LIMIT || '100'));
        }
    }
    async getUsage(userId) {
        return UserUsage_1.UserUsage.findOne({ userId });
    }
}
exports.CostMonitorService = CostMonitorService;
//# sourceMappingURL=cost-monitor.service.js.map