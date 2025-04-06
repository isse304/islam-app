// @ts-nocheck
import express, { Response, Request, NextFunction } from 'express';
import { OpenAI } from 'openai';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { UserUsage } from '../models/UserUsage';
import { CacheService } from '../services/cache.service';
import { CostMonitorService } from '../services/cost-monitor.service';
import { EmailService } from '../services/email.service';
import { OpenAIService } from '../services/openai.service';
import { UsageService } from '../services/usage.service';
import { StripeService } from '../services/stripe.service';
import { withAuth, withPremium, AuthenticatedRequest } from '../middleware/auth';
import * as admin from 'firebase-admin';
import { SpiritualContentService } from '../services/spiritual-content.service';
import { promises as fs } from 'fs';
import { join } from 'path';
import { body, validationResult } from 'express-validator';
import NodeCache from 'node-cache';

// Type definitions
type AuthRequest = express.Request & {
    auth?: {
        userId: string;
        email?: string;
        decodedToken?: any;
    };
};

type ChatMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

// Load environment variables
dotenv.config();

const router = express.Router();
// Use bracket notation for process.env access
const isDevelopment = process.env['NODE_ENV'] === 'development' || !process.env['NODE_ENV'];

// Initialize base services
const cacheService = new CacheService();
const emailService = new EmailService();
const openAIService = new OpenAIService();
const stripeService = new StripeService();
const usageService = new UsageService(stripeService);
const costMonitorService = new CostMonitorService(emailService);
const spiritualContentService = new SpiritualContentService();

// Set default values for rate limiting in development mode
if (isDevelopment) {
    // Use bracket notation for process.env access
    if (!process.env['RATE_LIMIT_WINDOW_MS']) {
        process.env['RATE_LIMIT_WINDOW_MS'] = '900000';  // 15 minutes in milliseconds
        console.log('Using default RATE_LIMIT_WINDOW_MS:', process.env['RATE_LIMIT_WINDOW_MS']);
    }
    
    // Use bracket notation for process.env access
    if (!process.env['RATE_LIMIT_MAX_REQUESTS']) {
        process.env['RATE_LIMIT_MAX_REQUESTS'] = '100';
        console.log('Using default RATE_LIMIT_MAX_REQUESTS:', process.env['RATE_LIMIT_MAX_REQUESTS']);
    }
    
    // Use bracket notation for process.env access
    if (!process.env['DAILY_USER_LIMIT']) {
        process.env['DAILY_USER_LIMIT'] = '50';
        console.log('Using default DAILY_USER_LIMIT:', process.env['DAILY_USER_LIMIT']);
    }
}

// Rate limiting configuration
// Use bracket notation for process.env access
const limiter = rateLimit({
    windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000'), // Use default if env var not set
    max: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '100'),      // Use default if env var not set
    message: 'Too many requests from this IP, please try again later.'
});

// Apply rate limiting to all routes
// router.use(limiter); // REMOVED - Causing 429 on Tafsir chat

// Initialize OpenAI with API key from environment variable
// Use bracket notation for process.env access
const openai = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY']
});

// Add this after other const declarations
const DUA_INSIGHTS_PATH = join(__dirname, '../data/dua-insights.json');

// Helper middleware to handle validation results
const validateRequest = (req: Request, res: Response, next: express.NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

/**
 * Helper function to estimate tokens
 * @param {string} text - The input text to estimate tokens for
 * @returns {number} - Estimated number of tokens
 */
function estimateTokens(text) {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
}

/**
 * Generate cache key from request parameters
 * @param {string} systemMessage - The system message
 * @param {string} userMessage - The user message
 * @param {number} temperature - The temperature parameter
 * @param {number} maxTokens - The maximum tokens parameter
 * @returns {string} - The generated cache key
 */
function generateCacheKey(systemMessage, userMessage, temperature, maxTokens) {
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

// Validation rules for /chat endpoint
const chatValidationRules = [
  body('message').isString().notEmpty().withMessage('Message is required and must be a string.')
];

// Protected route for AI chat - requires auth and premium
router.post('/chat', 
  withPremium, 
  chatValidationRules, // Apply chat validation rules
  validateRequest,    // Handle validation results
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.auth!.uid;

        // Get or create user usage record
        let userUsage = await UserUsage.findOne({ userId });
        if (!userUsage) {
            userUsage = await UserUsage.create({
                userId,
                status: 'premium',
                aiRequests: {
                    count: 0,
                    lastRequest: new Date()
                },
                // Use bracket notation for process.env access
                aiRequestLimit: parseInt(process.env['DAILY_USER_LIMIT'] || '50')
            });
        }

        // Check if user has exceeded their AI request limit
        if (!await userUsage.canMakeAIRequest()) {
            res.status(403).json({ 
                success: false,
                error: 'AI request limit exceeded',
                limit: userUsage.aiRequestLimit,
                used: userUsage.aiRequests.count
            });
            return;
        }

        // Increment AI request count *before* the call
        await userUsage.incrementAIRequestCount();

        // Process AI request here
        // Note: Using req.body.message which was validated
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: req.body.message }] 
        });

        res.json({ 
            success: true,
            response: response.choices[0].message.content 
        });
    } catch (error) {
        console.error('Error in AI chat:', error);
        next(error);
    }
});

