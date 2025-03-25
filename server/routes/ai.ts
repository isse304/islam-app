// @ts-nocheck
import express from 'express';
import OpenAI from 'openai';
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
import { withAuth } from '../middleware/auth';
import * as admin from 'firebase-admin';
import { SpiritualContentService } from '../services/spiritual-content.service';
import { promises as fs } from 'fs';
import { join } from 'path';

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
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

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
    windowMs: 900000, // 15 minutes in milliseconds
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});

// Apply rate limiting to all routes
router.use(limiter);

// Initialize OpenAI with explicit API key
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Add this after other const declarations
const DUA_INSIGHTS_PATH = join(__dirname, '../data/dua-insights.json');

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

// Protected route for AI generation
router.post('/chat', withAuth, async (req, res) => {
    try {
        if (!req.auth) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const userId = req.auth.userId;
        if (!userId) {
            res.status(401).json({ success: false, error: 'User ID not found' });
            return;
        }
        
        // Get or create user usage record
        let userUsage;
        try {
            userUsage = await UserUsage.findOne({ userId });
            if (!userUsage) {
                userUsage = await UserUsage.create({
                    userId,
                    status: 'premium',
                    aiRequests: {
                        count: 0,
                        lastRequest: new Date()
                    },
                    aiRequestLimit: parseInt(process.env.DAILY_USER_LIMIT || '50')
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
        } catch (error) {
            console.error('Error managing user usage:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to manage user usage'
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

        res.json({ 
            success: true,
            response: response.choices[0].message.content 
        });
    } catch (error) {
        console.error('Error in AI chat:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Protected route for AI generation
router.post('/generate', withAuth(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        if (!req.auth) {
            res.status(401).json({ success: false, error: 'Unauthorized' });
            return;
        }

        const userId = req.auth.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: 'User ID not found' });
            return;
        }

        const { prompt, systemMessage, temperature = 0.7, maxTokens = 1000 } = req.body;

        // Create messages array
        const messages: ChatCompletionMessageParam[] = [];
        if (systemMessage) {
            messages.push({ role: 'system', content: systemMessage });
        }
        messages.push({ role: 'user', content: prompt });

        // Use GPT-3.5-turbo for general AI requests
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages,
            temperature,
            max_tokens: maxTokens
        });

        // Extract the response
        const content = completion.choices[0]?.message?.content;

        if (!content) {
            throw new Error('No response from OpenAI');
        }
        
        // Get or create user usage record
        let userUsage;
        try {
            userUsage = await UserUsage.findOne({ userId });
            if (!userUsage) {
                userUsage = await UserUsage.create({
                    userId,
                    status: 'premium',
                    aiRequests: {
                        count: 0,
                        lastRequest: new Date()
                    },
                    aiRequestLimit: parseInt(process.env.DAILY_USER_LIMIT || '50')
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
        } catch (error) {
            console.error('Error managing user usage:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to manage user usage'
            });
            return;
        }

        // Increment AI request count
        await userUsage.incrementAIRequestCount();

        res.json({ 
            success: true,
            content 
        });
    } catch (error) {
        console.error('Error in AI generate:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
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

// Dua Insights endpoint
router.post('/dua/insights', withAuth(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

// Emotional Dua Search endpoint
router.post('/dua/emotional-search', withAuth(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        if (!req.auth) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { emotion, context } = req.body;
        
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
            console.error('Raw content:', content);
            throw new Error('Failed to parse AI response');
        }
    } catch (error) {
        console.error('Error in emotional dua search:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to process emotional dua search',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

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

// Tafsir Chat endpoint
router.post('/tafsir/chat', withAuth(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        if (!req.auth) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { surah, verse, question } = req.body;

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
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: prompt.systemMessage },
                { role: 'user', content: prompt.userMessage }
            ],
            temperature: 0.7,
            max_tokens: 4000
        });

        const response = completion.choices[0]?.message?.content || '';
        res.json({ success: true, content: response });
    } catch (error) {
        console.error('Error in tafsir chat:', error);
        res.status(500).json({ success: false, error: 'Failed to generate tafsir response' });
    }
}));

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

export = router; 