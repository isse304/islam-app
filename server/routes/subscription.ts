import express, { Request, Response } from 'express';
import { StripeService } from '../services/stripe.service';
import { withAuth, AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();
const stripeService = new StripeService();

// Create checkout session
router.post('/create-checkout', withAuth(async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.auth) {
      console.error('No auth data in request');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.auth.userId;
    console.log('Creating checkout session for user:', userId);
    
    const session = await stripeService.createCheckoutSession(userId);
    console.log('Checkout session created:', session.id);

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
}));

// Handle webhook events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  try {
    const event = await stripeService.constructWebhookEvent(req);
    await stripeService.handleWebhookEvent(event);
    res.json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(400).json({ error: 'Webhook error' });
  }
});

// Get subscription status
router.get('/status', withAuth(async (req: AuthenticatedRequest, res: Response) => {
  console.log('Subscription status request received');
  try {
    if (!req.auth) {
      console.error('No auth data in request');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.auth.userId;
    console.log('Getting subscription status for user:', userId);
    
    const status = await stripeService.getSubscriptionStatus(userId);
    console.log('Subscription status retrieved:', status);

    res.json({
      success: true,
      status: status || 'inactive',
      plan: status === 'active' ? 'premium' : 'free',
      features: {
        aiChat: status === 'active',
        tafsirAccess: status === 'active',
        wordByWord: status === 'active'
      }
    });
  } catch (error) {
    console.error('Error getting subscription status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription status'
    });
  }
}));

export default router; 