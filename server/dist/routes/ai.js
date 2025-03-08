"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const openai_1 = __importDefault(require("openai"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const UserUsage_1 = require("../models/UserUsage");
const cache_service_1 = require("../services/cache.service");
const cost_monitor_service_1 = require("../services/cost-monitor.service");
const email_service_1 = require("../services/email.service");
const clerk_sdk_node_1 = require("@clerk/clerk-sdk-node");
const openai_service_1 = require("../services/openai.service");
// Ensure production environment variables are loaded
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../.env.production') });
const router = (0, express_1.Router)();
const cacheService = new cache_service_1.CacheService();
const emailService = new email_service_1.EmailService();
const openAIService = new openai_service_1.OpenAIService();
const costMonitorService = new cost_monitor_service_1.CostMonitorService(emailService);
// Validate required environment variables
const requiredEnvVars = [
    'OPENAI_API_KEY',
    'RATE_LIMIT_WINDOW_MS',
    'RATE_LIMIT_MAX_REQUESTS',
    'DAILY_USER_LIMIT',
    'MONGODB_URI'
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
// Protected route for AI generation
router.post('/generate', (0, clerk_sdk_node_1.ClerkExpressRequireAuth)(), (async (req, res) => {
    try {
        const { prompt } = req.body;
        const userId = req.auth.userId;
        if (!prompt) {
            return res.status(400).json({
                error: 'Missing prompt',
                message: 'A prompt is required for AI generation'
            });
        }
        if (!process.env.OPENAI_API_KEY) {
            console.error('OpenAI API key is not configured');
            return res.status(500).json({
                error: 'Configuration Error',
                message: 'OpenAI service is not properly configured'
            });
        }
        try {
            const response = await openAIService.generateResponse(prompt);
            res.json({ content: response });
        }
        catch (openAiError) {
            console.error('OpenAI service error:', openAiError);
            if (openAiError.status === 429) {
                return res.status(429).json({
                    error: 'Rate Limit Exceeded',
                    message: 'Too many requests. Please try again later.'
                });
            }
            if (openAiError.status === 401) {
                return res.status(500).json({
                    error: 'API Authentication Error',
                    message: 'Failed to authenticate with OpenAI service'
                });
            }
            throw openAiError; // Re-throw for general error handling
        }
    }
    catch (error) {
        console.error('AI generation error:', error);
        res.status(500).json({
            error: 'AI Generation Failed',
            message: error.message || 'An unexpected error occurred'
        });
    }
}));
// Get user's AI usage statistics
router.get('/usage', (0, clerk_sdk_node_1.ClerkExpressRequireAuth)(), (async (req, res) => {
    try {
        const userId = req.auth.userId;
        if (!userId) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'User ID not found in request'
            });
        }
        const usage = await costMonitorService.getUsage(userId);
        res.json({ usage });
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
