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
const openai_service_1 = require("../services/openai.service");
const usage_service_1 = require("../services/usage.service");
const stripe_service_1 = require("../services/stripe.service");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const cacheService = new cache_service_1.CacheService();
const emailService = new email_service_1.EmailService();
const openAIService = new openai_service_1.OpenAIService();
const costMonitorService = new cost_monitor_service_1.CostMonitorService(emailService);
// Check for required Stripe environment variables
const hasStripeConfig = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID;
if (!hasStripeConfig) {
    console.warn('⚠️ Missing Stripe configuration. Using mock Stripe service in development mode.');
    // Use dummy values in development
    const dummyKey = 'sk_test_dummy';
    const dummyPriceId = 'price_dummy';
    const stripeService = new stripe_service_1.StripeService(process.env.STRIPE_SECRET_KEY || dummyKey, process.env.STRIPE_PRICE_ID || dummyPriceId);
    var usageService = new usage_service_1.UsageService(stripeService);
}
else {
    const stripeService = new stripe_service_1.StripeService(process.env.STRIPE_SECRET_KEY, process.env.STRIPE_PRICE_ID);
    var usageService = new usage_service_1.UsageService(stripeService);
}
// Set default values for rate limiting in development mode
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
if (isDevelopment) {
    if (!process.env.RATE_LIMIT_WINDOW_MS) {
        process.env.RATE_LIMIT_WINDOW_MS = '900000'; // 15 minutes in milliseconds
        console.log('Using default RATE_LIMIT_WINDOW_MS:', process.env.RATE_LIMIT_WINDOW_MS);
    }
    if (!process.env.RATE_LIMIT_MAX_REQUESTS) {
        process.env.RATE_LIMIT_MAX_REQUESTS = '100';
        console.log('Using default RATE_LIMIT_MAX_REQUESTS:', process.env.RATE_LIMIT_MAX_REQUESTS);
    }
    if (!process.env.DAILY_USER_LIMIT) {
        process.env.DAILY_USER_LIMIT = '50';
        console.log('Using default DAILY_USER_LIMIT:', process.env.DAILY_USER_LIMIT);
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
    apiKey: process.env.OPENAI_API_KEY || 'sk-mock-key-for-development'
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
// Protected route for AI generation
router.post('/chat', auth_1.authenticateUser, (req, res) => {
    // Check auth before proceeding
    if (!req.auth?.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = req.auth.userId;
    // Wrap in async function to use await
    (async () => {
        try {
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
    })();
});
// Get user's AI usage statistics
router.get('/usage', auth_1.authenticateUser, (req, res) => {
    // Check auth before proceeding
    if (!req.auth?.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = req.auth.userId;
    // Wrap in async function to use await
    (async () => {
        try {
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
    })();
});
exports.default = router;
//# sourceMappingURL=ai.js.map