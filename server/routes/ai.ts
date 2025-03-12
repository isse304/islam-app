import express, { Response, RequestHandler } from 'express';
import { Router } from 'express';
import OpenAI from 'openai';
import rateLimit from 'express-rate-limit';
import { UserUsage } from '../models/UserUsage';
import { CacheService } from '../services/cache.service';
import { CostMonitorService } from '../services/cost-monitor.service';
import { EmailService } from '../services/email.service';
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';
import type { RequireAuthProp } from '@clerk/clerk-sdk-node';
import { OpenAIService } from '../services/openai.service';
import { UsageService } from '../services/usage.service';
import { StripeService } from '../services/stripe.service';

const router = Router();
const cacheService = new CacheService();
const emailService = new EmailService();
const openAIService = new OpenAIService();
const costMonitorService = new CostMonitorService(emailService);
const stripeService = new StripeService(process.env.STRIPE_SECRET_KEY!, process.env.STRIPE_PRICE_ID!);
const usageService = new UsageService(stripeService);

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
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    message: 'Too many requests from this IP, please try again later.'
});

// Apply rate limiting to all routes
router.use(limiter);

// Initialize OpenAI with explicit API key
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Helper function to estimate tokens
function estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
}

// Generate cache key from request parameters
function generateCacheKey(systemMessage: string, userMessage: string, temperature: number, maxTokens: number): string {
    return `ai:${systemMessage}:${userMessage}:${temperature}:${maxTokens}`;
}

// Reset daily usage for all users
async function resetDailyUsage() {
    const now = new Date();
    await UserUsage.updateMany(
        { lastReset: { $lt: new Date(now.setHours(0, 0, 0, 0)) } },
        {
            $set: {
                count: 0,
                totalTokens: 0,
                lastReset: new Date()
            }
        }
    );
}

// Run reset every day at midnight
setInterval(resetDailyUsage, 24 * 60 * 60 * 1000);

// Run cost monitoring every hour
setInterval(() => costMonitorService.checkHourlyCosts(), 60 * 60 * 1000);
setInterval(() => costMonitorService.checkDailyCosts(), 24 * 60 * 60 * 1000);

type ClerkRequest = RequireAuthProp<express.Request>;

// Wrapper for Clerk-authenticated routes
const withAuth = (handler: (req: ClerkRequest, res: express.Response) => Promise<any>): RequestHandler => 
    async (req: express.Request, res: express.Response) => {
        const clerkReq = req as ClerkRequest;
        return handler(clerkReq, res);
    };

// Protected route for AI generation
router.post('/chat', ClerkExpressRequireAuth(), withAuth(async (req, res) => {
    try {
        if (!req.auth?.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const userId = req.auth.userId;

        // Get or create user usage record
        let userUsage = await UserUsage.findOne({ userId });
        if (!userUsage) {
            userUsage = new UserUsage({ userId });
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
    } catch (error) {
        console.error('Error in AI chat:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));

// Get user's AI usage statistics
router.get('/usage', ClerkExpressRequireAuth(), withAuth(async (req, res) => {
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
    } catch (error) {
        console.error('Usage stats error:', error);
        res.status(500).json({
            error: 'Failed to fetch usage statistics',
            message: 'An error occurred while fetching usage statistics'
        });
    }
}));

export default router; 