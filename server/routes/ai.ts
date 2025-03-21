import express, { Response, RequestHandler, Request, Router } from 'express';
import OpenAI from 'openai';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { UserUsage } from '../models/UserUsage';
import { CacheService } from '../services/cache.service';
import { CostMonitorService } from '../services/cost-monitor.service';
import { EmailService } from '../services/email.service';
import { OpenAIService } from '../services/openai.service';
import { UsageService } from '../services/usage.service';
import { StripeService } from '../services/stripe.service';
import { AuthenticatedRequest, withAuth } from '../middleware/auth';
import * as admin from 'firebase-admin';

// ES Module path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const router = Router();
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

// Initialize base services
const cacheService = new CacheService();
const emailService = new EmailService();
const openAIService = new OpenAIService();
const stripeService = new StripeService();
const usageService = new UsageService(stripeService);
const costMonitorService = new CostMonitorService(emailService);

// Set default values for rate limiting in development mode
if (isDevelopment) {
    if (!process.env.RATE_LIMIT_WINDOW_MS) {
        process.env.RATE_LIMIT_WINDOW_MS = '900000';  // 15 minutes in milliseconds
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

// Protected route for AI generation
router.post('/chat', withAuth(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        if (!req.auth) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
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
            res.status(403).json({ 
                error: 'AI request limit exceeded',
                limit: userUsage.aiRequestLimit,
                used: userUsage.aiRequests.count
            });
            return;
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
router.get('/usage', withAuth(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        if (!req.auth) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const userId = req.auth.userId;
        
        // Get Firebase user claims for subscription status
        const userRecord = await admin.auth().getUser(userId);
        const claims = userRecord.customClaims || {};
        
        const [costUsage, featureUsage] = await Promise.all([
            costMonitorService.getUsage(userId),
            usageService.getUserLimits(userId)
        ]);

        res.json({ 
            costUsage,
            featureUsage,
            subscription: {
                status: claims.subscriptionStatus || 'inactive',
                premium: claims.premium || false,
                endDate: claims.subscriptionEnd
            }
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