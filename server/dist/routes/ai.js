"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const openai_1 = __importDefault(require("openai"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const UserUsage_1 = require("../models/UserUsage");
const cache_service_1 = require("../services/cache.service");
const cost_monitor_service_1 = require("../services/cost-monitor.service");
const email_service_1 = require("../services/email.service");
const clerk_sdk_node_1 = require("@clerk/clerk-sdk-node");
const openai_service_1 = require("../services/openai.service");
const usage_service_1 = require("../services/usage.service");
const stripe_service_1 = require("../services/stripe.service");
const router = (0, express_1.Router)();
const cacheService = new cache_service_1.CacheService();
const emailService = new email_service_1.EmailService();
const openAIService = new openai_service_1.OpenAIService();
const costMonitorService = new cost_monitor_service_1.CostMonitorService(emailService);
const stripeService = new stripe_service_1.StripeService(process.env.STRIPE_SECRET_KEY, process.env.STRIPE_PRICE_ID);
const usageService = new usage_service_1.UsageService(stripeService);
// Validate required environment variables
const requiredEnvVars = [
    'OPENAI_API_KEY',
    'RATE_LIMIT_WINDOW_MS',
    'RATE_LIMIT_MAX_REQUESTS',
    'DAILY_USER_LIMIT',
    'MONGODB_URI',
    'STRIPE_SECRET_KEY',
    'STRIPE_PRICE_ID'
];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
    }
}
// Rate limiting configuration
const limiter = (0, express_rate_limit_1.default)({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    message: 'Too many requests from this IP, please try again later.'
});
// Apply rate limiting to all routes
router.use(limiter);
// Initialize OpenAI with explicit API key
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY
});
// Helper function to estimate tokens
function estimateTokens(text) {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
}
// Generate cache key from request parameters
function generateCacheKey(systemMessage, userMessage, temperature, maxTokens) {
    return `ai:${systemMessage}:${userMessage}:${temperature}:${maxTokens}`;
}
// Reset daily usage for all users
async function resetDailyUsage() {
    const now = new Date();
    await UserUsage_1.UserUsage.updateMany({ lastReset: { $lt: new Date(now.setHours(0, 0, 0, 0)) } }, {
        $set: {
            count: 0,
            totalTokens: 0,
            lastReset: new Date()
        }
    });
}
// Run reset every day at midnight
setInterval(resetDailyUsage, 24 * 60 * 60 * 1000);
// Run cost monitoring every hour
setInterval(() => costMonitorService.checkHourlyCosts(), 60 * 60 * 1000);
setInterval(() => costMonitorService.checkDailyCosts(), 24 * 60 * 60 * 1000);
// Wrapper for Clerk-authenticated routes
const withAuth = (handler) => async (req, res) => {
    const clerkReq = req;
    return handler(clerkReq, res);
};
// Protected route for AI generation
router.post('/chat', (0, clerk_sdk_node_1.ClerkExpressRequireAuth)(), withAuth(async (req, res) => {
    try {
        if (!req.auth?.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const userId = req.auth.userId;
        // Get or create user usage record
        let userUsage = await UserUsage_1.UserUsage.findOne({ userId });
        if (!userUsage) {
            userUsage = new UserUsage_1.UserUsage({ userId });
            await userUsage.save();
        }
        // Check if user has exceeded their AI request limit
        if (!await userUsage.canMakeAIRequest()) {
            return res.status(403).json({
                error: 'AI request limit exceeded',
                limit: userUsage.aiRequestLimit,
                used: userUsage.aiRequests.count
            });
        }
        // Process AI request here
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: req.body.message }]
        });
        // Increment AI request count
        await userUsage.incrementAIRequestCount();
        res.json({ response: response.choices[0].message.content });
    }
    catch (error) {
        console.error('Error in AI chat:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
// Get user's AI usage statistics
router.get('/usage', (0, clerk_sdk_node_1.ClerkExpressRequireAuth)(), withAuth(async (req, res) => {
    try {
        if (!req.auth?.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const userId = req.auth.userId;
        const [costUsage, featureUsage] = await Promise.all([
            costMonitorService.getUsage(userId),
            usageService.getUserLimits(userId)
        ]);
        res.json({
            costUsage,
            featureUsage
        });
    }
    catch (error) {
        console.error('Usage stats error:', error);
        res.status(500).json({
            error: 'Failed to fetch usage statistics',
            message: 'An error occurred while fetching usage statistics'
        });
    }
}));
exports.default = router;
//# sourceMappingURL=ai.js.map