// Validation rules for /generate endpoint
const generateValidationRules = [
  body('prompt').isString().notEmpty().withMessage('Prompt is required and must be a string.'),
  body('systemMessage').optional().isString().withMessage('System message must be a string.'),
  body('temperature').optional().isFloat({ min: 0, max: 1 }).withMessage('Temperature must be a number between 0 and 1.'),
  body('maxTokens').optional().isInt({ min: 1 }).withMessage('Max tokens must be a positive integer.'),
];

// AI generate endpoint with validation and usage check
router.post('/generate', 
  withAuth, 
  withPremium, 
  generateValidationRules, // Apply validation rules
  validateRequest,       // Handle validation results
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.auth!.uid;
    const { prompt, systemMessage, temperature, maxTokens } = req.body;
    // console.log(`[AI Generate ${userId}] Received request:`, { prompt, systemMessage, temperature, maxTokens });

    try {
        // Validate user usage (this might be redundant if withPremium already checks limits)
        const userUsage = await usageService.getOrCreateUsage(userId);
        if (!await userUsage.canMakeAIRequest()) {
            return res.status(429).json({ error: 'Daily AI request limit reached.' });
        }

        // Increment usage BEFORE making the OpenAI call
        await usageService.incrementAIUsage(userId);
        // console.log(`[AI Generate ${userId}] Usage incremented.`);

        // Generate response using OpenAIService
        const aiResponse = await openAIService.generateResponseWithSettings(
            prompt,
            systemMessage,
            temperature,
            maxTokens
        );
        // console.log(`[AI Generate ${userId}] Response generated.`);

        res.json({ content: aiResponse });

    } catch (error: any) {
        console.error(`[AI Generate ${userId}] Error processing request:`, error);
        // Avoid double-counting if increment succeeded but OpenAI failed
        // Consider adding more sophisticated error handling/refund logic if needed
        next(error);
    }
});

// Protected route for generating spiritual content - requires auth and premium
router.post('/generate-spiritual-content', withPremium(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.auth!.uid;
        const { topic, tone, length } = req.body;

        // ... (rest of spiritual content generation logic) ...

        res.json({ success: true, content });

    } catch (error) {
        console.error('Error generating spiritual content:', error);
        next(error);
    }
}));

// Validation rules for /tafsir-chat endpoint
const tafsirChatValidationRules = [
  body('surah').isInt({ min: 1, max: 114 }).withMessage('Surah must be an integer between 1 and 114.'),
  body('verse').isInt({ min: 1 }).withMessage('Verse must be a positive integer.'),
  body('question').isString().notEmpty().withMessage('Question is required and must be a string.'),
  body('history').optional().isArray().withMessage('History must be an array if provided.')
];

// Protected route for Tafsir chat - requires auth and premium
router.post('/tafsir-chat',
  withPremium,
  tafsirChatValidationRules, // Apply tafsir validation rules
  validateRequest,         // Handle validation results
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.auth!.uid;
        const { surah, verse, question, history } = req.body;
        
        // ... (rest of tafsir chat logic) ...

        res.json({ success: true, answer: completion.choices[0].message.content });

    } catch (error) {
        console.error('Error in Tafsir chat:', error);
        next(error);
    }
});

// Route for Dua Insights (Premium)
router.get('/dua-insights/:duaName', withPremium(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const duaName = req.params.duaName;
        // ... (rest of dua insights logic) ...
        
        res.json({ success: true, insights });
    } catch (error) {
        console.error('Error fetching Dua insights:', error);
        next(error);
    }
}));

// Get user's AI usage statistics
router.get('/usage', withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = req.auth!.uid;
        
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
        next(error);
    }
}));

