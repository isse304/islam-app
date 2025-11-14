import Stripe from 'stripe';
import { UserUsage } from '../models/UserUsage';
import { Request, Response } from 'express';
import { auth } from '../config/firebase';
import { EmailService } from './email.service';
import { UserSubscription, IUserSubscription } from '../models/UserSubscription';
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables

export class StripeService {
    private stripe: Stripe;
    private priceId: string;
    private emailService: EmailService;
    private webhookSecret: string;

    constructor(emailService: EmailService) {
        if (!process.env['STRIPE_SECRET_KEY'] || !process.env['STRIPE_WEBHOOK_SECRET']) {
            throw new Error('Stripe secret key or webhook secret not configured');
        }

        this.stripe = new Stripe(process.env['STRIPE_SECRET_KEY'], { apiVersion: '2023-10-16' });
        this.priceId = process.env['STRIPE_PRICE_ID'] || '';
        this.emailService = emailService;
        this.webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];
    }

    private async getOrCreateUsageRecord(userId: string): Promise<any> {
        try {
            let usage = await UserUsage.findOne({ userId });
            if (!usage) {
                usage = await UserUsage.create({
                    userId,
                    status: 'free',
                    aiRequests: { count: 0, lastReset: new Date() },
                    currentPeriodEnd: new Date()
                });
            }
            return usage;
        } catch (error) {
            // console.error(`Error getting/creating usage record for user ${userId}:`, error);
            
            // In development, provide a fallback mock record
            if (process.env['NODE_ENV'] === 'development') {
                // console.log('Returning mock usage record in development mode');
                return {
                    userId,
                    status: 'free',
                    save: async () => console.log('Mock save operation')
                };
            }
            throw error;
        }
    }

    async createCheckoutSession(userId: string, priceId = process.env['STRIPE_PRICE_ID']): Promise<Stripe.Checkout.Session> {
        // console.log(`[Stripe] Creating checkout session for user ${userId} and price ${priceId}`);
        if (!priceId) {
            throw new Error('Stripe Price ID not configured in environment variables.');
        }

        // Find or create Stripe Customer ID associated with Firebase UID
        let userSubscription = await UserSubscription.findOne({ userId });
        let stripeCustomerId: string | undefined;

        // --- ADD TEST MODE CHECK ---
        const isTestMode = process.env['STRIPE_SECRET_KEY']?.startsWith('sk_test_');
        // -------------------------

        if (userSubscription && userSubscription.stripeCustomerId && !isTestMode) { // <-- Check for !isTestMode
            // Only use existing customer ID if NOT in test mode OR if it's guaranteed to be a test customer ID
            // For simplicity, we'll just force new customer creation in test mode if an ID is found
            stripeCustomerId = userSubscription.stripeCustomerId;
            // console.log(`[Stripe] Found existing Stripe Customer ID: ${stripeCustomerId} for user ${userId}. Ensuring metadata is current...`);
            try {
                // *** ADDED BLOCK: Force update metadata for existing customer ***
                await this.stripe.customers.update(stripeCustomerId, {
                    metadata: { firebaseUID: userId } // Ensure the current Firebase UID is set
                });
                // console.log(`[Stripe] Updated metadata for existing customer ${stripeCustomerId}`);
                // *** END OF ADDED BLOCK ***
            } catch (updateError) {
                 // console.error(`[Stripe] Failed to update metadata for existing customer ${stripeCustomerId}:`, updateError);
                 // Optional: Decide if you want to proceed or throw an error.
                 // Proceeding might be okay if metadata update isn't strictly critical for checkout itself,
                 // but it's critical for the webhook later. Throwing an error might be safer.
                 // For now, we log the error and proceed.
            }
        } else if (isTestMode && userSubscription && userSubscription.stripeCustomerId) {
             // console.log(`[Stripe] TEST MODE: Ignoring potentially live customer ID ${userSubscription.stripeCustomerId} found for user ${userId}. Will create a new test customer.`);
             // Let stripeCustomerId remain undefined so a new one is created below
        }
        
        // If no valid stripeCustomerId is set yet (either not found, or ignored in test mode)
        if (!stripeCustomerId) {
           try {
                // Fetch user email from Firebase Auth
            const userRecord = await auth.getUser(userId);
                const email = userRecord.email;

                if (!email) {
                    // console.warn(`[Stripe] User ${userId} does not have an email address in Firebase Auth. Creating Stripe customer without email.`);
                }

                // console.log(`[Stripe] Creating new Stripe Customer for user ${userId}${email ? ' with email ' + email : ''} (Mode: ${isTestMode ? 'Test' : 'Live'})`);
                const customer = await this.stripe.customers.create({
                    email: email, // Associate email if available
                    metadata: { firebaseUID: userId } // Link Firebase UID in metadata
                });
                stripeCustomerId = customer.id;
                // console.log(`[Stripe] Created new Stripe Customer ID: ${stripeCustomerId} for user ${userId}`);

                // Save the new customer ID back to our database
                if (userSubscription) {
                    userSubscription.stripeCustomerId = stripeCustomerId;
                    await userSubscription.save();
                } else {
                    await UserSubscription.create({ userId, stripeCustomerId, status: 'inactive' });
                }
            } catch (error) {
                // console.error(`[Stripe] Error creating Stripe customer or fetching user email for ${userId}:`, error);
                throw new Error('Failed to prepare Stripe customer.');
            }
        }

        try {
            const session = await this.stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{ price: priceId, quantity: 1 }],
                mode: 'subscription',
                success_url: `${process.env['CLIENT_URL']}/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env['CLIENT_URL']}/subscription?canceled=true`,
                customer: stripeCustomerId, // Use the determined Stripe Customer ID
                subscription_data: {
                    trial_period_days: 7, // Add a 7-day free trial
                },
                // Add client_reference_id to link session back to Firebase user
                client_reference_id: userId,
                // Optionally allow promotion codes
                allow_promotion_codes: true,
                 // Automatic tax calculation (configure in Stripe dashboard)
                automatic_tax: { enabled: true },
                // Collect billing address if needed
                billing_address_collection: 'auto', // 'required' or 'auto'
                customer_update: { address: 'auto' },
                // To prefill email if creating customer here (not needed if using existing customer)
                // customer_email: email // Only if customer ID is not provided
            });
            // console.log(`[Stripe] Checkout session ${session.id} created for user ${userId}`);
            return session;
        } catch (error) {
            // console.error(`[Stripe] Error creating Stripe checkout session for user ${userId}:`, error);
            throw error; // Re-throw the error to be caught by the route handler
        }
    }

    async createCustomerPortalSession(userId: string, returnUrl: string): Promise<Stripe.BillingPortal.Session> {
        // console.log(`[Stripe] Attempting to create portal session for user ${userId}`);
        const userSubscription = await UserSubscription.findOne({ userId });

        if (!userSubscription || !userSubscription.stripeCustomerId) {
            // console.error(`[Stripe] Stripe Customer ID not found for user ${userId}`);
            throw new Error('Stripe Customer ID not found for this user.');
        }

        const stripeCustomerId = userSubscription.stripeCustomerId;
        // console.log(`[Stripe] Found Stripe Customer ID ${stripeCustomerId} for user ${userId}. Creating portal session with return URL: ${returnUrl}`);

        try {
            const portalSession = await this.stripe.billingPortal.sessions.create({
                customer: stripeCustomerId,
                return_url: returnUrl,
            });
            // console.log(`[Stripe] Customer portal session created for user ${userId}`);
            return portalSession;
        } catch (error) {
            // console.error(`[Stripe] Error creating Stripe customer portal session for user ${userId} (Customer ID: ${stripeCustomerId}):`, error);
            throw error; // Re-throw the error
        }
    }

    async getSubscriptionStatus(userId: string): Promise<string> {
        const userSubscription = await UserSubscription.findOne({ userId });
        return userSubscription?.status || 'inactive';
    }

    async handleWebhookEvent(req: Request, res: Response): Promise<void> {
        const sig = req.headers['stripe-signature'] as string;
        const rawBody = req.body; // Use req.body provided by express.raw()

        console.log('[Webhook Handler] Starting webhook processing...'); // Log start
        console.log('[Webhook Handler] Body type:', typeof rawBody, 'Is Buffer?', Buffer.isBuffer(rawBody), 'Length:', rawBody?.length); // Log body info

        if (!sig) {
            console.error('[Webhook Handler] Error: Missing stripe-signature header');
            res.status(400).send('Webhook Error: Missing stripe-signature header');
            return;
        }
        if (!this.webhookSecret) {
            console.error('[Webhook Handler] Error: Webhook secret is not configured on the server.');
            res.status(500).send('Webhook Configuration Error');
            return;
        }
        // Ensure req.body is a Buffer (it should be, thanks to express.raw)
        if (!Buffer.isBuffer(rawBody)) {
             console.error('[Webhook Handler] Error: Request body is not a Buffer. Ensure express.raw() is used correctly.');
             // Log the body type and content for debugging if not a buffer
             console.error('[Webhook Handler] Received body type:', typeof rawBody);
             // Be cautious logging the body itself in production if it might contain sensitive info
             // console.error('[Webhook Handler] Received body content:', rawBody); 
             res.status(400).send('Webhook Error: Invalid request body format.');
             return;
        }

        let event: Stripe.Event;
        try {
            console.log('[Webhook Handler] ========================================');
            console.log('[Webhook Handler] Attempting to construct event...');
            console.log(`[Webhook Handler] Using Webhook Secret (Prefix): ${this.webhookSecret?.substring(0, 8)}...`);
            console.log('[Webhook Handler] Raw Body Length:', rawBody.length);
            // Use the rawBody from req.body directly
            event = this.stripe.webhooks.constructEvent(rawBody, sig, this.webhookSecret);
            console.log(`[Webhook Handler] ✅ Event constructed successfully`);
            console.log(`[Webhook Handler] Event Type: ${event.type}`);
            console.log(`[Webhook Handler] Event ID: ${event.id}`);
            console.log('[Webhook Handler] ========================================');
        } catch (err: any) {
            console.error('[Webhook Handler] ❌ Signature verification failed');
            console.error('[Webhook Handler] Error:', err.message);
            console.error('[Webhook Handler] Webhook Secret Used (Prefix):', this.webhookSecret?.substring(0, 8));
            console.error('[Webhook Handler] Signature Header Received:', sig);
            console.error('[Webhook Handler] Raw Body Length:', rawBody.length);
            console.error('[Webhook Handler] ========================================');
            res.status(400).send(`Webhook Error: ${err.message}`);
            return;
        }
        // --- END: Perform signature verification HERE ---\


        // --- START: Event Processing Logic ---
        // Moved the processing logic outside the req.on('end') block
        let userId: string | undefined;
        let userSub: IUserSubscription | null = null;
        const adminEmail = process.env['ALERT_EMAIL'];

        try {
            console.log(`[Webhook] Processing event type: ${event.type}`);
            switch (event.type) {
                // --- Cases for checkout.session.completed, customer.subscription.* --- 
                // --- (Keep existing logic within these cases) ---
                case 'checkout.session.completed':
                    const session = event.data.object as Stripe.Checkout.Session;
                    userId = session.client_reference_id ?? session.metadata?.userId;
                    console.log(`[Webhook ${event.type}] 📝 Session ID: ${session.id}`);
                    console.log(`[Webhook ${event.type}] 👤 User ID: ${userId}`);
                    console.log(`[Webhook ${event.type}] 💳 Subscription ID: ${session.subscription}`);
                    if (!userId) {
                        console.error(`[Webhook ${event.type}] ❌ Error: userId missing in session ${session.id}`);
                        // Send response directly from here
                        if (!res.headersSent) res.status(400).send('Webhook Error: Missing userId');
                        return;
                    }
                    if (session.subscription) {
                        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
                        console.log(`[Webhook ${event.type}] 📥 Retrieving subscription details...`);
                        const subscriptionDetails = await this.stripe.subscriptions.retrieve(subscriptionId);
                        console.log(`[Webhook ${event.type}] ✅ Subscription retrieved: ${subscriptionDetails.status}`);
                        
                        console.log(`[Webhook ${event.type}] 💾 Updating database...`);
                        userSub = await this.updateUserSubscriptionStatus(userId, subscriptionDetails);
                        if (userSub) {
                            console.log(`[Webhook ${event.type}] ✅ Database updated: ${userSub.status}`);
                            console.log(`[Webhook ${event.type}] 🔐 Updating Firebase claims...`);
                            await this.updateFirebaseClaims(userId, userSub.status, userSub.currentPeriodEnd ?? null);
                            console.log(`[Webhook ${event.type}] ✅ Firebase claims updated`);
                            // Update UserUsage aiRequestLimit
                            try {
                                const premiumLimit = parseInt(process.env['DAILY_USER_LIMIT'] || '30');
                                const statusToUseForLimit = userSub.status;
                                const limitToSet = (statusToUseForLimit === 'active' || statusToUseForLimit === 'trialing') ? premiumLimit : 0;
                                await UserUsage.findOneAndUpdate(
                                    { userId: userId },
                                    { $set: { aiRequestLimit: limitToSet, status: (limitToSet > 0 ? 'premium' : 'free') } },
                                    { new: true, upsert: true, setDefaultsOnInsert: true }
                                );
                            } catch (usageUpdateError) {
                                console.error(`[Webhook ${event.type}] ERROR updating UserUsage aiRequestLimit for user ${userId}:`, usageUpdateError);
                            }
                            // Email Logic
                            const statusToUse = userSub.status;
                            if (statusToUse === 'active' || statusToUse === 'trialing') {
                                let userEmail: string | undefined;
                                let userName: string | undefined;
                                try {
                                    const userRecord = await auth.getUser(userId);
                                    userEmail = userRecord.email;
                                    userName = userRecord.displayName || userRecord.email?.split('@')[0] || 'Friend';
                                } catch (authError) { /* ... */ }
                                if (userEmail && userSub && !userSub.welcomeEmailSent) {
                                    try {
                                        await this.emailService.sendWelcomeEmail(userEmail, userName || 'Friend');
                                        userSub.welcomeEmailSent = true;
                                        await userSub.save();
                                    } catch (emailError) { /* ... */ }
                                }
                            }
                        } else {
                            console.error(`[Webhook ${event.type}] ❌ Failed to update DB/claims after checkout for user ${userId}`);
                            console.error(`[Webhook ${event.type}] This is critical - subscription payment succeeded but status not updated!`);
                        }
                    } else {
                         console.warn(`[Webhook ${event.type}] ⚠️  Checkout session ${session.id} completed, but no subscription ID found.`);
                    }
                    console.log(`[Webhook ${event.type}] ✅ Processing complete`);
                    break;

                case 'customer.subscription.created':
                case 'customer.subscription.updated':
                    const subscription = event.data.object as Stripe.Subscription;
                    userId = subscription.metadata?.userId;
                    if (!userId && typeof subscription.customer === 'string') {
                       try {
                            const customer = await this.stripe.customers.retrieve(subscription.customer);
                            if (!customer.deleted) userId = customer.metadata?.firebaseUID;
                       } catch (custError) { /* ... */ }
                    }
                    if (!userId) {
                        console.error(`[Webhook ${event.type}] Error: userId missing`, subscription.id);
                        if (!res.headersSent) res.status(400).send('Webhook Error: Missing userId');
                        return;
                    }
                    try {
                        userSub = await this.updateUserSubscriptionStatus(userId, subscription);
                        const statusToUse = userSub?.status || subscription.status;
                        let periodEndToUse: Date | null = null;
                        const rawPeriodEndFromDb = userSub?.currentPeriodEnd ?? null;
                        const rawPeriodEndFromEvent = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null;
                        const finalRawPeriodEnd = rawPeriodEndFromDb ?? rawPeriodEndFromEvent;
                        if (finalRawPeriodEnd instanceof Date) periodEndToUse = finalRawPeriodEnd;
                        
                        await this.updateFirebaseClaims(userId, statusToUse, periodEndToUse);
                        
                        // Update UserUsage aiRequestLimit
                        try {
                            const premiumLimit = parseInt(process.env['DAILY_USER_LIMIT'] || '30');
                            const limitToSet = (statusToUse === 'active' || statusToUse === 'trialing') ? premiumLimit : 0;
                            await UserUsage.findOneAndUpdate(
                                { userId: userId },
                                { $set: { aiRequestLimit: limitToSet, status: (limitToSet > 0 ? 'premium' : 'free') } },
                                { new: true, upsert: true, setDefaultsOnInsert: true }
                            );
                        } catch (usageUpdateError) {
                            console.error(`[Webhook ${event.type}] ERROR updating UserUsage aiRequestLimit for user ${userId}:`, usageUpdateError);
                        }

                        // Email Logic
                        let userEmail: string | undefined;
                        let userName: string | undefined;
                        try {
                            const userRecord = await auth.getUser(userId);
                            userEmail = userRecord.email;
                            userName = userRecord.displayName || userRecord.email?.split('@')[0] || 'Friend';
                        } catch (authError) { /* ... */ }
                        
                        if (userEmail && (statusToUse === 'active' || statusToUse === 'trialing') && userSub && !userSub.welcomeEmailSent) {
                            try {
                                await this.emailService.sendWelcomeEmail(userEmail, userName || 'Friend');
                                userSub.welcomeEmailSent = true;
                                await userSub.save();
                            } catch (emailError) { /* ... */ }
                        }

                        // Admin Notification
                        if (adminEmail) {
                            const subject = `🚀 Subscription ${event.type === 'customer.subscription.created' ? 'Created' : 'Updated'} for ${userEmail || userId}`;
                            const text = `User ${userEmail || userId} subscription details:\\nStatus: ${statusToUse}\\nSub ID: ${subscription.id}\\nCustomer ID: ${subscription.customer}\\nPeriod End: ${periodEndToUse?.toLocaleDateString() || 'N/A'}`;
                            try { await this.emailService.sendEmail(adminEmail, subject, text); } catch (emailError) { /* ... */ }
                        }
                    } catch (innerError: any) {
                        console.error(`[Webhook ${event.type}] Caught inner error during processing for user ${userId}:`, innerError);
                    }
                    break;

                case 'customer.subscription.deleted':
                    const deletedSubscription = event.data.object as Stripe.Subscription;
                    userId = deletedSubscription.metadata?.userId;
                    if (!userId && typeof deletedSubscription.customer === 'string') {
                       try {
                            const customer = await this.stripe.customers.retrieve(deletedSubscription.customer);
                            if (!customer.deleted) userId = customer.metadata?.firebaseUID;
                       } catch (custError) { /* ... */ }
                    }
                    if (!userId) {
                        console.error(`[Webhook ${event.type}] Error: userId missing`, deletedSubscription.id);
                        if (!res.headersSent) res.status(400).send('Webhook Error: Missing userId');
                        return;
                    }

                    let deletedUserEmail: string | undefined;
                    try {
                        const userRecord = await auth.getUser(userId);
                        deletedUserEmail = userRecord.email;
                    } catch (authError) { /* ... */ }
                    
                    await UserSubscription.findOneAndUpdate(
                        { userId: userId }, 
                        { status: 'canceled', currentPeriodEnd: null, cancelAtPeriodEnd: false, updatedAt: new Date() }, 
                        { new: true }
                    );
                    await this.updateFirebaseClaims(userId, 'canceled', null);

                    // Send Cancellation Email to User
                    if (deletedUserEmail) {
                        const subject = 'Your NuraAI Subscription Has Been Canceled';
                        const text = `Assalamu alaikum,\\n\\nYour NuraAI Premium subscription has been canceled. \\n\\nIf you believe this was in error, please contact support.\\n\\nWe hope to see you back soon!\\n\\nThe NuraAI Team`;
                        try { await this.emailService.sendEmail(deletedUserEmail, subject, text); } catch (emailError) { /* ... */ }
                    }

                    // Send Cancellation Notification to Admin
                    if (adminEmail) {
                         const subject = `❌ Subscription Canceled for ${deletedUserEmail || userId}`;
                        const text = `User ${deletedUserEmail || userId} subscription has been canceled.\\nStripe Sub ID: ${deletedSubscription.id}\\nStripe Customer ID: ${deletedSubscription.customer}`;
                        try { await this.emailService.sendEmail(adminEmail, subject, text); } catch (emailError) { /* ... */ }
                    }
                    break;

                default:
                    console.log(`[Webhook] Unhandled event type ${event.type}`);
            }

            // Send success response AFTER processing is complete
            console.log(`[Webhook] Finished processing event type: ${event.type}. Sending 200 OK.`);
            if (!res.headersSent) {
                res.status(200).json({ received: true });
            }

        } catch (processingError: any) {
            console.error(`[Webhook] Error processing event type ${event?.type || 'unknown'}:`, processingError);
            if (!res.headersSent) {
                 res.status(500).json({ error: 'Webhook processed, but internal error occurred.', details: processingError.message });
            }
        }
        // --- END: Event Processing Logic ---
    }

    private async updateFirebaseClaims(userId: string, status: string, periodEnd: Date | null): Promise<void> {
        const isActive = status === 'active' || status === 'trialing';
        
        console.log(`[Claims] 📝 Preparing to update claims for user ${userId}`);
        
        try {
            // Get existing claims first to preserve role and other custom claims
            const userRecord = await auth.getUser(userId);
            const existingClaims = userRecord.customClaims || {};
            
            console.log(`[Claims] 📋 Existing claims:`, JSON.stringify(existingClaims, null, 2));
            
            // Merge subscription claims with existing claims
            const updatedClaims = {
                ...existingClaims, // Preserve existing claims (like role, admin, etc.)
                subscriptionStatus: status,
                premium: isActive,
                subscriptionEnd: isActive && periodEnd ? Math.floor(periodEnd.getTime() / 1000) : null
            };
            
            console.log(`[Claims] 🔄 Updated claims:`, JSON.stringify(updatedClaims, null, 2));
            
            await auth.setCustomUserClaims(userId, updatedClaims);
            console.log(`[Claims] ✅ Successfully updated Firebase claims for user ${userId}`);
            console.log(`[Claims] Premium: ${updatedClaims.premium}, Status: ${updatedClaims.subscriptionStatus}`);
            if (existingClaims.role) {
                console.log(`[Claims] ✅ Role preserved: ${existingClaims.role}`);
            }
        } catch (error: any) {
            console.error(`[Claims] ❌ Error during setCustomUserClaims for user ${userId}`);
            console.error(`[Claims] Status trying to set: ${status}`);
            console.error(`[Claims] Error details:`, error.message);
            console.error(`[Claims] Stack:`, error.stack);
            throw error;
        }
    }

    private async updateUserSubscriptionStatus(userId: string, subscription: Stripe.Subscription): Promise<IUserSubscription | null> {
        const currentStatus = subscription.status.toLowerCase();
        const isPremiumActive = currentStatus === 'active' || currentStatus === 'trialing';

        const updateData = {
            stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
            stripeSubscriptionId: subscription.id,
            status: currentStatus,
            plan: isPremiumActive ? 'premium' : 'free',
            planId: subscription.items.data[0]?.price.id,
            currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            updatedAt: new Date()
        };
        
        console.log(`[DB Update] 📝 Preparing to update UserSubscription for user ${userId}`);
        console.log(`[DB Update] Data:`, JSON.stringify(updateData, null, 2));
        
        try {
            const userSub = await UserSubscription.findOneAndUpdate(
                { userId },
                updateData,
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            console.log(`[DB Update] ✅ Successfully upserted UserSubscription for user ${userId}`);
            console.log(`[DB Update] Status: ${userSub.status}, Plan: ${userSub.plan}, Doc ID: ${userSub._id}`);
            return userSub;
        } catch (error: any) {
            console.error(`[DB Update] ❌ Error during UserSubscription.findOneAndUpdate for user ${userId}`);
            console.error(`[DB Update] Status trying to set: ${updateData.status}`);
            console.error(`[DB Update] Error details:`, error.message);
            console.error(`[DB Update] Stack:`, error.stack);
            return null;
        }
    }

    /**
     * Fetches all active subscriptions for a given Stripe Customer ID.
     * @param customerId The Stripe Customer ID.
     * @returns A promise that resolves to an array of active Stripe Subscription objects.
     */
    async getActiveSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
        // console.log(`[StripeService] Fetching active subscriptions for customer: ${customerId}`);
        try {
            const subscriptions = await this.stripe.subscriptions.list({
                customer: customerId,
                status: 'active',
                limit: 10, // Adjust limit as needed, though most users have 1
            });
            // console.log(`[StripeService] Found ${subscriptions.data.length} active subscriptions.`);
            return subscriptions.data;
        } catch (error) {
            // console.error(`[StripeService] Error fetching active subscriptions for customer ${customerId}:`, error);
            throw error; // Re-throw the error to be handled by the caller
        }
    }

    /**
     * Cancels a Stripe subscription immediately (at the end of the current period is default).
     * @param subscriptionId The ID of the Stripe subscription to cancel.
     * @returns A promise that resolves to the cancelled Stripe Subscription object.
     */
    async cancelSubscriptionImmediately(subscriptionId: string): Promise<Stripe.Subscription> {
        // console.log(`[StripeService] Cancelling subscription immediately: ${subscriptionId}`);
        try {
            const cancelledSubscription = await this.stripe.subscriptions.cancel(subscriptionId);
            // To cancel immediately instead of at period end, use update:
            // const cancelledSubscription = await this.stripe.subscriptions.update(subscriptionId, {
            //   cancel_at_period_end: false, // Might require immediate cancellation logic
            // });
            // Actually, subscriptions.cancel() is sufficient and preferred.
            // console.log(`[StripeService] Subscription ${subscriptionId} cancelled successfully.`);
            return cancelledSubscription;
        } catch (error) {
            // console.error(`[StripeService] Error cancelling subscription ${subscriptionId}:`, error);
            throw error; // Re-throw the error
        }
    }
} 