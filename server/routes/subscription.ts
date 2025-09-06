import express, { Request, Response, NextFunction } from 'express';
import { StripeService } from '../services/stripe.service';
import { AuthenticatedRequest } from '../types/express';
import { withAuth } from '../middleware/auth';
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

// Get subscription status
router.get('/status', withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  console.log('Subscription status request received');
  try {
    const userId = req.auth!.uid;
    console.log('[GET /status] Getting subscription status for user:', userId);

    // 1. Fetch status from MongoDB FIRST (Primary Source of Truth)
    const dbStatus = await stripeService.getSubscriptionStatus(userId);
    console.log(`[GET /status] Fetched DB status for ${userId}:`, dbStatus);

    // 2. Fetch Firebase custom claims (Secondary/Confirmation)
    let claims: any = {};
    let claimsStatus = 'unknown';
    try {
      const userRecord = await auth.getUser(userId);
      claims = userRecord.customClaims || {};
      claimsStatus = claims.subscriptionStatus || 'not_set';
      console.log(`[GET /status] Fetched claims for ${userId}:`, { premium: claims.premium, status: claimsStatus });
    } catch (claimError) {
      console.error(`[GET /status] Error fetching claims for ${userId}:`, claimError);
      // Non-critical error, proceed with DB status
    }

    // 3. Determine effective status (Prioritize DB status)
    // Use DB status primarily. If DB is inactive, double-check claims just in case.
    let effectiveStatus = dbStatus || 'inactive'; 
    const isPremiumDB = effectiveStatus === 'active' || effectiveStatus === 'trialing';
    const isPremiumClaim = claims.premium === true || claimsStatus === 'active' || claimsStatus === 'trialing';

    // If DB says inactive but claims say active, trust claims (potential DB update lag?)
    if (!isPremiumDB && isPremiumClaim) {
        console.warn(`[GET /status] Discrepancy for ${userId}: DB status is '${effectiveStatus}' but claims indicate premium (${claimsStatus}). Trusting claims.`);
        effectiveStatus = claimsStatus; // Use the status from claims if it indicates active
    } else if (isPremiumDB && !isPremiumClaim) {
        console.warn(`[GET /status] Discrepancy for ${userId}: DB status is '${effectiveStatus}' but claims do NOT indicate premium (${claimsStatus}). Trusting DB.`);
        // Keep effectiveStatus as is (from DB)
    }
    
    console.log(`[GET /status] Effective status for ${userId}: ${effectiveStatus} (DB: ${dbStatus}, Claim Status: ${claimsStatus})`);

    // 4. Construct response based on effective status
    const isEffectivelyPremium = effectiveStatus === 'active' || effectiveStatus === 'trialing';

    res.json({
      success: true,
      status: effectiveStatus,
      plan: isEffectivelyPremium ? 'premium' : 'free',
      features: {
        emotionalDuaSearch: isEffectivelyPremium,
        aiTafsirChat: isEffectivelyPremium,
        duaInsights: isEffectivelyPremium
        // Add other features if they depend on premium status
      }
    });

  } catch (error) {
    console.error('[GET /status] Error getting subscription status:', error);
    next(error);
  }
}));

export default router; 