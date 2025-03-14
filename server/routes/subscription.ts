import express, { Request, Response } from 'express';
import { StripeService } from '../services/stripe.service';
import { authenticateUser } from '../middleware/auth';
import Stripe from 'stripe';

const router = express.Router();

// Skip creating actual Stripe service in development mode if key is not set
const isDevMode = process.env.NODE_ENV === 'development';
console.log(`Subscription router initializing in ${isDevMode ? 'development' : 'production'} mode`);

// Create Stripe service only if keys are available, otherwise use mock
let stripeService: StripeService;

try {
    if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID) {
        console.log('Initializing Stripe service with actual keys');
        stripeService = new StripeService(
            process.env.STRIPE_SECRET_KEY,
            process.env.STRIPE_PRICE_ID
        );
    } else if (isDevMode) {
        // In development, create a mock service that acts like the real one
        console.log('Creating mock Stripe service for development (no actual Stripe keys)');
        
        // Define a mock service object directly rather than casting
        const mockService = {
            createCheckoutSession: async (userId: string) => {
                console.log(`[MOCK] Created checkout for user ${userId}`);
                return `${process.env.CLIENT_URL || 'http://localhost:4200'}/subscription/mock-success`;
            },
            handleWebhook: async (event: any) => {
                console.log(`[MOCK] Handling webhook event: ${event.type}`);
            },
            getSubscriptionStatus: async (userId: string) => {
                console.log(`[MOCK] Returning mock subscription status for ${userId}`);
                return {
                    status: 'active',
                    plan: 'premium',
                    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
                };
            },
            isDevMode: true
        };
        
        stripeService = mockService as any;
    } else {
        console.warn('Stripe service not initialized: missing STRIPE_SECRET_KEY or STRIPE_PRICE_ID');
    }
} catch (error) {
    console.error('Error initializing Stripe service:', error);
}

type RequestHandler = express.RequestHandler;

// Create a checkout session for subscription
router.post('/create-checkout', 
    authenticateUser,
    ((req: Request, res: Response) => {
        try {
            const userId = req.auth?.userId;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            
            // Ensure we have stripe service
            if (!stripeService) {
                // Provide a better fallback in development mode
                if (isDevMode) {
                    console.log('[DEV] Returning mock checkout session without Stripe service');
                    
                    // OPTIMIZATION: Auto-activate trial status in development
                    try {
                        // Update the user's preferences with trial status to unlock features
                        // This simulates what would happen after successful checkout
                        const UserUsageModel = require('../models/UserUsage').UserUsage;
                        UserUsageModel.findOneAndUpdate(
                            { userId },
                            { 
                                userId,
                                status: 'trialing',
                                trialEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
                            },
                            { upsert: true, new: true }
                        ).then((_: any) => {
                            console.log(`[DEV] Updated user ${userId} with trial status`);
                        }).catch((error: any) => {
                            console.error(`[DEV] Error updating trial status:`, error);
                        });
                    } catch (error: any) {
                        console.error('[DEV] Error setting up mock trial:', error);
                    }
                    
                    return res.json({ 
                        url: `${process.env.CLIENT_URL || 'http://localhost:4200'}/subscription/mock-success?dev=true&trial=activated`,
                        trialActivated: true
                    });
                }
                
                return res.status(503).json({ 
                    error: 'Subscription service unavailable',
                    message: 'Stripe service is not configured properly. This is expected in development without proper keys.'
                });
            }
            
            return stripeService.createCheckoutSession(userId)
                .then(session => res.json({ url: session }))
                .catch(error => {
                    console.error('Error creating checkout session:', error);
                    
                    // In development mode, provide a fallback response
                    if (isDevMode) {
                        console.log('[DEV] Providing fallback checkout URL after error');
                        return res.json({ 
                            url: `${process.env.CLIENT_URL || 'http://localhost:4200'}/subscription/mock-success?error=true&dev=true`,
                            devFallback: true
                        });
                    }
                    
                    res.status(500).json({ error: 'Failed to create checkout session' });
                });
        } catch (error) {
            console.error('Unexpected error in create-checkout route:', error);
            
            // In development mode, provide a fallback response
            if (isDevMode) {
                return res.json({ 
                    url: `${process.env.CLIENT_URL || 'http://localhost:4200'}/subscription/mock-success?unexpectedError=true&dev=true`,
                    devFallback: true
                });
            }
            
            res.status(500).json({ error: 'Internal server error' });
        }
    }) as RequestHandler
);

// Handle Stripe webhooks
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        // Skip webhook processing if stripe service is not available
        if (!stripeService) {
            return res.status(503).json({ 
                error: 'Webhook processing unavailable',
                message: 'Stripe service is not configured properly'
            });
        }
        
        const sig = req.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!sig || !webhookSecret) {
            return res.status(400).json({ error: 'Missing signature or webhook secret' });
        }

        try {
            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
                apiVersion: '2023-10-16'
            });
            const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
            
            await stripeService.handleWebhook(event);
            res.json({ received: true });
        } catch (error) {
            console.error('Webhook error:', error);
            res.status(400).json({ error: 'Webhook error' });
        }
    } catch (error) {
        console.error('Unexpected error in webhook route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get subscription status
router.get('/status', 
    authenticateUser,
    ((req: Request, res: Response) => {
        try {
            const userId = req.auth?.userId;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            
            // Ensure we have stripe service
            if (!stripeService) {
                // In development mode without keys, return mock premium status
                if (isDevMode) {
                    console.log('[DEV] Returning mock subscription status without Stripe service');
                    return res.json({
                        status: 'active',
                        plan: 'premium',
                        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                        devFallback: true
                    });
                }
                
                return res.status(503).json({ 
                    error: 'Subscription service unavailable',
                    message: 'Stripe service is not configured properly'
                });
            }
            
            return stripeService.getSubscriptionStatus(userId)
                .then(status => res.json(status))
                .catch(error => {
                    console.error('Error getting subscription status:', error);
                    
                    // In development mode, provide a fallback status
                    if (isDevMode) {
                        console.log('[DEV] Providing fallback subscription status after error');
                        return res.json({
                            status: 'active',
                            plan: 'premium',
                            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                            devFallback: true
                        });
                    }
                    
                    res.status(500).json({ error: 'Failed to get subscription status' });
                });
        } catch (error) {
            console.error('Unexpected error in status route:', error);
            
            // In development mode, provide a fallback status
            if (isDevMode) {
                return res.json({
                    status: 'active',
                    plan: 'premium',
                    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                    devFallback: true,
                    error: 'Caught unexpected error but provided fallback'
                });
            }
            
            res.status(500).json({ error: 'Internal server error' });
        }
    }) as RequestHandler
);

export default router; 