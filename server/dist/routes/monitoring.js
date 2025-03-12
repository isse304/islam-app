"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const UserUsage_1 = require("../models/UserUsage");
const cache_service_1 = require("../services/cache.service");
const cost_monitor_service_1 = require("../services/cost-monitor.service");
const email_service_1 = require("../services/email.service");
const router = (0, express_1.Router)();
const cacheService = new cache_service_1.CacheService();
const emailService = new email_service_1.EmailService();
const costMonitor = new cost_monitor_service_1.CostMonitorService(emailService);
// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
    const isAdminUser = req.headers['x-admin-token'] === process.env.ADMIN_TOKEN;
    if (!isAdminUser) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};
// Get overall usage statistics
router.get('/stats', isAdmin, async (req, res) => {
    try {
        const [usageStats, cacheStats, costProjection] = await Promise.all([
            UserUsage_1.UserUsage.aggregate([
                {
                    $group: {
                        _id: null,
                        totalUsers: { $sum: 1 },
                        totalRequests: { $sum: '$count' },
                        totalTokens: { $sum: '$totalTokens' },
                        averageRequestsPerUser: { $avg: '$count' },
                        averageTokensPerUser: { $avg: '$totalTokens' }
                    }
                }
            ]),
            cacheService.getUsageStats(),
            costMonitor.getCostProjection()
        ]);
        res.json({
            usage: usageStats[0] || {
                totalUsers: 0,
                totalRequests: 0,
                totalTokens: 0,
                averageRequestsPerUser: 0,
                averageTokensPerUser: 0
            },
            cache: cacheStats,
            costs: costProjection
        });
    }
    catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});
// Get user-specific usage
router.get('/user/:userId', isAdmin, async (req, res) => {
    try {
        const usage = await UserUsage_1.UserUsage.findOne({ userId: req.params.userId });
        if (!usage) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(usage);
    }
    catch (error) {
        console.error('Error fetching user usage:', error);
        res.status(500).json({ error: 'Failed to fetch user usage' });
    }
});
// Get recent activity
router.get('/recent', isAdmin, async (req, res) => {
    try {
        const recent = await UserUsage_1.UserUsage.aggregate([
            { $unwind: '$requests' },
            { $sort: { 'requests.timestamp': -1 } },
            { $limit: 100 },
            {
                $project: {
                    userId: 1,
                    timestamp: '$requests.timestamp',
                    tokens: '$requests.tokens',
                    systemMessage: '$requests.systemMessage',
                    userMessage: '$requests.userMessage'
                }
            }
        ]);
        res.json(recent);
    }
    catch (error) {
        console.error('Error fetching recent activity:', error);
        res.status(500).json({ error: 'Failed to fetch recent activity' });
    }
});
// Get usage by time period
router.get('/period', isAdmin, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const start = new Date(startDate);
        const end = new Date(endDate);
        const usage = await UserUsage_1.UserUsage.aggregate([
            { $unwind: '$requests' },
            {
                $match: {
                    'requests.timestamp': {
                        $gte: start,
                        $lte: end
                    }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$requests.timestamp' }
                    },
                    totalRequests: { $sum: 1 },
                    totalTokens: { $sum: '$requests.tokens' },
                    uniqueUsers: { $addToSet: '$userId' }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        res.json(usage);
    }
    catch (error) {
        console.error('Error fetching period usage:', error);
        res.status(500).json({ error: 'Failed to fetch period usage' });
    }
});
// Get cache statistics
router.get('/cache', isAdmin, async (req, res) => {
    try {
        const stats = await cacheService.getUsageStats();
        res.json(stats);
    }
    catch (error) {
        console.error('Error fetching cache stats:', error);
        res.status(500).json({ error: 'Failed to fetch cache statistics' });
    }
});
exports.default = router;
//# sourceMappingURL=monitoring.js.map