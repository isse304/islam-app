import express, { Request, Response } from 'express';
import { StripeService } from '../services/stripe.service';
import { withAuth, AuthenticatedRequest } from '../middleware/auth';
import { auth } from '../config/firebase';
import { EmailService } from '../services/email.service';

const router = express.Router();
const emailService = new EmailService();
const stripeService = new StripeService(emailService);

// Create checkout session
router.post('/create-checkout', withAuth(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.auth!.uid;
    
    console.log('Creating checkout session for user:', userId);
    
    const session = await stripeService.createCheckoutSession(userId);
    console.log('Checkout session created:', session.id);

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
}));

// Create customer portal session
router.post('/create-customer-portal-session', withAuth(async (req: AuthenticatedRequest, res: Response) => {
  console.log('Request received for /create-customer-portal-session');
  try {
    const userId = req.auth!.uid;

    // Determine the return URL (back to the profile page)
    const returnUrl = `${process.env['CLIENT_URL']}/profile`; // Adjust if your profile URL is different
    console.log(`Attempting to create portal session for user ${userId}, returning to ${returnUrl}`);

    const portalSession = await stripeService.createCustomerPortalSession(userId, returnUrl);
    console.log(`Portal session created successfully for user ${userId}`);

    res.json({ url: portalSession.url });
  } catch (error) {
    console.error('Error creating customer portal session:', error);
    // Provide a more specific error message if possible
    const errorMessage = error instanceof Error ? error.message : 'Failed to create customer portal session';
    if (errorMessage.includes('Stripe Customer ID not found')) {
        res.status(404).json({ error: 'Customer subscription data not found.' });
    } else {
        res.status(500).json({ error: errorMessage });
    }
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
    const userId = req.auth!.uid;
    
    console.log('Getting subscription status for user:', userId);
    
    const status = await stripeService.getSubscriptionStatus(userId);
    console.log('Subscription status retrieved:', status);

    res.json({
      success: true,
      status: status || 'inactive',
      plan: status === 'active' ? 'premium' : 'free',
      features: {
        emotionalDuaSearch: status === 'active',
        aiTafsirChat: status === 'active',
        duaInsights: status === 'active'
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