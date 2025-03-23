// @ts-nocheck
const express = require('express');
const OpenAI = require('openai');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');
const { UserUsage } = require('../models/UserUsage');
const { CacheService } = require('../services/cache.service');
const { CostMonitorService } = require('../services/cost-monitor.service');
const { EmailService } = require('../services/email.service');
const { OpenAIService } = require('../services/openai.service');
const { UsageService } = require('../services/usage.service');
const { StripeService } = require('../services/stripe.service');
const { withAuth } = require('../middleware/auth');
const admin = require('firebase-admin');

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
});

// Protected route for AI generation
router.post('/generate', withAuth(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        if (!req.auth) {
            res.status(401).json({ success: false, error: 'Unauthorized' });
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

        const userId = req.auth.userId;
        
        // Get or create user usage record
        let userUsage = await UserUsage.findOne({ userId });
        if (!userUsage) {
            userUsage = new UserUsage({ userId });
            await userUsage.save();
        }

        // Increment AI request count
        await userUsage.incrementAIRequestCount();

        res.json({
            success: true,
            content: content
        });
    } catch (error) {
        console.error('Error generating AI response:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate AI response'
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
    try {
        if (!req.auth?.userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { dua } = req.body;
        if (!dua) {
            res.status(400).json({ error: 'Dua data is required' });
            return;
        }

        const prompt = {
            systemMessage: `You are a knowledgeable Islamic scholar specializing in duas and their deeper meanings. 
            Analyze the following dua and provide comprehensive insights in this EXACT JSON format:
            {
              "key_insights": "[Detailed explanation of the dua's core meaning and significance]",
              "virtues_and_benefits": [
                "[List specific virtues with references]",
                "[Include both worldly and spiritual benefits]",
                "[Mention specific situations when this dua is especially beneficial]"
              ],
              "practical_application": [
                "[How to implement this dua in daily life]",
                "[Best times and situations to recite it]",
                "[Proper method of recitation]",
                "[How to maximize its benefits]"
              ],
              "historical_context": "[Detailed background about when and why this dua was revealed/taught]",
              "related_references": {
                "verses": [{
                  "reference": "Surah name, number:verse",
                  "translation": "Full English translation",
                  "relevance": "How this verse relates to the dua"
                }],
                "hadith": [{
                  "text": "Full hadith text in English",
                  "source": "Complete source reference",
                  "grade": "Authenticity grade"
                }]
              },
              "reflection_points": [
                "[Deep, thought-provoking questions about the dua's meaning]",
                "[Points for personal introspection]",
                "[Ways to connect this dua to one's life]"
              ],
              "spiritual_impact": [
                "[How this dua transforms one's relationship with Allah]",
                "[Emotional and spiritual growth it facilitates]",
                "[Long-term benefits of regular recitation]"
              ]
            }`,
            userMessage: `Please analyze this dua:
            
            Arabic: ${dua.arabic}
            Translation: ${dua.translation}
            Reference: ${dua.reference}
            
            Provide comprehensive insights following the specified JSON format.`,
            temperature: 0.4,
            maxTokens: 2000
        };

        // Use chat completion instead of generateCompletion
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: prompt.systemMessage },
                { role: 'user', content: prompt.userMessage }
            ],
            temperature: prompt.temperature,
            max_tokens: prompt.maxTokens
        });

        const openaiResponse = { content: completion.choices[0]?.message?.content || '' };
        let jsonResponse;
        
        try {
            // Clean up the response content
            const cleanContent = openaiResponse.content
                .replace(/\n/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            
            jsonResponse = JSON.parse(cleanContent);
        } catch (error) {
            console.error('Error parsing OpenAI response:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to parse AI response' 
            });
            return;
        }

        const response = {
            success: true,
            content: jsonResponse.key_insights || '',
            virtues: Array.isArray(jsonResponse.virtues_and_benefits)
                ? jsonResponse.virtues_and_benefits.join('\n')
                : typeof jsonResponse.virtues_and_benefits === 'string'
                    ? jsonResponse.virtues_and_benefits
                    : '',
            application: Array.isArray(jsonResponse.practical_application)
                ? jsonResponse.practical_application.join('\n')
                : typeof jsonResponse.practical_application === 'string'
                    ? jsonResponse.practical_application
                    : '',
            context: jsonResponse.historical_context || '',
            related: '',
            impact: Array.isArray(jsonResponse.spiritual_impact)
                ? jsonResponse.spiritual_impact.join('\n')
                : typeof jsonResponse.spiritual_impact === 'string'
                    ? jsonResponse.spiritual_impact
                    : '',
            explanation: jsonResponse.key_insights || '',
            historicalContext: jsonResponse.historical_context || '',
            reflectionPoints: Array.isArray(jsonResponse.reflection_points)
                ? jsonResponse.reflection_points
                : typeof jsonResponse.reflection_points === 'string'
                    ? [jsonResponse.reflection_points]
                    : [],
            modernApplication: Array.isArray(jsonResponse.practical_application)
                ? jsonResponse.practical_application.join('\n')
                : typeof jsonResponse.practical_application === 'string'
                    ? jsonResponse.practical_application
                    : '',
            relatedVerses: Array.isArray(jsonResponse.related_references?.verses)
                ? jsonResponse.related_references.verses
                    .map((v: { reference: string; translation: string }) => 
                        `${v.reference}: ${v.translation}`
                    )
                : []
        };

        res.json(response);
    } catch (error) {
        console.error('Error generating dua insights:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to generate insights',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
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
        
        // Extract and normalize emotions from text
        const extractEmotions = (text: string): string[] => {
            const emotionKeywords: { [key: string]: { synonyms: string[], noun: string } } = {
                'anxious': { synonyms: ['worried', 'nervous', 'stressed', 'uneasy', 'fearful', 'tense', 'restless', 'apprehensive', 'concerned'], noun: 'anxiety' },
                'sad': { synonyms: ['depressed', 'unhappy', 'down', 'blue', 'sorrowful', 'heartbroken', 'grief', 'melancholy', 'gloomy'], noun: 'sadness' },
                'angry': { synonyms: ['frustrated', 'mad', 'annoyed', 'irritated', 'furious', 'upset', 'outraged', 'enraged', 'hostile'], noun: 'anger' },
                'grateful': { synonyms: ['thankful', 'blessed', 'appreciative', 'content', 'satisfied', 'fulfilled', 'indebted', 'humbled'], noun: 'gratitude' },
                'hopeful': { synonyms: ['optimistic', 'positive', 'confident', 'assured', 'encouraged', 'inspired', 'motivated', 'eager'], noun: 'hope' },
                'scared': { synonyms: ['afraid', 'frightened', 'terrified', 'fearful', 'anxious', 'panicked', 'threatened', 'intimidated'], noun: 'fear' },
                'guilty': { synonyms: ['remorseful', 'regretful', 'ashamed', 'sorry', 'repentant', 'apologetic', 'conscience-stricken'], noun: 'guilt' },
                'confused': { synonyms: ['uncertain', 'unsure', 'lost', 'perplexed', 'doubtful', 'bewildered', 'puzzled', 'disoriented'], noun: 'confusion' },
                'lonely': { synonyms: ['isolated', 'alone', 'abandoned', 'disconnected', 'solitary', 'neglected', 'rejected'], noun: 'loneliness' },
                'peaceful': { synonyms: ['calm', 'serene', 'tranquil', 'relaxed', 'composed', 'at ease', 'content', 'harmonious'], noun: 'peace' },
                'weak': { synonyms: ['powerless', 'helpless', 'vulnerable', 'fragile', 'feeble', 'exhausted', 'drained'], noun: 'weakness' },
                'sleepy': { synonyms: ['tired', 'drowsy', 'exhausted', 'fatigued', 'weary', 'drained', 'lethargic'], noun: 'tiredness' },
                'depressed': { synonyms: ['depression', 'despair', 'hopeless', 'miserable', 'despondent', 'dejected'], noun: 'depression' }
            };

            const words = text.toLowerCase().split(/\W+/);
            const foundEmotions = new Set<string>();

            words.forEach(word => {
                // Check direct emotion matches and get noun form
                if (emotionKeywords[word]) {
                    foundEmotions.add(emotionKeywords[word].noun);
                }

                // Check synonyms and get noun form
                for (const [emotion, data] of Object.entries(emotionKeywords)) {
                    if (data.synonyms.includes(word)) {
                        foundEmotions.add(data.noun);
                    }
                }
            });

            // If no emotions found, use the original input as an emotion
            if (foundEmotions.size === 0 && emotion.trim()) {
                foundEmotions.add(emotion.trim());
            }

            return Array.from(foundEmotions);
        };

        const emotions = extractEmotions(emotion + ' ' + context);
        
        const prompt = {
            systemMessage: `You are a knowledgeable Islamic scholar specializing in emotional well-being and spiritual guidance through duas. 
            ${emotions.length > 1 ? 'The person is experiencing multiple emotions, so please address each one separately and then provide combined guidance.' : ''}
            
            Analyze the emotional state and provide guidance in this EXACT JSON format:
            {
                "understanding": "[Detailed explanation validating the emotion from an Islamic perspective]",
                "quranic_guidance": [
                    "[Relevant verse about dealing with this emotion]",
                    "[Include translation]",
                    "[Explanation of how it applies]"
                ],
                "prophetic_example": "[How the Prophet ﷺ dealt with similar emotions]",
                "recommended_duas": [
                    {
                        "translation": "[English translation]",
                        "virtue": "[Benefits of this dua]",
                        "source": "[Reference source]"
                    }
                ],
                "practical_steps": [
                    "[Immediate spiritual actions]",
                    "[Long-term emotional management]",
                    "[Ways to strengthen faith through this emotion]"
                ],
                "related_verses_hadith": {
                    "verses": [
                        {
                            "reference": "[Surah:Verse]",
                            "translation": "[English translation]",
                            "relevance": "[How this verse relates to the emotion]"
                        }
                    ],
                    "hadith": [
                        {
                            "text": "[Hadith text]",
                            "source": "[Source book]",
                            "grade": "[Authentication grade]",
                            "relevance": "[How this hadith relates to the emotion]"
                        }
                    ]
                }
            }`,
            userMessage: `A person is experiencing: ${emotions.join(' and ')}
            Context: ${context}
            
            Please provide comprehensive guidance addressing ${emotions.length > 1 ? 'each emotion separately and then combined guidance' : 'this emotion'}.
            
            Important: Ensure all sections are filled with detailed information, including understanding, quranic guidance, prophetic examples, practical steps, and related verses/hadith.`
        };

        // Get response from OpenAI
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo-16k',
            messages: [
                { role: 'system', content: prompt.systemMessage },
                { role: 'user', content: prompt.userMessage }
            ],
            temperature: 0.7,
            max_tokens: 4000
        });

        const content = completion.choices[0]?.message?.content || '';
        
        try {
            // Clean and sanitize the content before parsing
            const cleanedContent = content
                .replace(/[\n\r]/g, ' ')           // Replace newlines with spaces
                .replace(/\s+/g, ' ')              // Normalize spaces
                .replace(/\\\[/g, '[')             // Replace escaped brackets
                .replace(/\\\]/g, ']')             // Replace escaped brackets
                .replace(/\\"/g, '"')              // Replace escaped quotes
                .replace(/\\/g, '')                // Remove remaining backslashes
                .replace(/,\s*([}\]])/g, '$1')     // Remove trailing commas
                .replace(/([{\[,])\s*,/g, '$1')    // Remove empty elements
                .replace(/\]\s*\[/g, '],[')        // Fix array formatting
                .replace(/\}\s*\{/g, '},{')        // Fix object formatting
                .trim();

            // Add logging to help debug
            console.log('Cleaned content:', cleanedContent);

            let jsonResponse;
            try {
                // Parse the cleaned JSON
                jsonResponse = JSON.parse(cleanedContent);
            } catch (parseError) {
                console.error('JSON Parse Error:', parseError);
                console.error('Content causing error:', cleanedContent);
                
                try {
                    // Try to extract just the understanding field if full parsing fails
                    const understandingMatch = content.match(/"understanding"\s*:\s*"([^"]+)"/);
                    if (understandingMatch && understandingMatch[1]) {
                        res.json({
                            success: true,
                            content: understandingMatch[1],
                            virtues: '',
                            application: '',
                            context: understandingMatch[1],
                            related: '',
                            impact: '',
                            explanation: understandingMatch[1],
                            relatedVerses: [],
                            historicalContext: '',
                            reflectionPoints: [],
                            modernApplication: ''
                        });
                        return;
                    }
                } catch (secondError) {
                    // If still fails, send the raw content
                    res.json({
                        success: true,
                        content: content,
                        virtues: '',
                        application: '',
                        context: content,
                        related: '',
                        impact: '',
                        explanation: content,
                        relatedVerses: [],
                        historicalContext: '',
                        reflectionPoints: [],
                        modernApplication: ''
                    });
                    return;
                }
            }

            // Format the response
            const formatRelatedContent = (refs: any) => {
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
            };
            
            const formattedResponse = {
                success: true,
                content: jsonResponse.understanding || '',
                virtues: Array.isArray(jsonResponse.recommended_duas) 
                    ? jsonResponse.recommended_duas.map((d: any) => 
                        `${d.translation}\nVirtue: ${d.virtue}\nSource: ${d.source}`
                    ).join('\n\n') 
                    : '',
                application: Array.isArray(jsonResponse.practical_steps)
                    ? jsonResponse.practical_steps.join('\n')
                    : '',
                context: jsonResponse.understanding || '',
                related: formatRelatedContent(jsonResponse.related_verses_hadith),
                impact: jsonResponse.prophetic_example || '',
                explanation: jsonResponse.understanding || '',
                relatedVerses: jsonResponse.related_verses_hadith?.verses?.map((v: any) => 
                    `${v.reference}: ${v.translation || ''}`
                ) || [],
                historicalContext: jsonResponse.prophetic_example || '',
                reflectionPoints: Array.isArray(jsonResponse.practical_steps) 
                    ? jsonResponse.practical_steps 
                    : [],
                modernApplication: Array.isArray(jsonResponse.practical_steps)
                    ? jsonResponse.practical_steps.join('\n')
                    : ''
            };

            res.json(formattedResponse);
        } catch (parseError) {
            console.error('Error parsing JSON response:', parseError);
            // Fallback response if JSON parsing fails
            res.json({
                success: true,
                content: content,
                virtues: '',
                application: '',
                context: content,
                related: '',
                impact: '',
                explanation: content,
                relatedVerses: [],
                historicalContext: '',
                reflectionPoints: [],
                modernApplication: ''
            });
        }
    } catch (error) {
        console.error('Error in emotional dua search:', error);
        res.status(500).json({ success: false, error: 'Failed to process emotional dua search' });
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
            model: 'gpt-3.5-turbo-16k',
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

export = router; 