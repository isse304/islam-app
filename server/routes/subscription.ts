import express, { Request, Response, NextFunction } from 'express';
import { StripeService } from '../services/stripe.service';
import { withAuth, AuthenticatedRequest } from '../middleware/auth';
import { auth } from '../config/firebase';
import { EmailService } from '../services/email.service';

const router = express.Router();
const emailService = new EmailService();
const stripeService = new StripeService(emailService);

// Create checkout session
router.post('/create-checkout', withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.uid;
    
    console.log('Creating checkout session for user:', userId);
    
    const session = await stripeService.createCheckoutSession(userId);
    console.log('Checkout session created:', session.id);

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    next(error);
  }
}));

// Create customer portal session
router.post('/create-customer-portal-session', withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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
    next(error);
  }
}));

// Handle webhook events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await stripeService.handleWebhookEvent(req, res);
  } catch (error) {
    console.error('Error during webhook processing in route:', error);
    if (!res.headersSent) {
        next(error);
    }
  }
});

// Get subscription status
router.get('/status', withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  console.log('Subscription status request received');
  try {
    const userId = req.auth!.uid;
    console.log('Getting subscription status for user:', userId);

    // 1. Fetch Firebase custom claims
    let claims: any = {};
    try {
      const userRecord = await auth.getUser(userId);
      claims = userRecord.customClaims || {};
      console.log(`[GET /status] Fetched claims for ${userId}:`, claims);
    } catch (claimError) {
      console.error(`[GET /status] Error fetching claims for ${userId}:`, claimError);
      // Decide if we should proceed without claims or return an error
      // For now, proceed and rely on DB status
    }

    // 2. Fetch status from MongoDB (as fallback or for comparison)
    const dbStatus = await stripeService.getSubscriptionStatus(userId);
    console.log(`[GET /status] Fetched DB status for ${userId}:`, dbStatus);

    // 3. Determine effective status (prioritize claims)
    const isPremiumClaim = claims.premium === true || claims.subscriptionStatus === 'active';
    const effectiveStatus = isPremiumClaim ? 'active' : (dbStatus || 'inactive');
    console.log(`[GET /status] Effective status for ${userId}: ${effectiveStatus} (Claim: ${isPremiumClaim}, DB: ${dbStatus})`);

    // 4. Construct response based on effective status
    res.json({
      success: true,
      status: effectiveStatus,
      plan: effectiveStatus === 'active' ? 'premium' : 'free',
      features: {
        emotionalDuaSearch: effectiveStatus === 'active',
        aiTafsirChat: effectiveStatus === 'active',
        duaInsights: effectiveStatus === 'active'
        // Add other features if they depend on premium status
      }
    });

  } catch (error) {
    console.error('Error getting subscription status:', error);
    next(error);
  }
}));

export default router; 