import express, { Response, RequestHandler, Request, NextFunction } from 'express';
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
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireAuth } from '@clerk/express';

const router = Router();
const cacheService = new CacheService();
const emailService = new EmailService();
const openAIService = new OpenAIService();
const costMonitorService = new CostMonitorService(emailService);

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

// Middleware to ensure request is authenticated
const ensureAuthenticated = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (!req.auth?.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

router.use(ensureAuthenticated);

// Protected route for AI generation
router.post('/chat', async (req: Request, res: Response) => {
    try {
        if (!req.auth?.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Your existing code here
        const response = await openAIService.generateResponse(req.body.message);
        return res.json(response);
    } catch (error) {
        console.error('Error in AI chat:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user's AI usage statistics
router.get('/usage', ClerkExpressRequireAuth(), ((async (req: RequireAuthProp<express.Request>, res: Response) => {
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
    } catch (error) {
        console.error('Usage stats error:', error);
        res.status(500).json({
            error: 'Failed to fetch usage statistics',
            message: 'An error occurred while fetching usage statistics'
        });
    }
}) as unknown) as RequestHandler);

export default router; 