// Dua Insights endpoint
router.post('/dua/insights', withPremium(async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
        if (!req.auth?.uid) {
            res.write('data: ' + JSON.stringify({ 
                status: 'error',
                error: 'Unauthorized',
                details: 'User not authenticated'
            }) + '\n\n');
            res.end();
            return;
        }

        const { dua } = req.body;
        if (!dua) {
            res.write('data: ' + JSON.stringify({ 
                status: 'error',
                error: 'Bad Request',
                details: 'Dua data is required'
            }) + '\n\n');
            res.end();
            return;
        }

        // Generate cache key based on dua content
        const cacheKey = `dua_insights_v2:${dua.id || Buffer.from(dua.arabic).toString('base64')}`;
        
        try {
            // Try to get from cache first
            const cachedInsights = !req.query.refresh && await cacheService.get(cacheKey);
            if (cachedInsights) {
                console.log('✅ Cache hit for dua insights');
                
                // Validate and enrich cached content before sending
                const parsedContent = JSON.parse(cachedInsights);
                const enrichedContent = spiritualContentService.enrichContent({
                    ...parsedContent,
                    duaId: dua.id
                }, dua.translation);
                
                res.write('data: ' + JSON.stringify({ 
                    status: 'complete',
                    data: enrichedContent
                }) + '\n\n');
                res.end();
                return;
            }

            // Load pre-generated insights
            const insightsData = await fs.readFile(DUA_INSIGHTS_PATH, 'utf8');
            const allInsights = JSON.parse(insightsData);
            
            // Find matching insight
            const insight = allInsights.find((i: any) => 
                i.duaId === dua.id || 
                i.duaTitle === dua.title
            );

            if (insight) {
                // Cache the insight for future use
                await cacheService.set(cacheKey, JSON.stringify(insight), 86400);

                // Send the insight
                res.write('data: ' + JSON.stringify({ 
                    status: 'complete',
                    data: insight
                }) + '\n\n');
                res.end();
                return;
            }

            // If no insight found, send error
            res.write('data: ' + JSON.stringify({ 
                status: 'error',
                error: 'Not Found',
                details: 'No pre-generated insight found for this dua'
            }) + '\n\n');
            res.end();

        } catch (error) {
            console.error('Error loading insights:', error);
            res.write('data: ' + JSON.stringify({ 
                status: 'error',
                error: 'Internal Server Error',
                details: error instanceof Error ? error.message : 'Unknown error'
            }) + '\n\n');
            res.end();
        }
    } catch (error) {
        console.error('Error in dua insights endpoint:', error);
        res.write('data: ' + JSON.stringify({ 
            status: 'error',
            error: 'Internal Server Error',
            details: error instanceof Error ? error.message : 'Unknown error'
        }) + '\n\n');
        res.end();
    }
}));

// Validation rules for /dua/emotional-search endpoint
const duaSearchValidationRules = [
  body('emotion').isString().notEmpty().withMessage('Emotion is required and must be a string.'),
  body('context').optional().isString().withMessage('Context must be a string if provided.')
];

