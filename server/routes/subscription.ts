import express, { Request, Response } from 'express';
import { StripeService } from '../services/stripe.service';
import { authenticateUser, withAuth } from '../middleware/auth';
import Stripe from 'stripe';
import * as admin from 'firebase-admin';
import { AuthenticatedRequest } from '../middleware/auth';

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
router.post('/create-checkout', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        // In development mode, return mock checkout URL
        const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
        if (isDevelopment) {
            console.log('Development mode: Returning mock checkout URL');
            const mockCheckoutUrl = `${process.env.CLIENT_URL || 'http://localhost:4200'}/subscription/mock-success`;
            res.json({ url: mockCheckoutUrl });
            return;
        }
        
        // Regular auth check for non-development environments
        if (!req.authData) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const userId = req.authData.userId;
        const userRecord = await admin.auth().getUser(userId);

        // Create checkout session
        const session = await stripeService.createCheckoutSession(userId);

        res.json({ url: session });
    } catch (error) {
        console.error('Checkout session creation error:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// Handle Stripe webhooks
router.post('/webhook', express.raw({ type: 'application/json' }) as RequestHandler, async (req: Request, res: Response): Promise<void> => {
    try {
        // Skip webhook processing if stripe service is not available
        if (!stripeService) {
            res.status(503).json({ 
                error: 'Webhook processing unavailable',
                message: 'Stripe service is not configured properly'
            });
            return;
        }
        
        const sig = req.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!sig || !webhookSecret) {
            res.status(400).json({ error: 'Missing signature or webhook secret' });
            return;
        }

        try {
            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
                apiVersion: '2022-11-15'  // Match type definitions
            });
            const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
            
            // Handle subscription events
            switch (event.type) {
                case 'customer.subscription.created':
                case 'customer.subscription.updated': {
                    const subscription = event.data.object as Stripe.Subscription;
                    const userId = subscription.metadata?.userId;
                    if (userId) {
                        await admin.auth().setCustomUserClaims(userId, {
                            subscriptionStatus: subscription.status,
                            premium: subscription.status === 'active',
                            subscriptionEnd: new Date(subscription.current_period_end * 1000).toISOString()
                        });
                    }
                    break;
                }
                case 'customer.subscription.deleted': {
                    const subscription = event.data.object as Stripe.Subscription;
                    const userId = subscription.metadata?.userId;
                    if (userId) {
                        await admin.auth().setCustomUserClaims(userId, {
                            subscriptionStatus: 'inactive',
                            premium: false,
                            subscriptionEnd: null
                        });
                    }
                    break;
                }
            }
            
            await stripeService.handleWebhook(event);
            res.json({ received: true });
            return;
        } catch (error) {
            console.error('Webhook error:', error);
            res.status(400).json({ error: 'Webhook error' });
            return;
        }
    } catch (error) {
        console.error('Unexpected error in webhook route:', error);
        res.status(500).json({ error: 'Internal server error' });
        return;
    }
});

// Get subscription status
router.get('/status', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        // In development mode, return mock subscription status
        const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
        if (isDevelopment) {
            console.log('Development mode: Returning mock subscription status');
            res.json({
                status: 'active',
                premium: true,
                endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
            });
            return;
        }
        
        // Regular auth check for non-development environments
        if (!req.authData) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const userId = req.authData.userId;
        const userRecord = await admin.auth().getUser(userId);
        const claims = userRecord.customClaims || {};

        // Check if subscription has expired
        if (claims.subscriptionEnd) {
            const subscriptionEnd = new Date(claims.subscriptionEnd);
            if (subscriptionEnd < new Date()) {
                // Reset claims if subscription has expired
                await admin.auth().setCustomUserClaims(userId, {
                    subscriptionStatus: 'inactive',
                    premium: false,
                    subscriptionEnd: null
                });
                claims.subscriptionStatus = 'inactive';
                claims.premium = false;
                claims.subscriptionEnd = null;
            }
        }

        res.json({
            status: claims.subscriptionStatus || 'inactive',
            premium: claims.premium || false,
            endDate: claims.subscriptionEnd
        });
    } catch (error) {
        console.error('Subscription status error:', error);
        res.status(500).json({ error: 'Failed to fetch subscription status' });
    }
});

export default router; 