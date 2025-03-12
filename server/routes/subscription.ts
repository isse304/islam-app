import express, { Request, Response } from 'express';
import { StripeService } from '../services/stripe.service';
import { authenticateUser } from '../middleware/auth';
import Stripe from 'stripe';

const router = express.Router();
const stripeService = new StripeService(
    process.env.STRIPE_SECRET_KEY!,
    process.env.STRIPE_PRICE_ID!
);

type RequestHandler = express.RequestHandler;

// Create a checkout session for subscription
router.post('/create-checkout', 
    authenticateUser,
    ((req: Request, res: Response) => {
        const userId = req.auth?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return stripeService.createCheckoutSession(userId)
            .then(session => res.json({ url: session }))
            .catch(error => {
                console.error('Error creating checkout session:', error);
                res.status(500).json({ error: 'Failed to create checkout session' });
            });
    }) as RequestHandler
);

// Handle Stripe webhooks
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
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
});

// Get subscription status
router.get('/status', 
    authenticateUser,
    ((req: Request, res: Response) => {
        const userId = req.auth?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return stripeService.getSubscriptionStatus(userId)
            .then(status => res.json(status))
            .catch(error => {
                console.error('Error getting subscription status:', error);
                res.status(500).json({ error: 'Failed to get subscription status' });
            });
    }) as RequestHandler
);

export default router; 