// Emotional Dua Search endpoint
router.post('/dua/emotional-search',
  withPremium,
  duaSearchValidationRules, // Apply validation rules
  validateRequest,        // Handle validation results
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        if (!req.auth) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { emotion, context } = req.body;
        
        // Validate AI usage
        const canMakeRequest = await usageService.validateAIRequest(req.auth.uid, 1000); // Approximate token count
        if (!canMakeRequest) {
            res.status(403).json({ 
                success: false, 
                error: 'Daily AI request limit reached. Please try again tomorrow or upgrade your plan.' 
            });
            return;
        }

        // Increment AI usage *before* the call
        await usageService.incrementAIUsage(req.auth.uid);

        // Get response from OpenAI
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { 
                    role: 'system', 
                    content: `You are a knowledgeable Islamic scholar specializing in emotional and spiritual guidance. 
                    When analyzing emotions, ensure your response:
                    1. Covers all appropriate emotions while filtering out inappropriate content
                    2. Provides detailed, actionable guidance
                    3. Includes specific references from Quran and authentic hadith
                    4. Offers practical, modern-day applications
                    
                    Respond ONLY with a valid JSON object in this exact format, with ALL fields populated:
                    {
                        "content": "Comprehensive explanation (minimum 200 words) of the emotion from Islamic perspective, including its psychological and spiritual dimensions",
                        "quranic_guidance": [
                            "At least 3 relevant Quranic verses with complete references and explanations",
                            "Each verse must include its relevance to the emotion"
                        ],
                        "prophetic_example": "Detailed account (minimum 150 words) of how Prophet Muhammad (peace be upon him) dealt with this emotion, with authentic hadith references",
                        "practical_steps": [
                            "Minimum 5 specific, actionable steps for managing this emotion",
                            "Each step should be detailed and implementable",
                            "Include both spiritual and practical aspects"
                        ],
                        "spiritual_advice": {
                            "understanding": "Detailed Islamic perspective on this emotion (minimum 150 words)",
                            "duas": [
                                "At least 3 specific duas with translations and references",
                                "Include when and how to recite them"
                            ],
                            "dhikr": [
                                "At least 3 specific dhikr recommendations",
                                "Include counts, timings, and benefits"
                            ],
                            "scholarly_guidance": [
                                "At least 3 quotes or teachings from renowned scholars",
                                "Include both classical and contemporary perspectives"
                            ],
                            "spiritual_remedies": [
                                "At least 5 specific spiritual practices",
                                "Include their benefits and implementation"
                            ]
                        },
                        "related_verses_hadith": {
                            "verses": [
                                {
                                    "reference": "Complete Surah:Verse reference",
                                    "translation": "Full English translation",
                                    "relevance": "Detailed explanation of relevance to the emotion"
                                }
                            ],
                            "hadith": [
                                {
                                    "text": "Complete hadith text in English",
                                    "source": "Full source reference (e.g., Sahih Bukhari 123)",
                                    "grade": "Authenticity grade",
                                    "relevance": "Detailed explanation of relevance to the emotion"
                                }
                            ]
                        },
                        "reflection_points": [
                            "At least 5 deep, thought-provoking points for personal reflection",
                            "Include questions for self-assessment",
                            "Include action items for personal growth"
                        ]
                    }`
                },
                { 
                    role: 'user', 
                    content: `Provide comprehensive Islamic guidance for someone experiencing: ${emotion}\nContext: ${context || ''}\nRespond ONLY with the JSON object, no other text.` 
                }
            ],
            temperature: 0.7,
            max_tokens: 2500
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
            throw new Error('No content in OpenAI response');
        }

        try {
            // Clean the response to ensure valid JSON
            const cleanedContent = content
                .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
                .replace(/\n/g, ' ')
                .replace(/\s+/g, ' ')
                .replace(/,\s*([}\]])/g, '$1')
                .trim();

            // Parse the JSON response from OpenAI
            const parsedResponse = JSON.parse(cleanedContent);
            
            // Validate response structure
            const requiredSections = [
                'content',
                'quranic_guidance',
                'prophetic_example',
                'practical_steps',
                'spiritual_advice',
                'related_verses_hadith',
                'reflection_points'
            ];

            const missingFields = requiredSections.filter(field => !parsedResponse[field]);
            if (missingFields.length > 0) {
                throw new Error(`Incomplete response: Missing ${missingFields.join(', ')}`);
            }

            res.json({
                success: true,
                ...parsedResponse
            });
        } catch (parseError) {
            console.error('Error parsing OpenAI response:', parseError);
            // Send raw content if parsing fails
            res.json({ success: true, raw_content: content, parse_error: parseError.message });
        }
    } catch (error: any) {
        console.error('Error generating emotional dua response:', error);
        next(error);
    }
});

// Helper functions for processing responses
function extractSection(sections: string[], header: string): string {
    const section = sections.find(s => s.toLowerCase().includes(header.toLowerCase()));
    if (!section) return '';
    
    return section
        .replace(header, '')
        .trim()
        .split('\n')
        .map(line => line.trim())
        .filter(line => line)
        .join('\n');
}

function extractBulletPoints(text: string): string[] {
    if (!text) return [];
    return text
        .split('\n')
        .map(line => line.replace(/^[•\-\*]\s*/, '').trim())
        .filter(line => line);
}

function extractVerses(text: string): string[] {
    if (!text) return [];
    const verses = text.match(/\[(.*?)\]/g) || [];
    return verses.map(verse => verse.replace(/[\[\]]/g, '').trim());
}

function processReferences(refs: any) {
    const results = [];
    
    // Process Quranic verses
    if (refs?.verses?.length) {
        for (const verse of refs.verses) {
            const parts = [];
            parts.push(`Reference: ${verse.reference}`);
            if (verse.arabic) parts.push(`Arabic: ${verse.arabic}`);
            if (verse.translation) parts.push(`Translation: ${verse.translation}`);
            if (verse.relevance) parts.push(`Relevance: ${verse.relevance}`);
            results.push(parts.join('\n'));
        }
    }
    
    // Process hadith
    if (refs?.hadith?.length) {
        for (const h of refs.hadith) {
            const parts = [];
            parts.push(`Reference: ${h.source} (${h.grade || 'Grade not specified'})`);
            if (h.arabic) parts.push(`Arabic: ${h.arabic}`);
            if (h.text) parts.push(`Text: ${h.text}`);
            if (h.relevance) parts.push(`Relevance: ${h.relevance}`);
            results.push(parts.join('\n'));
        }
    }
    
    return results;
}

