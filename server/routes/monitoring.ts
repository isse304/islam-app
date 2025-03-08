import express from 'express';
import { Router } from 'express';
import { UserUsage } from '../models/UserUsage';
import { CacheService } from '../services/cache.service';
import { CostMonitorService } from '../services/cost-monitor.service';
import { EmailService } from '../services/email.service';

const router = Router();
const cacheService = new CacheService();
const emailService = new EmailService();
const costMonitor = new CostMonitorService(emailService);

// Middleware to check if user is admin
const isAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
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
            UserUsage.aggregate([
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
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Get user-specific usage
router.get('/user/:userId', isAdmin, async (req, res) => {
    try {
        const usage = await UserUsage.findOne({ userId: req.params.userId });
        if (!usage) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(usage);
    } catch (error) {
        console.error('Error fetching user usage:', error);
        res.status(500).json({ error: 'Failed to fetch user usage' });
    }
});

// Get recent activity
router.get('/recent', isAdmin, async (req, res) => {
    try {
        const recent = await UserUsage.aggregate([
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
    } catch (error) {
        console.error('Error fetching recent activity:', error);
        res.status(500).json({ error: 'Failed to fetch recent activity' });
    }
});

// Get usage by time period
router.get('/period', isAdmin, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const start = new Date(startDate as string);
        const end = new Date(endDate as string);

        const usage = await UserUsage.aggregate([
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
    } catch (error) {
        console.error('Error fetching period usage:', error);
        res.status(500).json({ error: 'Failed to fetch period usage' });
    }
});

// Get cache statistics
router.get('/cache', isAdmin, async (req, res) => {
    try {
        const stats = await cacheService.getUsageStats();
        res.json(stats);
    } catch (error) {
        console.error('Error fetching cache stats:', error);
        res.status(500).json({ error: 'Failed to fetch cache statistics' });
    }
});

export default router; 