// Add this before the endpoint handler
function formatRelatedContent(refs: { verses: any[], hadith: any[] }): string {
    let result = '';
    
    // Format verses
    if (refs?.verses?.length) {
        result += '**Quranic Verses:**\n\n';
        refs.verses.forEach((verse: any) => {
            result += `• **${verse.reference}**\n`;
            if (verse.translation) result += `  ${verse.translation}\n`;
            if (verse.relevance) result += `  - ${verse.relevance}\n`;
            result += '\n';
        });
    }
    
    // Format hadith
    if (refs?.hadith?.length) {
        result += '**Related Hadith:**\n\n';
        refs.hadith.forEach((h: any) => {
            result += `• **${h.source}** ${h.grade ? `(${h.grade})` : ''}\n`;
            if (h.text) result += `  ${h.text}\n`;
            if (h.relevance) result += `  - ${h.relevance}\n`;
            result += '\n';
        });
    }
    
    return result.trim();
}

// Tafsir Chat endpoint (likely the one actually used by frontend)
router.post('/tafsir/chat', 
  withPremium, 
  tafsirChatValidationRules, // Apply the validation rules
  validateRequest,         // Apply the validation result handler
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    // --- ADD LOGGING HERE ---
    console.log(`[DEBUG] Reached /api/tafsir/chat route handler at ${new Date().toISOString()} for user: ${req.auth?.uid}`);
    // ------------------------
    try {
        if (!req.auth) {
            console.log('[DEBUG] /api/tafsir/chat: Unauthorized - req.auth missing.'); // Added debug log
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // Use 'verse' here to match validation
        const { surah, verse, question } = req.body; 
        console.log(`[DEBUG] /api/tafsir/chat: Request details - Surah: ${surah}, Verse: ${verse}, User: ${req.auth.uid}`); // Added debug log

        // Validate AI usage
        console.log(`[DEBUG] /api/tafsir/chat: Checking usage for user ${req.auth.uid}...`); // Added debug log
        const canMakeRequest = await usageService.validateAIRequest(req.auth.uid, 1500); // Approximate token count
        console.log(`[DEBUG] /api/tafsir/chat: Usage check result for ${req.auth.uid}: ${canMakeRequest}`); // Added debug log
        
        if (!canMakeRequest) {
            console.log(`[DEBUG] /api/tafsir/chat: Usage limit exceeded for user ${req.auth.uid}.`); // Added debug log
            res.status(403).json({ 
                success: false, 
                error: 'Daily AI request limit reached. Please try again tomorrow or upgrade your plan.' 
            });
            return;
        }

        // Increment AI usage *before* the call
        console.log(`[DEBUG] /api/tafsir/chat: Incrementing usage for user ${req.auth.uid}...`); // Added debug log
        await usageService.incrementAIUsage(req.auth.uid);
        console.log(`[DEBUG] /api/tafsir/chat: Usage incremented for user ${req.auth.uid}.`); // Added debug log

        const prompt = {
            systemMessage: `You are a knowledgeable Islamic scholar specializing in Quranic tafsir. 
            Provide detailed, comprehensive explanations that include:
            1. The historical context of the verse
            2. The linguistic analysis of key terms
            3. The various scholarly interpretations
            4. Related verses and hadith
            5. Practical applications and lessons
            6. Modern relevance and implementation

            Format your response in a clear, structured manner with appropriate headings and citations.
            Always provide authentic sources for interpretations and hadith.`,
            userMessage: `Please provide a detailed tafsir explanation for Surah ${surah}, Verse ${verse} addressing this specific question: ${question}

            Include:
            - Multiple scholarly perspectives
            - Relevant historical context
            - Related verses and authentic hadith
            - Practical wisdom and implementation
            - Modern-day relevance and application`
        };

        // Use GPT-3.5-turbo-16k for more detailed responses
        console.log(`[DEBUG] /api/tafsir/chat: Calling OpenAI for user ${req.auth.uid}...`); // Added debug log
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: prompt.systemMessage },
                { role: 'user', content: prompt.userMessage }
            ],
            temperature: 0.7,
            max_tokens: 4000
        });
        console.log(`[DEBUG] /api/tafsir/chat: OpenAI call completed for user ${req.auth.uid}.`); // Added debug log

        const response = completion.choices[0]?.message?.content || '';
        
        res.json({ success: true, content: response });
    } catch (error) {
        console.error('[ERROR] /api/tafsir/chat:', error); // Enhanced error logging
        next(error);
    }
});

export default router; 